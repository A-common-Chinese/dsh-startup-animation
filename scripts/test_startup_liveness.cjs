// Failure-path playback checks against the shipped host, voice, and local client.
// Fake deadlines keep tests fast; the stream-abort case also uses real HTTP/fetch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const { once } = require('node:events');
const test = require('node:test');
const { createHarness, jsonResponse, settle } = require('./test_startup_browser.cjs');

async function flush() { for (let index = 0; index < 32; index++) await Promise.resolve(); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function clock() {
  let now = 0, id = 0;
  const pending = new Map();
  const timers = {
    setTimeout(callback, delay = 0, ...args) {
      const key = ++id;
      pending.set(key, { at: now + Math.max(0, Number(delay) || 0), callback: () => callback(...args) });
      return key;
    },
    clearTimeout(key) { pending.delete(key); },
  };
  return {
    timers, get now() { return now; },
    async advance(ms) {
      const target = now + ms;
      for (let iterations = 0; ; iterations++) {
        assert.ok(iterations < 10000, 'deadlines must not reschedule themselves indefinitely');
        const due = [...pending].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        now = due[1].at; pending.delete(due[0]); due[1].callback(); await flush();
      }
      now = target; await flush();
    },
  };
}

function voiceHarness(options = {}) {
  const time = options.time || clock(), sources = [], contexts = [], fetched = [];
  const resume = deferred(), decoding = deferred(), listeners = new Map();
  class AudioContext {
    constructor() { this.state = options.suspended ? 'suspended' : 'running'; this.destination = {}; contexts.push(this); }
    get currentTime() { return time.now / 1000; }
    resume() {
      if (options.suspended) return resume.promise.then(() => { this.state = 'running'; });
      this.state = 'running'; return Promise.resolve();
    }
    decodeAudioData() { return options.hungDecode ? decoding.promise : Promise.resolve({ duration: 1 }); }
    createBufferSource() {
      const player = {
        connect() {}, disconnect() { this.disconnected = true; },
        start() { this.started = true; if (options.naturalEnd) time.timers.setTimeout(() => this.onended?.(), this.buffer.duration * 1000); },
        stop() { this.stopped = true; /* Deliberately no ended event from the interrupted device. */ },
      };
      sources.push(player); return player;
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  const sandbox = {
    AudioContext, AbortController, performance: { now: () => time.now }, ...time.timers,
    addEventListener(type, callback) { listeners.set(type, callback); },
    fetch: async (url, { signal } = {}) => {
      fetched.push(url);
      if (options.hungFetch) return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      });
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/startup-voice.js'), 'utf8'), sandbox, { filename: 'startup-voice.js' });
  return { voice: sandbox.DSHVoice, time, sources, contexts, fetched, resume, decoding, hide: () => listeners.get('pagehide')?.() };
}

test('natural narration still owns its full tail before releasing the phase', async () => {
  const fixture = voiceHarness({ naturalEnd: true });
  await fixture.voice.unlock(); fixture.voice.phase(5); await flush();
  await fixture.time.advance(999); assert.equal(fixture.voice.busy, true);
  await fixture.time.advance(1); assert.equal(fixture.voice.busy, false);
  assert.equal(fixture.sources.length, 1);
  fixture.hide();
});

test('a missing audio ended event has a finite phase hold', async () => {
  const fixture = voiceHarness();
  await fixture.voice.unlock(); fixture.voice.phase(5); await flush();
  assert.equal(fixture.sources.length, 1);
  assert.equal(fixture.voice.busy, true);
  // The playback device stops advancing while the page remains visible.
  fixture.contexts[0].state = 'suspended';
  await fixture.time.advance(60000);
  assert.equal(fixture.voice.busy, false, 'a stopped device must not hold the final startup phase forever');
  assert.equal(fixture.sources[0].stopped, true, 'expired playback must be stopped before startup continues');
  fixture.hide();
});

test('a decode promise cannot outlive the asset deadline or play after timeout', async () => {
  const fixture = voiceHarness({ hungDecode: true });
  await fixture.voice.unlock(); fixture.voice.phase(2); await flush();
  await fixture.time.advance(11000);
  assert.equal(fixture.voice.busy, false, 'aborting fetch alone cannot cancel a pending Web Audio decode');
  fixture.decoding.resolve({ duration: 1 }); await flush();
  assert.equal(fixture.sources.length, 0, 'late decoder completion must not resurrect expired narration');
  fixture.hide();
});

test('a stalled audio download releases narration without inventing a voice', async () => {
  const fixture = voiceHarness({ hungFetch: true });
  await fixture.voice.unlock(); fixture.voice.phase(0); await flush();
  await fixture.time.advance(11000);
  assert.equal(fixture.voice.busy, false);
  assert.equal(fixture.sources.length, 0);
  fixture.hide();
});

test('a suspended narration resume promise has a bounded unlock wait', async () => {
  const fixture = voiceHarness({ suspended: true });
  let resolved = false;
  fixture.voice.unlock().then(() => { resolved = true; }); await flush();
  await fixture.time.advance(2500);
  assert.equal(resolved, true, 'a browser that never settles resume() must not disable the start control forever');
  fixture.voice.phase(0); await flush();
  assert.equal(fixture.voice.busy, false, 'unavailable audio must leave the visual sequence usable');
  fixture.resume.resolve(); await flush();
  assert.equal(fixture.sources.length, 0, 'late device activation must not start an obsolete clip');
  fixture.hide();
});

test('cancelled playback deadlines and old ended callbacks cannot stop a newer phase', async () => {
  const fixture = voiceHarness();
  await fixture.voice.unlock(); fixture.voice.phase(0); await flush();
  const old = fixture.sources[0];
  await fixture.time.advance(500);
  fixture.voice.cancel(); fixture.voice.phase(1); await flush();
  const current = fixture.sources[1];
  await fixture.time.advance(2600);
  old.onended?.(); await flush();
  assert.equal(fixture.voice.busy, true, 'the old phase must not clear the active flag of its replacement');
  assert.notEqual(current.stopped, true, 'an obsolete timeout must not stop the replacement source');
  current.onended?.(); await flush();
  assert.equal(fixture.voice.busy, false);
  await fixture.time.advance(60000);
  assert.equal(fixture.sources.length, 2, 'watchdogs must never restart narration');
  fixture.hide();
});

test('a hung synthetic score resume cannot trap the real preview start action', async () => {
  const time = clock();
  const host = createHarness({ delayAudio: true, timers: time.timers, search: '?style=laterano' });
  await settle(); host.tap(); await settle();
  assert.equal(host.element('play').disabled, true);
  await time.advance(2500); await settle(); host.frame(2501);
  assert.equal(host.element('play').disabled, false, 'score audio preparation must release the host start guard');
  assert.ok(host.drawStates.at(-1).time > 0, 'the presentation must continue when score audio is unavailable');
  host.releaseAudio(); await settle();
  assert.equal(host.sources.length, 0, 'late resume must not schedule the abandoned opening score');
  host.windowEvents.emit('pagehide');
});

test('the real final narration timeout completes an embedded presentation exactly once', async () => {
  const fixture = voiceHarness();
  const host = createHarness({ voice: fixture.voice, timers: fixture.time.timers, embedded: true,
    search: '?style=laterano&embed=1&parentOrigin=http%3A%2F%2F127.0.0.1%3A8770&channel=liveness-test-12345678',
    fetch: async url => url === '/api/profile' ? jsonResponse({ mode: 'local', token: 'liveness-test-token', username: 'OPERATOR', badge_id: 'TEST', visual_style: 'laterano' }) : jsonResponse({}, 404),
  });
  await settle(); host.element('seek').value = '16.6'; host.element('seek').emit('input');
  host.tap(); await settle(); await flush(); host.frame(1001);
  assert.equal(host.messages.filter(item => item.message.type === 'complete').length, 0, 'completion must retain the real narration tail');
  await fixture.time.advance(60000); await settle(); host.frame(60001);
  assert.equal(host.messages.filter(item => item.message.type === 'complete').length, 1, 'the watchdog must allow the verified parent to receive final completion');
  assert.equal(host.frames.size, 0);
  host.frame(120001); host.tap(); host.element('skip').emit('click'); await settle();
  assert.equal(host.messages.filter(item => ['complete', 'skip'].includes(item.message.type)).length, 1, 'late user input and deadlines cannot complete or replay an already removed film');
  fixture.hide(); host.windowEvents.emit('pagehide');
});

test('real fetch stream abort leaves loading with an honest failure result', { timeout: 10000 }, async () => {
  const headersSent = deferred();
  const server = http.createServer((request, response) => {
    if (request.url === '/api/access') { response.writeHead(404); response.end(); return; }
    if (request.url === '/api/profile') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ mode: 'local', token: 'liveness-test-token', username: 'OPERATOR', visual_style: 'laterano' })); return;
    }
    response.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    response.write(JSON.stringify({ type: 'stage', stage: 'skills', status: 'loading' }) + '\n');
    headersSent.resolve(); // The body deliberately never finishes by itself.
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`, time = clock();
  const sandbox = { AbortController, TextDecoder, ...time.timers };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/startup-local.js'), 'utf8'), sandbox, { filename: 'startup-local.js' });
  const client = new sandbox.DSHLocal.Client({ fetch: (url, options) => fetch(base + url, options) });
  try {
    assert.equal(await client.connect(), true);
    const loading = client.load(); await headersSent.promise;
    await time.advance(120001);
    assert.equal(await loading, false);
    assert.equal(client.inventory.status, 'error', 'an aborted body must leave the loading barrier instead of fabricating success');
    assert.equal(client.inventory.skills.length, 0);
    assert.equal(client.inventory.plugins.length, 0);
  } finally {
    client.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('negative frame deltas, completed idle frames, and replay keep a single animation loop', async () => {
  const host = createHarness({ search: '?style=laterano', fetch: async url => url === '/api/profile'
    ? jsonResponse({ mode: 'local', token: 'liveness-test-token', username: 'OPERATOR', badge_id: 'TEST', visual_style: 'laterano' })
    : jsonResponse({}, 404) }); await settle();
  host.tap(); await settle(); host.frame(1001);
  const before = host.drawStates.at(-1).time;
  host.frame(501); assert.equal(host.drawStates.at(-1).time, before, 'out-of-order timestamps must not rewind playback');
  host.element('seek').value = '16.6'; host.element('seek').emit('input'); host.tap(); await settle(); host.frame(5001);
  assert.equal(host.element('play').textContent, '重播');
  const completed = host.drawStates.at(-1).time;
  for (const at of [6001, 10001, 20001]) { host.frame(at); assert.equal(host.drawStates.at(-1).time, completed); assert.ok(host.frames.size <= 1); }
  host.element('replay').emit('click'); assert.equal(host.drawStates.at(-1).time, 0);
  for (let index = 0; index < 3; index++) host.windowEvents.emit('pageshow', { persisted: true });
  await settle(); assert.ok(host.frames.size <= 1, 'bfcache restoration must not multiply the requestAnimationFrame loop');
  host.windowEvents.emit('pagehide'); assert.equal(host.frames.size, 0);
});

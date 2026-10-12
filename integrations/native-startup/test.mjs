import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chooseNext, consumeNext, dataDirectory, profileInput, saveSettings, settings } from './state.mjs';
async function overlayHarness({ storage = new Map(), denied = '', instance = 'run-a', failAppend = false } = {}) {
  const { runInNewContext } = await import('node:vm');
  const listeners = new Map(), observers = new Set(), timers = new Map(), frames = [], buttons = [];
  const background = { nodeType: 1, inert: false }, alreadyInert = { nodeType: 1, inert: true };
  let requests = 0, restores = 0, timerId = 0;
  const body = { children: [background, alreadyInert], append(...nodes) {
    if (failAppend) throw new Error('mount failed');
    this.children.push(...nodes);
    for (const observer of observers) observer.callback([{ addedNodes: nodes }]);
  } };
  const make = tag => {
    const events = new Map();
    const node = { tag, nodeType: 1, style: {}, inert: false, contentWindow: {}, setAttribute() {},
      addEventListener(kind, callback) { events.set(kind, callback); }, removeEventListener(kind) { events.delete(kind); },
      focus() {}, remove() { body.children = body.children.filter(child => child !== node); node.removed = true; },
      fire(kind, event = {}) { events.get(kind)?.(event); } };
    (tag === 'iframe' ? frames : buttons).push(node);
    return node;
  };
  const window = {
    addEventListener(kind, callback) { if (!listeners.has(kind)) listeners.set(kind, new Set()); listeners.get(kind).add(callback); },
    removeEventListener(kind, callback) { listeners.get(kind)?.delete(callback); },
  };
  const context = {
    fetch: async () => { requests++; return { ok: true, json: async () => ({ enabled: true, instance }) }; },
    crypto: { randomUUID: () => '01234567-89ab-cdef-0123-456789abcdef' }, URLSearchParams,
    location: { origin: 'http://127.0.0.1:3080' },
    sessionStorage: {
      getItem(key) { if (denied === 'read') throw new Error('storage disabled'); return storage.get(key) ?? null; },
      setItem(key, value) { if (denied === 'write') throw new Error('quota denied'); storage.set(key, value); },
    },
    document: { readyState: 'complete', documentElement: { dataset: {} }, createElement: make, body,
      activeElement: { isConnected: true, inert: false, focus() { restores++; } } },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.add(this); } disconnect() { observers.delete(this); }
    }, window, console: { warn() {} },
    setTimeout(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const source = readFileSync(new URL('./overlay.mjs', import.meta.url), 'utf8');
  const run = async () => { runInNewContext(source, context); await new Promise(resolve => setImmediate(resolve)); };
  const send = type => {
    const frame = frames[0], channel = new URL(frame.src, context.location.origin).searchParams.get('channel');
    for (const handler of [...listeners.get('message') ?? []]) handler({ origin: context.location.origin, source: frame.contentWindow, data: { source: 'dsh-startup', channel, type } });
  };
  return { run, send, frames, buttons, background, alreadyInert, observers, timers, listeners, storage,
    requests: () => requests, restores: () => restores };
}

test('duplicate native overlay injection creates only one interactive frame', async () => {
  const h = await overlayHarness();
  await Promise.all([h.run(), h.run()]);
  assert.equal(h.requests(), 1);
  assert.equal(h.frames.length, 1);
  assert.equal(h.frames[0].inert, false);
  assert.equal(h.buttons[0].inert, false);
  h.send('skip');
});

test('an interrupted opening is not replayed by a host-page reload', async () => {
  const first = await overlayHarness();
  await first.run(); first.send('ready');
  const reloaded = await overlayHarness({ storage: first.storage });
  await reloaded.run();
  assert.equal(reloaded.frames.length, 0);
  first.send('complete');
  const completed = await overlayHarness({ storage: first.storage });
  await completed.run(); assert.equal(completed.frames.length, 0);
  const newServer = await overlayHarness({ storage: first.storage, instance: 'run-b' });
  await newServer.run(); assert.equal(newServer.frames.length, 1); newServer.send('skip');
});

test('unavailable tab storage bypasses the optional film instead of reopening it on every reload', async () => {
  for (const denied of ['read', 'write']) {
    const h = await overlayHarness({ denied });
    await h.run();
    assert.equal(h.frames.length, 0);
    assert.equal(h.background.inert, false);
    assert.equal(h.observers.size, 0);
  }
});

test('native return control survives iframe failure after ready and restores the host exactly once', async () => {
  const h = await overlayHarness();
  await h.run(); h.send('ready');
  assert.equal(h.timers.size, 0);
  assert.equal(h.buttons.length, 1);
  assert.equal(h.buttons[0].inert, false);
  h.buttons[0].fire('click');
  h.frames[0].fire('error'); // A late load error must not run cleanup twice.
  assert.equal(h.background.inert, false);
  assert.equal(h.alreadyInert.inert, true);
  assert.equal(h.frames[0].removed, true);
  assert.equal(h.buttons[0].removed, true);
  assert.equal(h.restores(), 1);
  assert.equal(h.observers.size, 0);
});

test('a partially mounted native overlay cannot leave the official page inert', async () => {
  const h = await overlayHarness({ failAppend: true });
  await h.run();
  assert.equal(h.background.inert, false);
  assert.equal(h.alreadyInert.inert, true);
  assert.equal(h.observers.size, 0);
  assert.equal(h.timers.size, 0);
});

test('visual style patch validates exact values without overwriting identity', () => {
  assert.deepEqual(profileInput({ visual_style: 'laterano' }), { visual_style: 'laterano' });
  assert.deepEqual(profileInput({ username: 'Operator' }), { username: 'Operator' });
  for (const visual_style of [null, '', 'gold', 1, {}]) assert.throws(() => profileInput({ visual_style }), /Visual style/);
});
import { prepareArguments } from './cli.mjs';

test('native overlay patch precedes app flags and preserves the official invocation', () => {
  assert.deepEqual(prepareArguments(['web', '--startup', '--port', '3081', '--no-open'], '/patch.json'), {
    args: ['web', '--patch', '/patch.json', '--port', '3081', '--no-open'], override: true, web: true,
  });
  assert.deepEqual(prepareArguments(['--profile', 'web', '--no-startup'], '/patch.json').args, ['--profile', 'web', '--patch', '/patch.json']);
  assert.deepEqual(prepareArguments(['headless', 'say hello'], '/patch.json').args, ['headless', 'say hello']);
  assert.deepEqual(prepareArguments(['web', '--help'], '/patch.json').args, ['web', '--help']);
  assert.deepEqual(prepareArguments(['web', '--dump-config'], '/patch.json').args, ['web', '--dump-config']);
  assert.throws(() => prepareArguments(['web', '--startup', '--no-startup'], '/patch.json'), /mutually exclusive/);
});

test('profile and one-shot data are isolated under the native DSH home', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsh-native-state-test-'));
  const previous = process.env.DSH_HOME; process.env.DSH_HOME = home;
  try {
    assert.equal(dataDirectory(), join(home, 'startup-animation'));
    assert.equal(settings().enabled, false);
    saveSettings(profileInput({ username: 'CatShark', badge_id: 'DSH-7391' }));
    assert.equal(settings().username, 'CatShark');
    chooseNext(true);
    assert.equal(consumeNext(), true);
    assert.equal(consumeNext(), undefined);
    chooseNext(false);
    assert.equal(consumeNext(), false);
    assert.equal(settings().enabled, false);
    assert.throws(() => profileInput({ username: '\u001b[31m', badge_id: 'OK' }), /printable/);
    assert.throws(() => profileInput({ username: 'x'.repeat(65), badge_id: 'OK' }), /maximum/);
  } finally { if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous; rmSync(home, { recursive: true, force: true }); }
});

test('native registry adapter reports only live fibers and true skill observations', async () => {
  const root = process.env.NATIVE_STARTUP_PACKAGE;
  const { inventory, localRequest } = await import(root ? pathToFileURL(join(root, 'plugin.mjs')) : './plugin.mjs');
  const events = [];
  const ctx = {
    skills: { snapshot: async options => { assert.equal(options.cwd, process.cwd()); return { complete: false, skills: [{ name: 'real-file', path: '/work/.dsh/skills/real-file/SKILL.md' }] }; } },
    loader: { entries: () => [
      { id: 'mounted', options: { name: 'actual-plugin' }, fiber: { state: 2 } },
      { id: 'disabled', disabled: true, options: { name: 'disabled-plugin' }, fiber: { state: 2 } },
      { id: 'pending', options: { name: 'pending-plugin' }, fiber: { state: 0 } },
      { id: 'failed', options: { name: 'failed-plugin' }, fiber: { state: 3 } },
    ] },
  };
  const result = await inventory(ctx, event => events.push(event));
  assert.deepEqual(result.skills.map(item => item.name), ['real-file']);
  assert.deepEqual(result.plugins.map(item => item.name), ['actual-plugin']);
  assert.equal(result.issues.length, 2);
  assert.equal(events.at(-1).type, 'complete');
  const request = { headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'x-dsh-token': 'token' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(localRequest(request, 3000, 'token', true), true);
  request.headers.origin = 'https://attacker.example';
  assert.equal(localRequest(request, 3000, 'token', true), false);
  request.headers.origin = 'http://127.0.0.1:3000'; request.headers.host = 'attacker.example';
  assert.equal(localRequest(request, 3000, 'token'), false);
});

test('only matching iframe completion closes the native overlay', async () => {
  const { runInNewContext } = await import('node:vm');
  const listeners = new Map(); let appended = false, removed = false, remembered = false;
  const frame = { style: {}, nodeType: 1, contentWindow: {}, setAttribute() {}, addEventListener() {}, focus() {}, remove() { removed = true; } };
  const exit = { style: {}, nodeType: 1, setAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() {} };
  const background = { nodeType: 1, inert: false }, alreadyInert = { nodeType: 1, inert: true };
  runInNewContext(readFileSync(new URL('./overlay.mjs', import.meta.url), 'utf8'), {
    fetch: async () => ({ ok: true, json: async () => ({ enabled: true, instance: 'a' }) }),
    crypto: { randomUUID: () => 'channel-123' }, URLSearchParams,
    location: { origin: 'http://127.0.0.1:3080' },
    sessionStorage: { getItem: () => null, setItem: () => { remembered = true; } },
    document: { readyState: 'complete', documentElement: { dataset: { theme: 'dark' } }, createElement: tag => tag === 'iframe' ? frame : exit, body: { children: [background, alreadyInert], append() { appended = true; } } },
    MutationObserver: class { observe() {} disconnect() {} },
    window: { addEventListener: (kind, fn) => listeners.set(kind, fn), removeEventListener: kind => listeners.delete(kind) },
    console, setTimeout, clearTimeout,
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(appended, true);
  assert.equal(background.inert, true);
  const event = { origin: 'http://127.0.0.1:3080', source: frame.contentWindow, data: { source: 'dsh-startup', channel: 'channel123', type: 'complete' } };
  const complete = listeners.get('message');
  complete({ ...event, source: {} }); assert.equal(removed, false);
  complete({ ...event, origin: 'https://other.example' }); assert.equal(removed, false);
  complete({ ...event, data: { ...event.data, channel: 'wrong' } }); assert.equal(removed, false);
  complete(event); assert.equal(removed, true); assert.equal(remembered, true);
  assert.equal(background.inert, false); assert.equal(alreadyInert.inert, true);
});

test('optional Rust access checks stay inside the startup namespace on official DSH', async () => {
  const { runInNewContext } = await import('node:vm');
  const calls = [];
  const window = { fetch: async (input) => { calls.push(input); return { status: 404 }; } };
  runInNewContext(readFileSync(new URL('./bridge.mjs', import.meta.url), 'utf8'), { window, document: { addEventListener() {} } });
  await window.fetch('/api/access');
  await window.fetch('/api/profile');
  assert.deepEqual(calls, ['/__dsh_startup/api/access', '/__dsh_startup/api/profile']);
});

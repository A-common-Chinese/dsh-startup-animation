// Execute the real preview controller against a silent DOM/Web Audio harness.
// This checks host lifecycle behavior, not rendering or a copied state machine.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function jsonResponse(body, status = 200) { return { ok: status >= 200 && status < 300, status, json: async () => body }; }
function ndjsonStream() {
  let controller, cancelled = false;
  const encoder = new TextEncoder();
  const body = new ReadableStream({ start(value) { controller = value; }, cancel() { cancelled = true; } });
  return {
    response: { ok: true, status: 200, body },
    event(value) { controller.enqueue(encoder.encode(JSON.stringify(value) + '\n')); },
    bytes(value) { controller.enqueue(value); },
    close() { controller.close(); },
    get cancelled() { return cancelled; },
  };
}
const profileFixture = { username: 'CatShark', badge_id: 'DSH-0001', token: 'test-only-token', workspace: 'test-workspace', mode: 'local' };
const inventoryFixture = { type: 'complete', skills: [{ name: 'repo-review', source: '.agents/skills/review', status: 'loaded' }], plugins: [{ id: 'workspace', name: 'workspace-tools', tool_count: 3, status: 'loaded' }], issues: [], elapsed_ms: 17 };

class EventTargetStub {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  emit(type, values = {}) {
    const event = { target: this, preventDefault() {}, ...values };
    for (const callback of this.listeners.get(type) || []) callback(event);
  }
}

function classList() {
  const values = new Set();
  return {
    add: value => values.add(value),
    remove: value => values.delete(value),
    contains: value => values.has(value),
    toggle(value, force) {
      const enabled = force ?? !values.has(value);
      if (enabled) values.add(value); else values.delete(value);
      return enabled;
    },
  };
}

function createHarness(options = {}) {
  const html = fs.readFileSync(path.join(__dirname, '../docs/startup-preview.html'), 'utf8');
  const htmlIds = new Set([...html.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match => match[1]));
  let now = 1;
  let nextFrame = 0;
  const frames = new Map();
  const elements = new Map();
  const contexts = [];
  const sources = [];
  const animations = [];
  const drawStates = [];
  const pendingAudio = [];
  const requests = [];
  const messages = [];
  const canvasCalls = [];
  let generatedNode = 0;
  async function request(url, init = {}) {
    requests.push({ url, ...init });
    if (url.startsWith('/api/access')) return options.accessFetch ? options.accessFetch(url, init) : jsonResponse({ message: 'Not found' }, 404);
    if (options.fetch) return options.fetch(url, init);
    if (url === '/api/profile') return jsonResponse(init.method === 'POST' ? JSON.parse(init.body) : profileFixture);
    if (url === '/api/load') { const stream = ndjsonStream(); stream.event(inventoryFixture); stream.close(); return stream.response; }
    return jsonResponse({ message: 'Not found' }, 404);
  }

  function element(id) {
    if (!elements.has(id)) {
      const node = new EventTargetStub();
      Object.assign(node, {
        id,
        hidden: id === 'controlPanel',
        value: id === 'identityName' ? 'OPERATOR' : id === 'identityId' ? 'DSH-0001' : '',
        textContent: '', dataset: {}, style: { setProperty(name, value) { this[name] = value; } }, classList: classList(), attributes: new Map(),
        captures: new Set(),
        children: [],
        appendChild(child) { this.children.push(child); return child; },
        replaceChildren(...children) { this._text = ''; this.children = children; },
        setAttribute(name, value) { this.attributes.set(name, value); },
        removeAttribute(name) { this.attributes.delete(name); },
        getAttribute(name) { return this.attributes.get(name); },
        getBoundingClientRect() {
          const r = options.rectangles?.[id] || { left: 0, top: 0, width: 1000, height: 800 };
          return { ...r, right: r.left + r.width, bottom: r.top + r.height };
        },
        getContext() {
          if (!this.context) {
            const stack = [];
            this.context = { globalAlpha: 1,
              save() { stack.push(this.globalAlpha); },
              restore() { assert.ok(stack.length, 'host canvas restore must have a matching save'); this.globalAlpha = stack.pop(); },
            };
            for (const op of ['setTransform', 'clearRect', 'drawImage']) this.context[op] = (...args) => {
              canvasCalls.push({ canvas: id, op, args, alpha: this.context.globalAlpha });
            };
          }
          return this.context;
        },
        closest() { return null; },
        focus() { document.activeElement = this; },
        setPointerCapture(id) { this.captures.add(id); },
        hasPointerCapture(id) { return this.captures.has(id); },
        releasePointerCapture(id) { this.captures.delete(id); },
        animate(keyframes, timing) {
          const animation = { id, keyframes, timing, cancelled: false, cancel() { this.cancelled = true; } };
          animations.push(animation); return animation;
        },
      });
      Object.defineProperty(node, 'textContent', {
        get() { return (this._text || '') + this.children.map(child => child.textContent).join(''); },
        set(value) { this._text = String(value); this.children = []; },
      });
      for (const [property, field] of [['offsetLeft', 'left'], ['offsetTop', 'top'], ['offsetWidth', 'width'], ['offsetHeight', 'height']]) {
        Object.defineProperty(node, property, { get() {
          return (options.offsets?.[id] || options.rectangles?.[id] || { left: 0, top: 0, width: 1000, height: 800 })[field];
        } });
      }
      elements.set(id, node);
    }
    return elements.get(id);
  }

  const parameter = () => ({
    value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  const audioNode = () => ({ connect() {}, disconnect() { this.disconnected = true; } });
  class SilentAudioContext {
    constructor() {
      this.state = options.delayAudio ? 'suspended' : 'running'; this.sampleRate = 24000;
      this.destination = audioNode(); contexts.push(this);
    }
    get currentTime() { return now / 1000; }
    createGain() { return { ...audioNode(), gain: parameter() }; }
    createBiquadFilter() { return { ...audioNode(), frequency: parameter(), Q: parameter() }; }
    createBuffer(_channels, length) {
      return { getChannelData() { return new Float32Array(length); } };
    }
    createOscillator() {
      const source = {
        ...audioNode(), context: this, frequency: parameter(), stopped: false,
        start(at) { this.startedAt = at; },
        stop(at) {
          if (at === undefined) {
            this.stopped = true;
            queueMicrotask(() => this.onended?.());
          } else this.scheduledStop = at;
        },
      };
      sources.push(source); return source;
    }
    createBufferSource() { return this.createOscillator(); }
    resume() {
      if (options.delayAudio) return new Promise(resolve => pendingAudio.push(() => { this.state = 'running'; resolve(); }));
      this.state = 'running'; return Promise.resolve();
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }

  const document = new EventTargetStub();
  Object.assign(document, {
    hidden: false, activeElement: null,
    getElementById: id => htmlIds.has(id) ? element(id) : null,
    createElement: tag => { const node = element('generated-' + (++generatedNode)); node.tagName = tag.toUpperCase(); return node; },
    querySelectorAll: selector => (options.selectors?.[selector] || []).map(element),
    body: { classList: classList() }, documentElement: { dataset: {} },
  });
  const windowEvents = new EventTargetStub();
  const sandbox = {
    document, console, AudioContext: SilentAudioContext, fetch: request,
    AbortController, TextDecoder, setTimeout, clearTimeout,
    URL, URLSearchParams, location: { search: options.search || '' },
    performance: { now: () => now }, devicePixelRatio: 1,
    matchMedia: () => ({ matches: !!options.reducedMotion, addEventListener() {} }),
    ResizeObserver: class { observe() {} },
    DSHVisuals: { draw(_ctx, _width, _height, state) { drawStates.push({ ...state }); } },
    DSHLateranoVisuals: { draw(_ctx, _width, _height, state) { drawStates.push({ ...state, visualStyle: 'laterano' }); } },
    DSHVoice: options.voice,
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
  };
  sandbox.window = sandbox;
  sandbox.parent = options.embedded ? { postMessage(message, origin) { messages.push({ message, origin }); } } : sandbox;
  vm.createContext(sandbox);
  for (const filename of ['startup-sequence.js', 'startup-local.js', 'startup-identity.js', 'startup-text.js', 'startup-embed.js', 'startup-preview.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs', filename), 'utf8'), sandbox, { filename });
  }

  return {
    element, document, windowEvents, frames, contexts, sources, animations, drawStates, requests, messages, canvasCalls,
    releaseAudio() { pendingAudio.splice(0).forEach(resolve => resolve()); },
    tap() {
      const stage = element('experience');
      const pointer = { button: 0, pointerId: 1, clientX: 913, clientY: 721 };
      stage.emit('pointerdown', pointer); stage.emit('pointerup', pointer);
    },
    frame(at) {
      now = at;
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback(now);
    },
  };
}

async function settle() { await new Promise(resolve => setImmediate(resolve)); }

async function main() {
  const controls = createHarness();
  assert.equal(controls.document.getElementById('not-in-the-preview-html'), null, 'missing HTML IDs must not manufacture nodes');
  assert.equal(controls.document.getElementById('play'), controls.element('play'), 'real HTML controls must remain available');
  assert.equal(controls.element('controlPanel').hidden, true);
  controls.document.emit('keydown', { key: 'c', target: controls.element('experience') });
  await settle();
  assert.equal(controls.element('controlPanel').hidden, false, 'C must open the on-demand settings');
  assert.equal(controls.document.activeElement, controls.element('closeSettings'), 'opening settings must move focus to its close button');
  controls.frame(401);
  assert.equal(controls.drawStates.at(-1).time, 0, 'opening settings must not start the sequence');
  assert.equal(controls.contexts.length, 0, 'opening settings must not initialize audio');
  controls.document.emit('keydown', { key: 'c', target: controls.document.activeElement });
  await settle();
  assert.equal(controls.element('controlPanel').hidden, true, 'C must also close the settings');
  assert.equal(controls.document.activeElement, controls.element('settings'), 'closing settings must restore its entry-point focus');
  controls.frame(801);
  assert.equal(controls.drawStates.at(-1).time, 0, 'closing settings must keep the first gate waiting');
  assert.equal(controls.drawStates.at(-1).waiting, true);
  assert.equal(controls.sources.length, 0, 'settings toggles must not play the sequence score');

  const seeked = createHarness(); await settle();
  seeked.element('seek').value = '5.4'; seeked.element('seek').emit('input');
  assert.equal(seeked.element('phaseTitle').getAttribute('data-lettering'), 'settled', 'a paused seek 1.5s into identity must show resolved text');
  seeked.element('seek').value = '4.1'; seeked.element('seek').emit('input');
  assert.equal(seeked.element('phaseTitle').getAttribute('data-lettering'), 'roll', 'backward seeking must restore the lettering pose');

  const delayed = createHarness({ delayAudio: true });
  delayed.tap(); await settle();
  delayed.frame(450);
  assert.equal(delayed.contexts[0].state, 'suspended');
  assert.equal(delayed.element('currentTime').textContent, '00.00', 'the sequence must wait for initial audio activation');
  assert.equal(delayed.sources.length, 0, 'no audio may be scheduled before the context runs');
  delayed.tap(); await settle();
  assert.equal(delayed.contexts.length, 1, 'repeated taps while preparing must not create another score or context');
  delayed.releaseAudio(); await settle();
  assert.equal(delayed.element('play').textContent, '暂停');
  assert.ok(delayed.sources.some(source => source.startedAt < .50), 'the first note must survive delayed audio activation');
  assert.ok(delayed.sources.every(source => source.scheduledStop <= .45 + 2.1 + .06), 'the compressed opening score must fit the 2.1s chapter');
  delayed.frame(501);
  assert.equal(delayed.element('currentTime').textContent, '00.05', 'visual timing must start when audio becomes ready');
  delayed.frame(4351);
  assert.equal(delayed.drawStates.at(-1).phase, 2);
  assert.equal(delayed.drawStates.at(-1).waiting, true);
  assert.equal(delayed.element('currentTime').textContent, '03.90');
  assert.equal(delayed.element('phaseTitle').getAttribute('data-lettering'), 'roll', 'phase titles must enter using the shared frame-driven rolling ink');
  assert.ok(delayed.animations.some(animation => animation.id === 'identityCard'), 'identity confirmation should reveal its card');
  const entryCount = delayed.animations.length;
  delayed.frame(4401);
  assert.equal(delayed.animations.length, entryCount, 'an idle checkpoint must not restart DOM entry effects every frame');
  delayed.tap(); await settle();
  delayed.tap(); await settle(); // Playback taps create a response, never skip a checkpoint.
  assert.equal(delayed.drawStates.at(-1).phase, 2);
  delayed.frame(6701); await settle();
  assert.equal(delayed.drawStates.at(-1).phase, 3);
  assert.equal(delayed.requests.filter(request => request.url === '/api/load').length, 1);
  delayed.frame(10101);
  assert.equal(delayed.drawStates.at(-1).phase, 4);
  assert.equal(delayed.drawStates.at(-1).waiting, true);
  assert.equal(delayed.element('currentTime').textContent, '09.50');
  delayed.tap(); await settle();
  delayed.frame(14401);
  assert.equal(delayed.drawStates.at(-1).phase, 5);
  assert.equal(delayed.element('currentTime').textContent, '13.80');
  assert.equal(delayed.element('play').textContent, '重播');

  const reduced = createHarness({ reducedMotion: true });
  reduced.tap(); await settle(); reduced.frame(2201);
  assert.equal(reduced.drawStates.at(-1).phase, 1);
  assert.equal(reduced.animations.length, 0, 'reduced motion must bypass all DOM entry animation');
  assert.equal(reduced.element('phaseEnglish').textContent, 'LOCAL WORKSPACE CONNECTED');

  // The identity gate decrypts while awaiting the user, without changing its
  // underlying data or exposing noisy letters to assistive technology.
  const identity = createHarness(); await settle(); identity.tap(); await settle(); identity.frame(4001);
  assert.equal(identity.drawStates.at(-1).phase, 2);
  assert.equal(identity.drawStates.at(-1).waiting, true);
  assert.equal(identity.element('cardName').textContent, 'CatShark');
  const initialCipher = ['cardNameVisual', 'cardIdVisual', 'cardModeVisual'].map(id => identity.element(id).textContent);
  assert.notEqual(initialCipher[0], 'CatShark');
  identity.frame(4301);
  assert.notEqual(identity.element('cardNameVisual').textContent, initialCipher[0]);
  identity.frame(5301);
  assert.equal(identity.element('cardNameVisual').textContent, 'CatShark');
  assert.equal(identity.element('cardIdVisual').textContent, 'DSH-0001');
  assert.equal(identity.element('cardModeVisual').textContent, 'LOCAL / SAVED');
  identity.element('replay').emit('click'); identity.tap(); await settle(); identity.frame(9301);
  assert.deepEqual(['cardNameVisual', 'cardIdVisual', 'cardModeVisual'].map(id => identity.element(id).textContent), initialCipher, 'replay must reproduce the same field cipher');
  identity.element('seek').value = '4.1'; identity.element('seek').emit('input');
  const seekCipher = identity.element('cardNameVisual').textContent;
  identity.frame(12301);
  assert.equal(identity.element('cardNameVisual').textContent, seekCipher, 'a paused seek must stay deterministic');
  identity.element('seek').value = '5.5'; identity.element('seek').emit('input');
  identity.element('identityName').value = '<猫🦈>';
  identity.element('identityName').emit('input');
  assert.equal(identity.element('cardName').textContent, '<猫🦈>');
  assert.equal(identity.element('cardNameVisual').textContent, '<猫🦈>', 'live edits render literal true values once resolved');
  assert.equal(identity.element('cardModeVisual').textContent, 'UNSAVED / PREVIEW');
  reduced.element('seek').value = '3.9'; reduced.element('seek').emit('input');
  assert.equal(reduced.element('cardNameVisual').textContent, 'CatShark', 'reduced motion reveals actual values immediately');
  assert.equal(reduced.element('cardModeVisual').getAttribute('data-decoding'), 'false');
  const nativeProfile = createHarness({ fetch: async () => jsonResponse({ ...profileFixture, runtime: 'native' }) }); await settle();
  assert.equal(nativeProfile.element('runtimeBadge').textContent, 'NATIVE', 'official DSH adapters must not be labeled Rust');

  const host = createHarness();
  host.tap(); await settle();
  assert.equal(host.contexts.length, 1);
  assert.ok(host.sources.length > 0, 'the real controller must schedule its initial score');
  assert.equal(host.element('play').textContent, '暂停');
  host.frame(200);
  const pausedTime = host.element('currentTime').textContent;

  host.document.hidden = true;
  host.windowEvents.emit('pagehide', { persisted: true });
  await settle();
  assert.equal(host.frames.size, 0, 'pagehide must cancel its pending animation frame');
  assert.equal(host.contexts[0].state, 'closed');
  assert.ok(host.sources.every(source => source.stopped), 'pagehide must stop scheduled and active sounds');
  const beforeRestore = host.sources.length;

  host.document.hidden = false;
  host.windowEvents.emit('pageshow', { persisted: true });
  await settle();
  assert.ok(host.frames.size > 0, 'BFCache restoration must wake the display scheduler');
  assert.notEqual(host.element('play').textContent, '暂停', 'restoration must wait for user confirmation');
  host.frame(400);
  assert.equal(host.element('currentTime').textContent, pausedTime, 'restoration must not advance the paused sequence');
  assert.equal(host.sources.length, beforeRestore, 'restoration must not start audio by itself');

  host.tap(); await settle();
  assert.equal(host.contexts.length, 2, 'resuming after pagehide must replace the closed AudioContext');
  assert.equal(host.contexts[1].state, 'running');
  assert.ok(host.sources.length > beforeRestore, 'resuming must schedule sound in the replacement context');
  assert.ok(host.sources.slice(beforeRestore).every(source => source.context === host.contexts[1]));
  assert.equal(host.element('play').textContent, '暂停');

  host.document.hidden = true;
  host.document.emit('visibilitychange');
  await settle();
  assert.equal(host.frames.size, 0);
  assert.ok(host.sources.every(source => source.stopped), 'backgrounding must silence the current score');
  assert.notEqual(host.element('play').textContent, '暂停');
  host.document.hidden = false;
  host.document.emit('visibilitychange');
  assert.equal(host.contexts.length, 2, 'ordinary visibility changes must reuse the live context');
  assert.notEqual(host.element('play').textContent, '暂停', 'foregrounding must not autoplay');

  // The real controller consumes a live, fragmented stream. No clock-based fake inventory.
  const streamed = ndjsonStream();
  let persisted = { ...profileFixture }, saveFails = false;
  const localFetch = async (url, init) => {
    if (url === '/api/profile' && init.method === 'POST') {
      assert.equal(init.headers['X-DSH-Token'], profileFixture.token);
      if (saveFails) return jsonResponse({ message: 'Disk is read-only' }, 500);
      persisted = { ...persisted, ...JSON.parse(init.body) }; return jsonResponse(persisted);
    }
    if (url === '/api/profile') return jsonResponse(persisted);
    if (url === '/api/load') { assert.equal(init.headers['X-DSH-Token'], profileFixture.token); return streamed.response; }
    throw new Error('Unexpected endpoint ' + url);
  };
  const live = createHarness({ fetch: localFetch }); await settle();
  assert.equal(live.element('identityName').value, 'CatShark');
  assert.equal(live.element('cardName').textContent, 'CatShark');
  assert.equal(live.requests.filter(request => request.url === '/api/load').length, 0, 'the API must not load inventory before phase 3 plays');
  live.element('identityName').value = 'Saved Operator'; live.element('identityName').emit('input');
  live.element('saveIdentity').emit('click'); await settle();
  assert.equal(persisted.username, 'Saved Operator');
  assert.match(live.element('profileStatus').textContent, /已保存到本地/);
  const reopened = createHarness({ fetch: localFetch }); await settle();
  assert.equal(reopened.element('identityName').value, 'Saved Operator', 'saved profile must be read back from the host in a new page');
  saveFails = true;
  live.element('identityName').value = 'Unsaved Draft'; live.element('identityName').emit('input');
  live.element('saveIdentity').emit('click'); await settle();
  assert.equal(persisted.username, 'Saved Operator');
  assert.match(live.element('profileStatus').textContent, /保存失败.*Disk is read-only/);
  live.element('seek').value = '6.1'; live.element('seek').emit('input');
  assert.equal(live.requests.filter(request => request.url === '/api/load').length, 0);
  live.tap(); await settle(); live.frame(5001);
  assert.equal(live.drawStates.at(-1).phase, 3);
  assert.equal(live.drawStates.at(-1).time, 9.5);
  assert.equal(live.drawStates.at(-1).inventory.status, 'loading');
  assert.equal(live.element('skillsCount').textContent, '…', 'unknown inventory must not show invented counts');
  streamed.event({ type: 'stage', stage: 'skills', status: 'loading' });
  const literalName = '扫描技能 <img src=x onerror=alert(1)>';
  const fragmented = new TextEncoder().encode(JSON.stringify({ type: 'item', kind: 'skill', name: literalName, source: '.agents/skills/scan', status: 'loaded' }) + '\n');
  for (let i = 0; i < fragmented.length; i += 7) streamed.bytes(fragmented.slice(i, i + 7));
  streamed.event({ type: 'stage', stage: 'plugins', status: 'loading' });
  streamed.event({ type: 'item', kind: 'plugin', name: 'actual-plugin', source: '.dsh/plugins', status: 'loaded' });
  await settle(); await settle();
  assert.equal(live.element('skillsCount').textContent, '01');
  assert.equal(live.element('pluginsCount').textContent, '01');
  assert.ok(live.element('skillsList').textContent.includes(literalName), 'Unicode and markup-like names must remain literal text');
  assert.equal(live.element('skillsList').children[0].children[0].textContent, '＋  '+literalName, 'the compact main line must preserve the literal name');
  assert.equal(live.element('skillsList').children[0].children[1].title, '.agents/skills/scan', 'the untruncated source must remain available in the title');
  assert.ok(live.element('pluginsList').textContent.includes('actual-plugin'));
  assert.equal(live.drawStates.at(-1).phase, 3, 'item events cannot imply the whole load finished');
  streamed.event({ type: 'complete', skills: [{ name: literalName, source: '.agents/skills/scan', status: 'loaded' }], plugins: [{ id: 'real', name: 'actual-plugin', tool_count: 7, status: 'loaded' }], issues: [{ kind: 'plugin', name: 'unavailable-plugin', message: 'Connection refused' }], elapsed_ms: 62 });
  streamed.close(); await settle(); live.frame(5002);
  assert.equal(live.drawStates.at(-1).phase, 4);
  assert.equal(live.drawStates.at(-1).inventory.status, 'complete');
  assert.match(live.element('phaseTitle').textContent, /部分项目需检查/);
  assert.match(live.element('phaseNote').textContent, /1 skills · 1 plugins · 7 tools/);
  assert.match(live.element('inventoryIssues').textContent, /unavailable-plugin.*Connection refused/);

  // Native Loader entries do not expose per-plugin tool ownership. An absent
  // count must remain unknown rather than claiming zero mounted tools.
  const nativeInventory = ndjsonStream();
  const nativeCatalog = createHarness({ fetch: async url => url === '/api/profile' ? jsonResponse({ ...profileFixture, runtime: 'native' }) : nativeInventory.response });
  await settle(); nativeCatalog.element('seek').value = '6.1'; nativeCatalog.element('seek').emit('input'); nativeCatalog.tap(); await settle();
  nativeInventory.event({ ...inventoryFixture, plugins: [{ id: 'official-tools', name: 'Official tools', status: 'loaded' }] });
  nativeInventory.close(); await settle(); nativeCatalog.frame(5001);
  assert.equal(nativeCatalog.drawStates.at(-1).inventory.plugins[0].tool_count, null);
  assert.equal(nativeCatalog.element('phaseNote').textContent, '1 skills · 1 plugins');

  // A late response from an aborted load must never enter the replay or a new seek.
  const staleStream = ndjsonStream(), freshStream = ndjsonStream(); let streamIndex = 0;
  const stale = createHarness({ fetch: async (url) => url === '/api/profile' ? jsonResponse(profileFixture) : [staleStream, freshStream][streamIndex++].response });
  await settle(); stale.element('seek').value = '6.1'; stale.element('seek').emit('input'); stale.tap(); await settle();
  const oldRequest = stale.requests.find(request => request.url === '/api/load');
  stale.element('replay').emit('click');
  assert.equal(oldRequest.signal.aborted, true, 'replay must abort the old stream');
  assert.equal(stale.drawStates.at(-1).phase, 0);
  stale.element('seek').value = '6.1'; stale.element('seek').emit('input'); stale.tap(); await settle();
  staleStream.event({ ...inventoryFixture, skills: [{ name: 'STALE SKILL', source: 'old', status: 'loaded' }] });
  await settle();
  assert.equal(stale.element('skillsList').textContent.includes('STALE SKILL'), false);
  freshStream.event(inventoryFixture); freshStream.close(); await settle(); stale.frame(5001);
  assert.equal(stale.drawStates.at(-1).phase, 4);
  assert.ok(stale.element('skillsList').textContent.includes('repo-review'));

  const disconnected = createHarness({ fetch: async () => jsonResponse({}, 404) }); await settle();
  assert.match(disconnected.element('connectionStatus').textContent, /dsh startup web/);
  disconnected.element('seek').value = '6.1'; disconnected.element('seek').emit('input'); disconnected.tap(); await settle(); disconnected.frame(5001);
  assert.equal(disconnected.drawStates.at(-1).phase, 4, 'offline users may continue the explicitly offline film');
  assert.equal(disconnected.drawStates.at(-1).inventory.status, 'unavailable');
  assert.equal(disconnected.element('skillsCount').textContent, '—');
  assert.match(disconnected.element('phaseTitle').textContent, /尚未就绪/);

  const brokenStream = ndjsonStream();
  const broken = createHarness({ fetch: async url => url === '/api/profile' ? jsonResponse(profileFixture) : brokenStream.response }); await settle();
  broken.element('seek').value = '6.1'; broken.element('seek').emit('input'); broken.tap(); await settle();
  brokenStream.event({ type: 'item', kind: 'skill', name: 'partial-result', source: 'local', status: 'loaded' }); brokenStream.close(); await settle(); broken.frame(5001);
  assert.equal(broken.drawStates.at(-1).inventory.status, 'error', 'EOF without complete must never imply success');
  assert.match(broken.element('inventoryMessage').textContent, /没有收到完整加载结果/);

  const openEnded = ndjsonStream();
  const finalWithoutEOF = createHarness({ fetch: async url => url === '/api/profile' ? jsonResponse(profileFixture) : openEnded.response }); await settle();
  finalWithoutEOF.element('seek').value = '6.1'; finalWithoutEOF.element('seek').emit('input'); finalWithoutEOF.tap(); await settle();
  openEnded.event(inventoryFixture); // Deliberately keep the producer open.
  await settle(); finalWithoutEOF.frame(5001);
  assert.equal(finalWithoutEOF.drawStates.at(-1).inventory.status, 'complete');
  assert.equal(finalWithoutEOF.drawStates.at(-1).phase, 4, 'a complete event must not wait for socket EOF');
  assert.equal(openEnded.cancelled, true, 'the client must cancel the completed transport');

  let finalReads = 0, finalCancels = 0, finalReleases = 0;
  const finalWithReset = { ok: true, status: 200, body: { getReader() { return {
    async read() {
      finalReads++;
      if (finalReads === 1) return { done: false, value: new TextEncoder().encode(JSON.stringify(inventoryFixture)+'\ninvalid data after final event\n') };
      throw new Error('Connection reset after complete');
    },
    async cancel() { finalCancels++; throw new Error('Connection was already reset'); },
    releaseLock() { finalReleases++; },
  }; } } };
  const authoritative = createHarness({ fetch: async url => url === '/api/profile' ? jsonResponse(profileFixture) : finalWithReset }); await settle();
  authoritative.element('seek').value = '6.1'; authoritative.element('seek').emit('input'); authoritative.tap(); await settle(); authoritative.frame(5001);
  assert.equal(authoritative.drawStates.at(-1).inventory.status, 'complete', 'a teardown error cannot downgrade an authoritative final result');
  assert.equal(finalReads, 1, 'the reader must not request bytes after the final event');
  assert.equal(finalCancels, 1); assert.equal(finalReleases, 1);

  const narrator = { busy: false, calls: [], cancelled: 0, unlocked: 0, unlock() { this.unlocked++; }, phase(index) { this.calls.push(index); this.busy = true; }, cancel() { this.cancelled++; this.busy = false; }, setMuted() { this.busy = false; } };
  const spoken = createHarness({ voice: narrator }); await settle(); spoken.tap(); await settle(); spoken.frame(5001);
  assert.equal(spoken.drawStates.at(-1).phase, 0, 'a busy voice must hold the current phase boundary');
  narrator.busy = false; spoken.frame(5002);
  assert.equal(spoken.drawStates.at(-1).phase, 1);
  narrator.busy = false; spoken.frame(7002);
  assert.equal(spoken.drawStates.at(-1).phase, 2); assert.equal(spoken.drawStates.at(-1).waiting, true);
  const cancelledBeforeGate = narrator.cancelled;
  spoken.tap(); await settle();
  assert.equal(narrator.calls.filter(phase => phase === 2).length, 1, 'confirming a gate must not repeat its active narration');
  assert.equal(narrator.cancelled, cancelledBeforeGate, 'gate confirmation must not cut off speech');
  spoken.element('play').emit('click'); assert.equal(narrator.busy, false, 'explicit pause must cancel the voice');

  let releaseVoice;
  const slowVoice = { busy: false, calls: [], unlock() { return new Promise(resolve => { releaseVoice = resolve; }); }, phase(index) { this.calls.push(index); }, cancel() {}, setMuted() {} };
  const delayedVoice = createHarness({ voice: slowVoice }); await settle(); delayedVoice.tap(); await settle(); delayedVoice.frame(1001);
  assert.equal(delayedVoice.drawStates.at(-1).time, 0, 'the sequence must also wait for the narration AudioContext to resume');
  assert.equal(slowVoice.calls.length, 0, 'narration must not be dispatched into a suspended context');
  assert.equal(delayedVoice.sources.length, 0, 'the synth score must stay aligned with narration activation');
  releaseVoice(); await settle();
  assert.deepEqual(slowVoice.calls, [0], 'the opening clip must be dispatched after voice unlock completes');
  delayedVoice.frame(1101);
  assert.equal(delayedVoice.element('currentTime').textContent, '00.10');
  assert.ok(delayedVoice.sources.length > 0);

  let releaseCancelledVoice;
  const cancelledVoice = { busy: false, calls: [], unlock() { return new Promise(resolve => { releaseCancelledVoice = resolve; }); }, phase(index) { this.calls.push(index); }, cancel() {}, setMuted() {} };
  const cancelledUnlock = createHarness({ voice: cancelledVoice }); await settle(); cancelledUnlock.tap(); await settle();
  cancelledUnlock.element('replay').emit('click'); releaseCancelledVoice(); await settle(); cancelledUnlock.frame(1001);
  assert.equal(cancelledUnlock.drawStates.at(-1).time, 0);
  assert.equal(cancelledUnlock.drawStates.at(-1).waiting, true);
  assert.equal(cancelledVoice.calls.length, 0, 'a cancelled delayed unlock must not dispatch stale narration');
  assert.equal(cancelledUnlock.sources.length, 0);

  const silentVoice = { busy: false, muted: false, unlock() {}, phase() {}, cancel() {}, setMuted(value) { this.muted = value; } };
  const silent = createHarness({ voice: silentVoice, fetch: async () => jsonResponse({ ...profileFixture, sound: false }) }); await settle();
  assert.equal(silent.element('sound').getAttribute('aria-pressed'), 'false', 'the local sound=false setting must initialize the button');
  assert.equal(silentVoice.muted, true, 'local silent mode must also mute the narration');
  silent.tap(); await settle(); silent.frame(401);
  assert.equal(silent.sources.length, 0, 'a silent profile must not schedule the synthesized score');
  silent.element('sound').emit('click'); await settle();
  assert.equal(silentVoice.muted, false);
  silent.element('saveIdentity').emit('click'); await settle();
  assert.equal(silent.element('sound').getAttribute('aria-pressed'), 'true', 'saving the profile must not reset an explicit sound preference');

  let finishProfile;
  const preferredVoice = { busy: false, muted: false, unlock() {}, phase() {}, cancel() {}, setMuted(value) { this.muted = value; } };
  const preferred = createHarness({ voice: preferredVoice, fetch: async () => new Promise(resolve => { finishProfile = resolve; }) }); await settle();
  preferred.document.emit('keydown', { key: 'm', target: preferred.element('experience') });
  assert.equal(preferredVoice.muted, true);
  finishProfile(jsonResponse({ ...profileFixture, sound: true })); await settle();
  assert.equal(preferred.element('sound').getAttribute('aria-pressed'), 'false', 'an M press before profile arrival must take priority over sound=true');
  assert.equal(preferredVoice.muted, true);

  let finishSilentProfile;
  const early = createHarness({ fetch: async () => new Promise(resolve => { finishSilentProfile = resolve; }) }); await settle();
  early.tap(); await settle(); early.frame(801);
  assert.equal(early.drawStates.at(-1).time, 0, 'an immediate first click must wait for the initial CLI sound setting');
  assert.equal(early.sources.length, 0);
  finishSilentProfile(jsonResponse({ ...profileFixture, sound: false })); await settle(); early.frame(901);
  assert.equal(early.element('currentTime').textContent, '00.10');
  assert.equal(early.sources.length, 0, 'a late --silent profile must never leak opening sound');

  const embedSearch = '?embed=1&parentOrigin=http%3A%2F%2F127.0.0.1%3A8770&channel=channel-test-12345678';
  const embedded = createHarness({ embedded: true, search: embedSearch }); await settle();
  assert.equal(embedded.messages[0].message.type, 'ready');
  assert.equal(embedded.messages[0].origin, 'http://127.0.0.1:8770');
  assert.equal(embedded.messages[0].message.source, 'dsh-startup');
  assert.equal(embedded.messages[0].message.channel, 'channel-test-12345678');
  embedded.document.emit('keydown', { key: 'Escape', isComposing: true, target: embedded.element('identityName') });
  assert.equal(embedded.messages.length, 1, 'cancelling IME composition must not skip the film');
  const reducedEmbed = createHarness({ embedded: true, search: embedSearch + '&motion=reduce' }); await settle();
  reducedEmbed.frame(1);
  assert.equal(reducedEmbed.drawStates.at(-1).reducedMotion, true, 'the app accessibility preference must reach the isolated film');
  embedded.tap(); await settle(); embedded.element('skip').emit('click');
  assert.equal(embedded.messages.at(-1).message.type, 'skip');
  assert.equal(embedded.frames.size, 0, 'the embedded film stops rendering before handing over to Harness');
  assert.ok(embedded.contexts.every(context => context.state === 'closed'));
  embedded.element('skip').emit('click'); embedded.tap(); await settle();
  assert.equal(embedded.messages.length, 2, 'finishing the embedded film is idempotent');
  const finishVoice = { busy: false, unlock() {}, phase() { this.busy = true; }, cancel() { this.busy = false; }, setMuted() {} };
  const completedEmbed = createHarness({ embedded: true, search: embedSearch, voice: finishVoice }); await settle();
  completedEmbed.element('seek').value = '11.3'; completedEmbed.element('seek').emit('input');
  completedEmbed.tap(); await settle(); completedEmbed.frame(5001);
  assert.equal(completedEmbed.messages.length, 1, 'keep the final voice tail before removing the gate');
  finishVoice.busy = false; completedEmbed.frame(5002);
  assert.equal(completedEmbed.messages.at(-1).message.type, 'complete');
  assert.equal(completedEmbed.frames.size, 0);
  const invalidEmbed = createHarness({ embedded: true, search: embedSearch.replace('http%3A%2F%2F127.0.0.1%3A8770', 'null') });
  invalidEmbed.element('skip').emit('click'); assert.equal(invalidEmbed.messages.length, 0, 'invalid parent origins disable the bridge');
  const standalone = createHarness({ search: embedSearch }); standalone.element('skip').emit('click');
  assert.equal(standalone.messages.length, 0, 'query parameters cannot make a standalone page send messages');
  // A real access lock is independent of playback, seeking and skip controls.
  let unlocked = false, passwordAttempts = 0;
  const accessStatus = () => ({ enabled: true, unlocked, token: profileFixture.token, sound: false, profile: { username: profileFixture.username, badge_id: profileFixture.badge_id } });
  const locked = createHarness({ embedded: true, search: embedSearch, accessFetch: async (url, init) => {
    if (url === '/api/access/unlock') {
      passwordAttempts++;
      assert.equal(init.headers['X-DSH-Token'], profileFixture.token);
      assert.equal(init.credentials, 'same-origin');
      if (JSON.parse(init.body).password !== 'only-a-test-password') return jsonResponse({ error: { code: 'incorrect_password', message: '访问密码不正确' } }, 401);
      unlocked = true;
    }
    return jsonResponse(accessStatus());
  } });
  await settle();
  assert.equal(locked.requests.filter(item => item.url === '/api/profile').length, 0, 'a locked preview reads only the public identity');
  assert.equal(locked.element('cardName').textContent, 'CatShark');
  assert.equal(locked.element('accessEntry').hidden, false);
  assert.equal(locked.element('sound').getAttribute('aria-pressed'), 'false', 'public access status respects silent mode before unlocking');
  assert.equal(locked.element('saveIdentity').disabled, true);
  locked.element('seek').value = '11.4'; locked.element('seek').emit('input');
  assert.equal(locked.drawStates.at(-1).phase, 2, 'seeking cannot skip past password verification');
  locked.tap(); await settle(); locked.frame(6000);
  assert.equal(locked.drawStates.at(-1).phase, 2, 'continuous playback must hold at the identity boundary');
  assert.equal(locked.requests.filter(item => item.url === '/api/load').length, 0);
  locked.element('skip').emit('click');
  assert.equal(locked.messages.length, 1, 'the film cannot signal completion while access is locked');
  assert.equal(locked.document.activeElement, locked.element('accessPassword'));
  locked.element('accessPassword').value = 'incorrect-test-password'; locked.element('accessForm').emit('submit');
  await settle();
  assert.equal(locked.element('accessPassword').value, '', 'password text is cleared after submission');
  assert.match(locked.element('accessMessage').textContent, /访问密码不正确/);
  assert.equal(locked.messages.length, 1);
  locked.element('accessPassword').value = 'only-a-test-password'; locked.element('accessForm').emit('submit');
  await settle(); await settle();
  assert.equal(passwordAttempts, 2);
  assert.equal(locked.element('accessEntry').hidden, true);
  assert.equal(locked.messages.at(-1).message.type, 'unlocked');
  assert.ok(locked.requests.filter(item => item.url === '/api/access').length >= 2, 'the successful response must be rechecked with the actual cookie');
  assert.equal(locked.element('saveIdentity').disabled, false);
  locked.frame(9500); await settle();
  assert.equal(locked.requests.filter(item => item.url === '/api/load').length, 1, 'real inventory starts only after successful verification');

  const noCookie = createHarness({ accessFetch: async (url) => jsonResponse({ ...accessStatus(), unlocked: url.endsWith('/unlock') }) });
  await settle(); noCookie.element('accessPassword').value = 'only-a-test-password'; noCookie.element('accessForm').emit('submit'); await settle(); await settle();
  assert.equal(noCookie.element('accessEntry').hidden, false, 'a POST success without an accepted cookie is not an unlocked session');
  assert.match(noCookie.element('accessMessage').textContent, /无法确认访问状态/);

  // Keep the actual phase boundary running while cookie verification waits.
  // A POST success cannot temporarily hide the form or initiate real discovery.
  let finishCookieCheck, cookieReads = 0;
  const delayedCookie = createHarness({ accessFetch: async (url) => {
    if (url === '/api/access/unlock') return jsonResponse({ ...accessStatus(), unlocked: true });
    if (++cookieReads === 1) return jsonResponse({ ...accessStatus(), unlocked: false });
    return new Promise(resolve => { finishCookieCheck = resolve; });
  } });
  await settle(); delayedCookie.element('seek').value = '5.9'; delayedCookie.element('seek').emit('input');
  delayedCookie.tap(); await settle(); delayedCookie.frame(4001);
  assert.equal(delayedCookie.drawStates.at(-1).phase, 2);
  delayedCookie.element('accessPassword').value = 'only-a-test-password'; delayedCookie.element('accessForm').emit('submit');
  await settle(); delayedCookie.frame(8001);
  assert.equal(delayedCookie.element('accessEntry').hidden, false, 'the input remains visible while cookie verification is pending');
  assert.equal(delayedCookie.element('accessSubmit').disabled, true);
  assert.equal(delayedCookie.drawStates.at(-1).phase, 2, 'a pending cookie check cannot release the identity chapter');
  assert.equal(delayedCookie.requests.filter(item => item.url === '/api/load').length, 0, 'no real inventory request may start during cookie verification');
  finishCookieCheck(jsonResponse({ ...accessStatus(), unlocked: false })); await settle(); await settle();
  assert.equal(delayedCookie.element('accessEntry').hidden, false);
  assert.match(delayedCookie.element('accessMessage').textContent, /无法确认访问状态/);

  // A manual reconnect begun before the password POST holds stale lock state.
  // Forced verification must supersede it, and its late result must be ignored.
  let finishOldConnect, contentionReads = 0;
  const contention = createHarness({ accessFetch: async (url) => {
    if (url === '/api/access/unlock') return jsonResponse({ ...accessStatus(), unlocked: true });
    contentionReads++;
    if (contentionReads === 2) return new Promise(resolve => { finishOldConnect = resolve; });
    return jsonResponse({ ...accessStatus(), unlocked: contentionReads >= 3 });
  } });
  await settle(); contention.element('connectLocal').emit('click'); await settle();
  const oldConnect = contention.requests.filter(item => item.url === '/api/access').at(-1);
  contention.element('accessPassword').value = 'only-a-test-password'; contention.element('accessForm').emit('submit');
  await settle(); await settle();
  assert.equal(contentionReads, 3, 'verification must make a fresh GET rather than reuse the pre-unlock request');
  assert.equal(oldConnect.signal.aborted, true, 'superseded manual reconnect must be aborted');
  assert.equal(contention.element('accessEntry').hidden, true);
  finishOldConnect(jsonResponse({ ...accessStatus(), unlocked: false })); await settle();
  assert.equal(contention.element('accessEntry').hidden, true, 'a late stale GET cannot relock a verified session');
  assert.equal(contention.element('saveIdentity').disabled, false);

  let finishUnlockJson;
  const disposedUnlock = createHarness({ embedded:true, search:embedSearch, accessFetch:async url => url.endsWith('/unlock')
    ? {ok:true,status:200,json:()=>new Promise(resolve=>{finishUnlockJson=resolve;})}
    : jsonResponse({...accessStatus(),unlocked:false}) });
  await settle(); disposedUnlock.element('accessPassword').value='only-a-test-password'; disposedUnlock.element('accessForm').emit('submit');
  await settle(); disposedUnlock.windowEvents.emit('pagehide');
  const disposedPost=disposedUnlock.requests.find(item=>item.url==='/api/access/unlock');
  assert.equal(disposedPost.signal.aborted,true,'leaving the page must abort a pending password request');
  finishUnlockJson({...accessStatus(),unlocked:true}); await settle();
  assert.equal(disposedUnlock.messages.filter(item=>item.message.type==='unlocked').length,0,'late parsed responses cannot authorize a disposed iframe');
  assert.equal(disposedUnlock.requests.filter(item=>item.url==='/api/access').length,1,'a disposed unlock cannot start cookie verification');
  assert.equal(disposedUnlock.requests.filter(item=>item.url==='/api/load').length,0);

  const invalidUnlock = createHarness({accessFetch:async url=>jsonResponse(url.endsWith('/unlock')
    ? {enabled:true,unlocked:true,profile:{username:'INVALID'}}
    : {...accessStatus(),unlocked:false})});
  await settle(); invalidUnlock.element('accessPassword').value='only-a-test-password'; invalidUnlock.element('accessForm').emit('submit'); await settle();
  assert.equal(invalidUnlock.element('accessEntry').hidden,false,'malformed success responses cannot release the password gate');
  assert.match(invalidUnlock.element('accessMessage').textContent,/无效资料/);
  assert.equal(invalidUnlock.requests.filter(item=>item.url==='/api/profile').length,0);
  let themeProfile={...profileFixture,visual_style:'laterano'},themeFails=false;
  const themeFetch=async(url,init={})=>{
    if(url==='/api/profile'&&init.method==='POST'){
      if(themeFails)return jsonResponse({message:'Theme disk failure'},500);
      themeProfile={...themeProfile,...JSON.parse(init.body)};
    }
    return jsonResponse(themeProfile);
  };
  const themed=createHarness({fetch:themeFetch,embedded:true,search:embedSearch});await settle();
  assert.equal(themed.document.documentElement.dataset.visualStyle,'laterano');
  assert.equal(themed.drawStates.at(-1).visualStyle,'laterano','saved style must select the actual second renderer');
  assert.equal(themed.element('seek').max,'20.4');
  themed.element('visualStyle').value='rhine';themed.element('visualStyle').emit('change');await settle();
  assert.deepEqual(JSON.parse(themed.requests.findLast(item=>item.method==='POST').body),{visual_style:'rhine'},'appearance must not overwrite identity');
  assert.equal(themeProfile.username,profileFixture.username);
  assert.equal(themed.document.documentElement.dataset.visualStyle,'rhine');
  assert.equal(themed.messages.filter(item=>item.message.type==='profile-changed').length,1,'a successful iframe save must notify its verified parent');
  const themeReload=createHarness({fetch:themeFetch});await settle();
  assert.equal(themeReload.document.documentElement.dataset.visualStyle,'rhine');
  themeFails=true;themed.element('visualStyle').value='laterano';themed.element('visualStyle').emit('change');await settle();
  assert.equal(themed.document.documentElement.dataset.visualStyle,'rhine','a failed style save restores the saved appearance');
  assert.match(themed.element('styleStatus').textContent,/Theme disk failure/);
  assert.equal(themed.messages.filter(item=>item.message.type==='profile-changed').length,1,'failed writes must not announce a changed profile');
  const lockedTheme=createHarness({accessFetch:async()=>jsonResponse({...accessStatus(),unlocked:false,profile:{...accessStatus().profile,visual_style:'laterano'}})});await settle();
  assert.equal(lockedTheme.document.documentElement.dataset.visualStyle,'laterano','the password gate must already use the saved style');
  assert.equal(lockedTheme.requests.filter(item=>item.url==='/api/profile').length,0);

  const lateranoFetch = stream => async url => {
    if (url === '/api/profile') return jsonResponse({ ...profileFixture, visual_style: 'laterano', sound: false });
    if (url === '/api/load') return stream.response;
    return jsonResponse({ message: 'Not found' }, 404);
  };
  // Waiting is a playback gate, not a second animation clock. Confirming a
  // partly composed scene must preserve its pose; explicit seeks still rewind.
  const smoothGate = createHarness({ fetch: lateranoFetch(ndjsonStream()) }); await settle();
  smoothGate.frame(701);
  const waitingPose = smoothGate.drawStates.at(-1);
  assert.equal(waitingPose.waiting, true);
  assert.ok(waitingPose.visualProgress > 0 && waitingPose.visualProgress < 1);
  smoothGate.tap(); await settle();
  assert.equal(smoothGate.drawStates.at(-1).visualProgress, waitingPose.visualProgress, 'starting a waiting scene must preserve its partially composed geometry');
  smoothGate.frame(1101);
  assert.ok(smoothGate.drawStates.at(-1).visualProgress >= waitingPose.visualProgress);
  smoothGate.frame(6701); smoothGate.frame(7301);
  assert.equal(smoothGate.drawStates.at(-1).phase, 2);
  const gatePose = smoothGate.drawStates.at(-1).visualProgress;
  smoothGate.tap(); await settle();
  assert.equal(smoothGate.drawStates.at(-1).visualProgress, gatePose, 'identity confirmation must not reassemble the portal from zero');
  smoothGate.element('play').emit('click');
  const pausedPose = smoothGate.drawStates.at(-1).visualProgress;
  smoothGate.frame(7701);
  assert.equal(smoothGate.drawStates.at(-1).visualProgress, pausedPose, 'manual pause must freeze the geometric clock');
  smoothGate.element('seek').value = '7.8'; smoothGate.element('seek').emit('input');
  assert.ok(Math.abs(smoothGate.drawStates.at(-1).visualProgress - .5) < 1e-9, 'a seek to the midpoint must display the actual midpoint pose');
  smoothGate.element('seek').value = '6.36'; smoothGate.element('seek').emit('input');
  assert.ok(Math.abs(smoothGate.drawStates.at(-1).visualProgress - .1) < 1e-9, 'an explicit backward seek must be able to rewind the geometry');
  smoothGate.element('replay').emit('click');
  assert.equal(smoothGate.drawStates.at(-1).visualProgress, 0, 'replay starts a fresh construction');

  // These are independently measured DOM rectangles in a nonzero pane origin.
  // A slight gap and unequal leaf widths prevent a guessed screen-center spine
  // from satisfying the same assertions as the real page layout.
  const bookStream = ndjsonStream();
  let book;
  // Model flex reflow at the actual DOM mutation: revealing the real issue
  // message shortens both leaves, while the outer panel keeps the same size.
  const leafHeight = () => book && !book.element('inventoryIssues').hidden ? 238 : 260;
  book = createHarness({ fetch: lateranoFetch(bookStream),
    selectors: { '.inventory-column': ['skillsPage', 'pluginsPage'] },
    rectangles: {
      canvasPane: { left: 47, top: 31, width: 1280, height: 720 },
      stageCopy: { left: 290, top: 125, width: 700, height: 130 },
      inventoryPanel: { left: 230, top: 330, width: 924, height: 314 },
      inventoryBook: { left: 230, top: 330, width: 924, get height() { return leafHeight(); } },
      skillsPage: { left: 230, top: 330, width: 438, get height() { return leafHeight(); } },
      pluginsPage: { left: 688, top: 330, width: 466, get height() { return leafHeight(); } },
    },
  }); await settle();
  book.element('seek').value = '9.6'; book.element('seek').emit('input');
  assert.equal(book.drawStates.at(-1).bookOpen, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(book.drawStates.at(-1).layout.book)), {
    x: 183, y: 299, width: 924, height: 260, gutterX: 631, spread: true,
    left: { x: 183, y: 299, width: 438, height: 260 }, right: { x: 641, y: 299, width: 466, height: 260 },
  }, 'folio bounds and spine must derive from actual DOM leaves relative to the canvas pane');
  book.tap(); await settle(); book.frame(401);
  const readingPose = book.drawStates.at(-1);
  assert.equal(readingPose.phase, 3);
  assert.ok(readingPose.bookOpen > 0 && readingPose.bookOpen < 1);
  assert.equal(Number(book.element('inventoryPanel').style['--book-open']), readingPose.bookOpen,
    'CSS text reveal and canvas folio must receive the same eased opening value');
  bookStream.event({ ...inventoryFixture, issues: [{ name: 'actual-file-issue', message: 'The local host returned this real issue.' }] });
  bookStream.close(); await settle(); await settle();
  const arrivedPose = book.drawStates.at(-1);
  assert.equal(arrivedPose.inventory.status, 'complete');
  assert.equal(arrivedPose.bookOpen, readingPose.bookOpen, 'a fast real result must not close or snap open a still-opening folio');
  assert.equal(arrivedPose.visualProgress, readingPose.visualProgress, 'changing the result heading must not restart the geometric scene');
  assert.equal(arrivedPose.textAge, readingPose.textAge, 'the book clock must survive true inventory and heading updates');
  assert.equal(book.element('inventoryIssues').hidden, false);
  assert.equal(arrivedPose.layout.inventory.height, 314, 'the outer panel need not resize when an issue appears');
  assert.equal(arrivedPose.layout.book.height, 238, 'the folio must remeasure after the real issue message compresses its flex area');
  assert.equal(arrivedPose.layout.book.left.height, 238);
  assert.equal(arrivedPose.layout.book.right.height, 238, 'both leaf baselines must follow the new measured height');
  book.frame(1501);
  const originalSkillRow = book.element('skillsList').children[0];
  assert.equal(originalSkillRow.children[0].getAttribute('data-lettering'), 'settled');
  const copiesBeforeRegistration = book.canvasCalls.filter(call => call.op === 'drawImage').length;
  book.frame(5001);
  assert.equal(book.drawStates.at(-1).phase, 4);
  assert.equal(book.drawStates.at(-1).waiting, true);
  assert.equal(book.drawStates.at(-1).bookOpen, 1, 'registration must retain the already opened folio');
  assert.equal(book.canvasCalls.filter(call => call.op === 'drawImage').length, copiesBeforeRegistration,
    'discovery to registration is the same open book, not an overlapping whole-page snapshot');
  assert.equal(book.element('skillsList').children[0], originalSkillRow, 'the real inventory rows must be carried into registration');
  assert.equal(originalSkillRow.children[0].getAttribute('data-lettering'), 'settled', 'carried inventory names must not roll again at the chapter boundary');

  // Other chapters retain their last painted frame and blend it away, while
  // explicit playback controls never leave an old layer over the selected pose.
  book.tap(); await settle(); book.frame(7901);
  assert.equal(book.drawStates.at(-1).phase, 5);
  assert.ok(book.canvasCalls.some(call => call.canvas === 'sceneTransition' && call.op === 'drawImage' && call.args[0] === book.element('scene')),
    'ordinary chapter changes must capture the actual outgoing canvas');
  assert.equal(Number(book.element('sceneTransition').style.opacity), 1);
  book.frame(8201);
  assert.ok(Number(book.element('sceneTransition').style.opacity) > 0 && Number(book.element('sceneTransition').style.opacity) < 1,
    'the outgoing frame must fade continuously through the middle of the transition');
  book.frame(8502);
  assert.equal(Number(book.element('sceneTransition').style.opacity), 0, 'the outgoing frame must be gone after 600ms');
  book.element('seek').value = '3.39'; book.element('seek').emit('input');
  book.tap(); await settle(); book.frame(8522);
  assert.ok(Number(book.element('sceneTransition').style.opacity) > 0);
  book.element('play').emit('click');
  assert.equal(Number(book.element('sceneTransition').style.opacity), 0, 'pausing must clear the previous chapter overlay');
  book.element('seek').value = '3.39'; book.element('seek').emit('input');
  book.tap(); await settle(); book.frame(8542);
  assert.ok(Number(book.element('sceneTransition').style.opacity) > 0);
  book.element('seek').value = '6.3'; book.element('seek').emit('input');
  assert.equal(Number(book.element('sceneTransition').style.opacity), 0, 'seeking must display its exact pose without a stale transition');
  book.element('seek').value = '3.39'; book.element('seek').emit('input');
  book.tap(); await settle(); book.frame(8562);
  assert.ok(Number(book.element('sceneTransition').style.opacity) > 0);
  book.windowEvents.emit('pagehide');
  assert.equal(Number(book.element('sceneTransition').style.opacity), 0, 'pagehide must discard an in-progress outgoing layer before caching the page');
  book.windowEvents.emit('pageshow', { persisted: true }); await settle(); book.frame(8762);
  assert.equal(Number(book.element('sceneTransition').style.opacity), 0, 'restoring a paused cached page must not retain a frozen translucent old scene');

  const stillBook = createHarness({ reducedMotion: true, fetch: lateranoFetch(ndjsonStream()) }); await settle();
  stillBook.element('seek').value = '9.6'; stillBook.element('seek').emit('input');
  assert.equal(stillBook.drawStates.at(-1).visualProgress, 1);
  assert.equal(stillBook.drawStates.at(-1).bookOpen, 1, 'reduced motion must show the readable open spread immediately');
  assert.equal(Number(stillBook.element('inventoryPanel').style['--book-open']), 1);
  assert.equal(Number(stillBook.element('sceneTransition').style.opacity), 0);
  assert.equal(stillBook.canvasCalls.filter(call => call.op === 'drawImage').length, 0, 'reduced motion must never capture animated outgoing layers');

  // Half speed must slow the same book clock that drives the actual leaf mask.
  // Compare matching playback time, rather than duplicating its easing formula.
  const normalStream = ndjsonStream(), halfStream = ndjsonStream();
  const normalSpeed = createHarness({ fetch: lateranoFetch(normalStream) });
  const halfSpeed = createHarness({ fetch: lateranoFetch(halfStream) }); await settle();
  for (const harness of [normalSpeed, halfSpeed]) {
    harness.element('seek').value = '9.6'; harness.element('seek').emit('input');
  }
  halfSpeed.element('speed').value = '.5'; halfSpeed.element('speed').emit('change');
  normalSpeed.tap(); halfSpeed.tap(); await settle();
  normalSpeed.frame(401); halfSpeed.frame(801);
  assert.equal(halfSpeed.drawStates.at(-1).bookOpen, normalSpeed.drawStates.at(-1).bookOpen,
    'half speed over twice the wall time must reach the same page-opening pose');
  normalSpeed.frame(801);
  assert.ok(halfSpeed.drawStates.at(-1).bookOpen < normalSpeed.drawStates.at(-1).bookOpen,
    'half speed must not finish the folio at normal-speed wall time');
  normalSpeed.windowEvents.emit('pagehide'); halfSpeed.windowEvents.emit('pagehide');
  normalStream.close(); halfStream.close(); await settle();
  console.log('PASS: startup lifecycle, real inventory, voice/access barriers, persisted styles, measured center-opening folio, uninterrupted scene clocks, continuous transitions and reduced motion.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });

// Execute the same lettering module used by DOM and Canvas. Assertions protect
// literal local data, stable layout, replay/seek and reduced-motion behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function node(value = '') {
  const writes = [];
  return {
    _text: value, children: [], attributes: new Map(), classList: { add() {} }, writes,
    style: new Proxy({ setProperty(key, value) { this[key] = value; } }, { set(target, key, value) { writes.push(key); target[key] = value; return true; } }),
    get textContent() { return this._text + this.children.map(x => x.textContent).join(''); },
    set textContent(value) { this._text = String(value); this.children = []; },
    replaceChildren(...children) { this._text = ''; this.children = children; },
    setAttribute(key, value) { writes.push(key); this.attributes.set(key, value); },
  };
}
let segmentCalls = 0;
class CountingSegmenter {
  constructor(...args) { this.segmenter = new Intl.Segmenter(...args); }
  segment(value) { segmentCalls++; return this.segmenter.segment(value); }
}
const sandbox = { document: { createElement: () => node() }, Intl: { Segmenter: CountingSegmenter } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/startup-text.js'), 'utf8'), sandbox);
const { sample, View, Stage, characters } = sandbox.DSHText;
const literal = 'CatShark 深潜 👩🏽‍💻 <plugin>&';
assert.equal(characters('👩🏽‍💻').length, 1, 'animation must keep grapheme clusters intact');
const beforeSettled = segmentCalls;
for (const kind of ['roll', 'mask', 'type', 'decode']) sample('settled-only 🧑🏽‍🚀 ' + kind, 9, { kind });
assert.equal(segmentCalls, beforeSettled, 'settled text must not invoke grapheme segmentation at all');
const compound = 'A\u0301👩🏽‍💻🇦🇺猫';
const originalClusters = Array.from(characters(compound)), afterFirst = segmentCalls;
assert.deepEqual(originalClusters, ['A\u0301', '👩🏽‍💻', '🇦🇺', '猫']);
assert.deepEqual(Array.from(characters(compound)), originalClusters);
assert.equal(segmentCalls, afterFirst, 'repeated real names must reuse their parsed graphemes');
for (let index = 0; index < 1000; index++) characters('temporary-scan-name-' + index);
const beforeEvicted = segmentCalls;
assert.deepEqual(Array.from(characters(compound)), originalClusters, 'cache eviction must not corrupt combining or joined Unicode characters');
assert.equal(segmentCalls, beforeEvicted + 1, 'a long scan must evict old names instead of retaining an unbounded grapheme cache');
for (const kind of ['roll', 'mask', 'type', 'decode']) {
  for (const age of [0, .15, .4, .82, 2, -10, Infinity, NaN]) {
    const frame = sample(literal, age, { kind });
    for (const field of ['offset', 'reveal', 'cover', 'blur']) assert.ok(Number.isFinite(frame[field]));
    assert.equal(JSON.stringify(frame), JSON.stringify(sample(literal, age, { kind })), 'seek must be deterministic');
  }
  assert.equal(sample(literal, 2, { kind }).text, literal);
  const still = sample(literal, 0, { kind, delay: 30, reducedMotion: true });
  assert.equal(still.text, literal); assert.equal(still.settled, true);
  assert.equal(still.offset, 0); assert.equal(still.blur, 0); assert.equal(still.cover, 0);
}
const label = node(literal), view = new View(label, { kind: 'mask' });
view.render(.2, false);
assert.equal(label.textContent, literal, 'real data must remain accessible during its visual reveal');
assert.equal(label.style.transform, undefined, 'do not transform the measured host/card/row');
assert.notEqual(label.style['--dsh-ink-cover'], '0.00000');
view.render(1, false); assert.equal(label.style['--dsh-ink-cover'], '0.00000');
const settledWrites = label.writes.length + view.ink.writes.length;
view.render(2, false); view.render(3, false);
assert.equal(label.writes.length + view.ink.writes.length, settledWrites, 'settled labels must not repeatedly touch DOM styles');
view.render(.2, false);
assert.notEqual(label.style['--dsh-ink-cover'], '0.00000', 'a rewind must leave the settled fast path and restore the earlier lettering pose');
view.render(2, false); view.set(compound); view.render(.2, false);
assert.equal(label.textContent, compound, 'new real text must replace cached settled text literally');
assert.notEqual(label.style['--dsh-ink-cover'], '0.00000', 'a changed label must animate even after its previous value settled');
view.render(.2, true); assert.equal(view.ink.style.clipPath, 'none');
view.render(.2, false); assert.notEqual(label.style['--dsh-ink-cover'], '0.00000', 'disabling reduced motion at the same early age must restore its actual motion pose');
const stage = new Stage({ querySelectorAll: () => [] });
stage.begin(3, 0, 4, false); stage.set(label, '…', { kind: 'roll' }); stage.render();
assert.equal(label.textContent, '…', 'unknown inventory remains unknown during loading');
stage.begin(3, .7, 4.7, false); stage.set(label, '01'); stage.render();
assert.equal(label.textContent, '01', 'reels must never invent intermediate inventory counts');
stage.begin(3, 1.3, 5.3, false); stage.render();
assert.equal(label.attributes.get('data-lettering'), 'settled');
stage.begin(4, 0, 5.4, false); stage.render();
assert.equal(label.attributes.get('data-lettering'), 'roll', 'a new phase should restart visible lettering');
stage.begin(4, 0, 5.4, true); stage.render();
assert.equal(label.attributes.get('data-lettering'), 'settled');
stage.begin(2, 1.5, 5.4, false, true); stage.set(label, '访问身份确认'); stage.render();
assert.equal(label.attributes.get('data-lettering'), 'settled', 'seeking into a phase must show its actual timeline pose, not freeze a new title at age zero');
stage.begin(2, .2, 5.4, false, true); stage.render();
assert.equal(label.attributes.get('data-lettering'), 'roll', 'seeking backward must restore the earlier reveal pose');
stage.remove(label); assert.equal(stage.views.size, 0, 'removed inventory rows must release their animation state');
console.log('PASS: deterministic rolling/type/mask/decode lettering; real accessible data, fixed hosts, graphemes, seek, reduced motion.');

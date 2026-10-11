// Exercise the actual Laterano renderer with measured host layouts. These
// checks cover geometry and truthful data; browser review covers appearance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const name of ['startup-laterano-emblem.js', 'startup-text.js', 'startup-laterano.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs', name), 'utf8'), sandbox, { filename: name });
}
const { draw, phaseCount } = sandbox.window.DSHLateranoVisuals;
assert.equal(phaseCount, 6);
assert.ok(sandbox.window.DSHLateranoEmblem.parts.length >= 3, 'render the shipped emblem rather than a fixture');

function recordingContext() {
  const records = [], stack = [];
  let matrix = [1, 0, 0, 1, 0, 0];
  const state = {
    globalAlpha: .73, globalCompositeOperation: 'source-over', fillStyle: '#123456', strokeStyle: '#654321',
    lineWidth: 2, lineCap: 'round', lineJoin: 'round', font: '12px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', lineDash: [2, 3],
  };
  const initial = JSON.stringify(state);
  const finite = values => values.forEach(value => assert.ok(Number.isFinite(value), `nonfinite canvas geometry: ${value}`));
  const record = (op, args = []) => records.push({ op, args, matrix: [...matrix], ...state });
  function transform(next) {
    finite(next);
    const [a, b, c, d, e, f] = matrix, [aa, bb, cc, dd, ee, ff] = next;
    matrix = [a * aa + c * bb, b * aa + d * bb, a * cc + c * dd, b * cc + d * dd, a * ee + c * ff + e, b * ee + d * ff + f];
    finite(matrix);
  }
  const ctx = {
    save() { stack.push({ state: { ...state }, matrix: [...matrix] }); },
    restore() { assert.ok(stack.length, 'unmatched restore'); const saved = stack.pop(); Object.assign(state, saved.state); matrix = saved.matrix; },
    translate(x, y) { transform([1, 0, 0, 1, x, y]); },
    scale(x, y) { transform([x, 0, 0, y, 0, 0]); },
    rotate(angle) { finite([angle]); transform([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]); },
    transform(...values) { transform(values); },
    setLineDash(values) { finite(values); state.lineDash = [...values]; },
    measureText(value) {
      const size = Number(state.font.match(/([\d.]+)px/)?.[1] || 12);
      return { width: [...String(value)].reduce((sum, char) => sum + size * (char.charCodeAt(0) > 255 ? 1 : .58), 0) };
    },
    fillText(value, x, y) { finite([x, y]); record('fillText', [String(value), x, y]); },
  };
  for (const property of Object.keys(state).filter(key => key !== 'lineDash')) Object.defineProperty(ctx, property, {
    get: () => state[property],
    set(value) {
      if (typeof value === 'number') finite([value]);
      if (property === 'globalAlpha') assert.ok(value >= 0 && value <= 1);
      if (property === 'lineWidth') assert.ok(value > 0);
      state[property] = value;
    },
  });
  for (const op of ['beginPath', 'closePath', 'clip', 'fill', 'stroke', 'moveTo', 'lineTo', 'arc', 'rect', 'fillRect']) ctx[op] = (...args) => {
    finite(args.filter(value => typeof value === 'number'));
    if (op === 'arc') assert.ok(args[2] >= 0);
    record(op, args);
  };
  return {
    ctx, records,
    finish() {
      assert.equal(stack.length, 0, 'saved canvas state leaked');
      assert.deepEqual(matrix, [1, 0, 0, 1, 0, 0], 'transform leaked');
      assert.equal(JSON.stringify(state), initial, 'caller styles changed');
      return createHash('sha256').update(JSON.stringify(records)).digest('hex');
    },
  };
}
function render(width, height, state) {
  const recorder = recordingContext(); draw(recorder.ctx, width, height, state);
  return { hash: recorder.finish(), records: recorder.records };
}
function screenPoint(record, x = record.args[0], y = record.args[1]) {
  const [a, b, c, d, e, f] = record.matrix;
  return [a * x + c * y + e, b * x + d * y + f];
}
const inventory = { status: 'complete', skills: [{ name: 'actual-skill' }], plugins: [{ name: 'actual-plugin' }], issues: [] };
const base = { identity: 'CatShark / 星海', inventory, choice: 1, pointer: [.82, .22], drag: .8, impulse: .35 };
let samples = 0, maxCommands = 0;
for (const [width, height] of [[1920, 1080], [1280, 720], [390, 844]]) {
  for (const light of [true, false]) {
    for (let phase = 0; phase < phaseCount; phase++) {
      for (const progress of [0, .001, .035, .16, .31, .42, .58, .82, .999, 1]) {
        const state = { ...base, phase, progress, light, time: phase * 2.4 + progress, ambientTime: 8 + progress };
        const first = render(width, height, state), second = render(width, height, state);
        assert.equal(first.hash, second.hash, 'frames must be deterministic');
        maxCommands = Math.max(maxCommands, first.records.length);
        assert.ok(first.records.length < 12000, 'canvas command budget exceeded');
        samples++;
      }
      const still = render(width, height, { ...base, phase, light, reducedMotion: true, progress: 0, time: 0, ambientTime: 0 });
      const later = render(width, height, { ...base, phase, light, reducedMotion: true, progress: 1, time: 99, ambientTime: 200, pointer: [0, 1], drag: -8, impulse: 1 });
      assert.equal(still.hash, later.hash, `reduced motion changed in phase ${phase}`);
    }
  }
}

// Exact same four corner origins and row centers at desktop and narrow zoom.
// The plate itself belongs to the DOM; its canvas markers follow its bounds.
for (const [width, height, box] of [
  [1920, 1080, { x: 705, y: 554, width: 510, height: 171 }],
  [1280, 720, { x: 430, y: 350, width: 420, height: 203 }],
  [390, 844, { x: 31, y: 354, width: 328, height: 222 }],
]) {
  const rows = [.15, .38, .62, .85].map(offset => ({ y: box.y + box.height * offset - 14, height: 28 }));
  const state = { ...base, phase: 2, reducedMotion: true, waiting: true, layout: { identity: { ...box, rows } } };
  const { records } = render(width, height, state);
  for (const row of rows) {
    const center = row.y + row.height / 2;
    const matching = records.filter(record => record.op === 'lineTo' && Math.abs(screenPoint(record)[1] - center) < 1e-7);
    assert.ok(matching.some(record => screenPoint(record)[0] < box.x), 'left row marker moved away from measured center');
    assert.ok(matching.some(record => screenPoint(record)[0] > box.x + box.width), 'right row marker moved away from measured center');
  }
  for (const [x, y] of [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]]) {
    assert.ok(records.some(record => record.op === 'moveTo' && record.strokeStyle === '#159dcc' && Math.hypot(screenPoint(record)[0] - x, screenPoint(record)[1] - y) < 1e-7), 'card corner registration is not exact');
  }
  for (const phase of [2, 3, 4]) {
    const sample = render(width, height, { ...state, phase, layout: { identity: box, inventory: box } });
    assert.ok(sample.records.some(record => {
      if (record.op !== 'rect') return false;
      const [left, top] = screenPoint(record), [right, bottom] = screenPoint(record, record.args[0] + record.args[2], record.args[1] + record.args[3]);
      return left < box.x && right > box.x + box.width && top < box.y && bottom > box.y + box.height && right - left < box.width + 80;
    }), 'reading surface must have a measured canvas exclusion');
  }
}

const caption = state => render(1280, 720, { ...base, phase: 4, reducedMotion: true, inventory: { ...inventory, ...state } }).records.filter(record => record.op === 'fillText').map(record => record.args[0]).join('');
assert.ok(caption({ status: 'complete' }).includes('ARCHIVE / LOCAL'));
assert.ok(caption({ status: 'complete', issues: [{ name: 'actual-error' }] }).includes('ARCHIVE / CHECK ISSUES'));
for (const status of ['idle', 'loading', 'error', 'unavailable', 'cancelled']) {
  assert.ok(caption({ status }).includes('ARCHIVE / NOT READ'));
  assert.ok(!caption({ status }).includes('ARCHIVE / LOCAL'));
}
const state = { ...base, phase: 3, progress: .68, textAge: 2, ambientTime: 3.7, impulse: 0 };
const empty = render(1280, 720, { ...state, inventory: { status: 'idle', skills: [], plugins: [] } });
const loading = render(1280, 720, { ...state, inventory: { status: 'loading', skills: [], plugins: [] } });
const loaded = render(1280, 720, { ...state, inventory });
assert.notEqual(empty.hash, loading.hash, 'only actual loading enables the travelling carrier');
assert.notEqual(empty.hash, loaded.hash, 'real discovered entries must populate the branch diagram');
for (const sample of [empty, loading, loaded]) {
  const copy = sample.records.filter(record => record.op === 'fillText').map(record => record.args[0]).join('');
  assert.ok(!/\d+\s*%|LOAD COMPLETE|SCAN SUCCESS/.test(copy), 'do not invent discovery results');
}

// Independent pointer and drag inputs really alter the diagram, while phase
// gates remain visible and static access/inventory measurements stay fixed.
const moving = { ...base, phase: 0, waiting: true, progress: 0, impulse: 0, textAge: 2 };
assert.notEqual(render(1280, 720, moving).hash, render(1280, 720, { ...moving, drag: 3 }).hash);
assert.notEqual(render(1280, 720, moving).hash, render(1280, 720, { ...moving, pointer: [0, 1] }).hash);
for (const phase of [2, 3]) {
  const state = { ...base, phase, reducedMotion: true };
  const baseline = render(1280, 720, state);
  for (const box of [{ x: NaN, y: 10, width: 10, height: 10 }, { x: 0, y: 0, width: 0, height: 30 }, { x: 0, y: 0, width: 100, height: Infinity }]) {
    assert.equal(render(1280, 720, { ...state, layout: { identity: box, inventory: box } }).hash, baseline.hash);
  }
}
for (const [width, height] of [[0, 100], [100, 0], [-1, 100], [Infinity, 200], [200, NaN]]) {
  assert.equal(render(width, height, base).records.length, 0);
}
draw(null, 1920, 1080, base);

// All six movements finish constructing and hold. Only genuine in-progress
// discovery may keep a travelling carrier; idle ambient time never spins art.
for (let phase = 0; phase < phaseCount; phase++) {
  const state = { ...base, phase, progress: 1, impulse: 0, textAge: 3, ambientTime: 0, time: 0 };
  assert.equal(render(1280, 720, state).hash, render(1280, 720, { ...state, ambientTime: 100, time: 100 }).hash,
    `phase ${phase} must hold its composed pose once construction finishes`);
}

// The two arch segments must physically meet at the apex, not approximate a
// pointed-arch shape with unrelated curves. Test the real recorded circle paths.
const portal = render(1280, 720, { ...base, phase: 2, reducedMotion: true, impulse: 0 });
const arch = portal.records.filter(record => record.op === 'arc' && record.lineWidth === 2.3 && record.globalAlpha === .88);
assert.equal(arch.length, 2);
const circlePoint = (record, angle) => screenPoint(record, record.args[0] + Math.cos(angle) * record.args[2], record.args[1] + Math.sin(angle) * record.args[2]);
const apexLeft = circlePoint(arch[0], arch[0].args[4]), apexRight = circlePoint(arch[1], arch[1].args[3]);
assert.ok(Math.hypot(apexLeft[0] - apexRight[0], apexLeft[1] - apexRight[1]) < 1e-7, 'pointed-arch arcs must intersect exactly');
const leftSpring = circlePoint(arch[0], arch[0].args[3]), rightSpring = circlePoint(arch[1], arch[1].args[4]);
assert.ok(Math.abs((leftSpring[1] - apexLeft[1]) / (rightSpring[0] - leftSpring[0]) - Math.sqrt(3) / 2) < 1e-7,
  'portal proportions must follow the equal-circle construction');

// Host headings may be offset, enlarged or wrapped independently of the card.
// Their real rectangle is clipped in its entirety, rather than a guessed center.
const heading = { x: 265, y: 153, width: 752, height: 128 };
for (const phase of [1, 2, 3, 4]) {
  const { records } = render(1280, 720, { ...base, phase, progress: .48, layout: { heading } });
  assert.ok(records.some(record => {
    if (record.op !== 'rect') return false;
    const from = screenPoint(record), to = screenPoint(record, record.args[0] + record.args[2], record.args[1] + record.args[3]);
    return Math.abs(from[0] - (heading.x - 14 * .72)) < 1e-7 && Math.abs(from[1] - (heading.y - 14 * .72)) < 1e-7 &&
      Math.abs(to[0] - (heading.x + heading.width + 14 * .72)) < 1e-7 && Math.abs(to[1] - (heading.y + heading.height + 14 * .72)) < 1e-7;
  }), `phase ${phase} omitted measured heading exclusion`);
}
console.log(`PASS: ${samples} Laterano frames, exact card/heading geometry, true pointed arches, still settled poses, truthful inventory and reduced motion. Peak: ${maxCommands}/12000.`);

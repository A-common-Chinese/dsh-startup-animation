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
  for (const op of ['beginPath', 'closePath', 'clip', 'fill', 'stroke', 'moveTo', 'lineTo', 'bezierCurveTo', 'arc', 'rect', 'fillRect']) ctx[op] = (...args) => {
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
// A gate can already be partly or fully composed before the user presses play.
// Its explicit visual clock must override the paused sequence's zero progress.
for (const phase of [0, 2, 4]) {
  for (const visualProgress of [.2, .6, 1]) {
    const state = { ...base, phase, visualProgress, progress: 0, textAge: 3, impulse: 0, bookOpen: 1 };
    assert.equal(render(1280, 720, { ...state, waiting: true }).hash,
      render(1280, 720, { ...state, waiting: false }).hash,
      `confirming gate ${phase} must not collapse the already composed geometry`);
  }
}
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

// Botanical decoration must be actual curved cutwork with transparent veins.
// Straight emblem contours and a font glyph are deliberately insufficient.
function curvedCutwork(records) {
  let curves = 0, contours = 0;
  const cutouts = [];
  for (const record of records) {
    if (record.op === 'beginPath') { curves = 0; contours = 0; }
    if (record.op === 'bezierCurveTo') curves++;
    if (record.op === 'moveTo') contours++;
    if (record.op === 'fill' && record.args[0] === 'evenodd' && curves >= 4 && contours >= 2)
      cutouts.push({ curves, contours, alpha: record.globalAlpha });
  }
  return cutouts;
}
for (const [width, height] of [[1920, 1080], [390, 844]]) {
  for (let phase = 0; phase < phaseCount; phase++) {
    const frame = render(width, height, { ...base, phase, reducedMotion: true, impulse: 0 });
    const motifs = curvedCutwork(frame.records);
    assert.ok(motifs.length >= 3, `phase ${phase} must retain the three veined iris petals at ${width}px`);
    assert.ok(motifs.some(motif => motif.alpha > .85), 'floral anchors must retain visible ink mass, not only faint outlines');
    const standards = frame.records.filter(record => record.op === 'moveTo' && record.args[0] === 0 && record.args[1] === -95);
    assert.equal(standards.length, 1, `phase ${phase} must have one principal iris, without duplicated marginal flowers`);
    const [a, b, c, d] = standards[0].matrix;
    assert.ok(a > 0 && d > 0 && Math.abs(b) < 1e-9 && Math.abs(c) < 1e-9,
      'the principal iris must stand upright, without rotation, reflection or shear');
    const falling = frame.records.filter(record => record.op === 'moveTo' && record.args[0] === 7 && record.args[1] === 24);
    assert.equal(falling.length, 2, 'one iris has exactly two mirrored falling petals');
    const left = screenPoint(falling[0]), right = screenPoint(falling[1]), axisX = screenPoint(standards[0])[0];
    assert.ok(Math.abs(left[0] + right[0] - axisX * 2) < 1e-7 && Math.abs(left[1] - right[1]) < 1e-7,
      'the paired petals must be balanced around the upright axis');
  }
}
const unfolded = progress => render(1280, 720, { ...base, phase: 0, progress, textAge: 3, impulse: 0 }).records;
const early = curvedCutwork(unfolded(.10)), late = curvedCutwork(unfolded(.78));
assert.ok(late.length >= early.length + 3, 'the three veined petals must unfold after the early geometric construction');
assert.notEqual(render(1280, 720, { ...base, phase: 0, progress: .45, textAge: 3, impulse: 0 }).hash,
  render(1280, 720, { ...base, phase: 0, progress: .78, textAge: 3, impulse: 0 }).hash,
  'the middle movement must unfold and reassemble rather than instantly reveal the whole design');
for (const phase of [0, 1, 5]) {
  const { records } = render(1280, 720, { ...base, phase, reducedMotion: true, impulse: 0 });
  const shield = records.findIndex((record, index) => record.op === 'arc' && record.args[0] === 0 && record.args[1] === -5 && record.args[2] === 102 &&
    records[index + 1]?.op === 'fill' && records[index + 1]?.fillStyle === '#f6f7f6' && records[index + 1]?.globalAlpha === 1);
  assert.ok(shield >= 0, `phase ${phase} must clear construction lines behind the DSH seal`);
  assert.ok(records.slice(shield + 1).some(record => record.op === 'fill' && record.args[0] === 'evenodd'),
    'seal ink must be laid down after its clean medallion');
}
// The marginal vocabulary includes a 24-ray seal and a real over/under braid,
// not just more copies of the iris. Record the ink geometry of these structures.
const rich = render(1280, 720, { ...base, phase: 0, reducedMotion: true }).records;
const rays = rich.filter(record => record.op === 'moveTo' && Math.abs(record.args[0] - 53 * .46) < 1e-9 && [-2, -5.2].includes(record.args[1]));
assert.equal(rays.length, 24, 'the radiant seal must construct its full set of alternating rays');
assert.equal(new Set(rays.map(record => record.matrix.slice(0, 4).map(value => value.toFixed(6)).join(','))).size, 24,
  'the seal rays must occupy distinct radial directions');
const paperBridges = rich.filter(record => record.op === 'stroke' && record.strokeStyle === '#f6f7f6' && record.lineWidth === 5);
assert.ok(paperBridges.length >= 2, 'the manuscript braid needs paper knockouts at alternating crossings');
assert.ok(rich.filter(record => record.op === 'stroke' && record.lineWidth === 1.45).length > paperBridges.length,
  'the braid must redraw continuous ink above its paper crossings');

// Locate the actual iris transform instead of guessing its center or scale.
// Its full petal envelope must remain visible and outside the measured folio.
for (const [width, height, page] of [
  [1280, 720, { x: 244, y: 315, width: 873, height: 252 }],
  [1528, 732, { x: 305, y: 318, width: 982, height: 247 }],
  [1920, 1080, { x: 360, y: 410, width: 1210, height: 388 }],
  [390, 844, { x: 24, y: 350, width: 342, height: 280 }],
]) {
  for (let phase = 0; phase < phaseCount; phase++) {
    const inBook = phase === 3 || phase === 4;
    const { records } = render(width, height, { ...base, phase, reducedMotion: true,
      layout: inBook ? { book: { ...page, gutterX: page.x + page.width / 2 }, inventory: page } : {} });
    const axis = records.find(record => record.op === 'moveTo' && record.args[0] === 0 && record.args[1] === -95);
    assert.ok(axis, 'the completed scene must retain its principal iris');
    const [left, top] = screenPoint(axis, -109, -95), [right, bottom] = screenPoint(axis, 109, 114);
    assert.ok(left >= 0 && top >= 0 && right <= width && bottom <= height,
      `the full iris silhouette must fit the ${width}x${height} viewport in phase ${phase}`);
    if (inBook) assert.ok(right < page.x || left > page.x + page.width || bottom < page.y || top > page.y + page.height,
      `the full iris silhouette must stay outside the actual folio at ${width}px`);
  }
}

// Actual host book rectangles are in screen pixels, including a possibly
// off-center binding. Every opening pose must reveal outward from that binding.
for (const [width, height, book] of [
  [1528, 732, { x: 305, y: 318, width: 922, height: 247, gutterX: 755, spread: true,
    left: { x: 305, y: 318, width: 437, height: 247 }, right: { x: 768, y: 318, width: 459, height: 247 } }],
  [390, 844, { x: 24, y: 350, width: 342, height: 280, gutterX: 198, spread: true,
    left: { x: 24, y: 350, width: 163, height: 280 }, right: { x: 209, y: 350, width: 157, height: 280 } }],
]) {
  const unit = Math.min(width, height) / 1000;
  const geometry = records => records.filter(record => record.op === 'rect' && Math.abs(record.args[3] * unit - (book.height + 54 * unit)) < 1e-7);
  for (const bookOpen of [0, .2, .5, 1]) {
    const state = { ...base, visualProgress: .75, textAge: 3, bookOpen, impulse: 0, layout: { book, inventory: book } };
    const loading = render(width, height, { ...state, phase: 3 }), ready = render(width, height, { ...state, phase: 4 });
    const clips = geometry(loading.records);
    assert.equal(clips.length, 2, 'each measured folio leaf needs one outward reveal mask');
    for (let index = 0; index < 2; index++) {
      const page = index ? book.right : book.left, edge = index ? page.x + page.width : page.x;
      const clip = clips[index], from = screenPoint(clip), to = screenPoint(clip, clip.args[0] + clip.args[2], clip.args[1] + clip.args[3]);
      const movingEdge = book.gutterX + (edge - book.gutterX) * bookOpen;
      assert.ok(Math.abs(from[0] - Math.min(book.gutterX, movingEdge)) < 1e-7 && Math.abs(to[0] - Math.max(book.gutterX, movingEdge)) < 1e-7,
        'the page reveal must start at the measured shared gutter and expand toward its actual outer edge');
      assert.ok(Math.abs(from[1] - (page.y - 18 * unit)) < 1e-7, 'folio mask must stay aligned with its actual page top');
    }
    assert.deepEqual(geometry(ready.records), clips, 'receiving results must carry the open folio into the next chapter without refolding');
    if (bookOpen > .5) {
      const binding = loading.records.filter(record => record.op === 'moveTo' && record.lineWidth === 1.5 && record.globalAlpha === .94);
      assert.ok(binding.some(record => Math.abs(screenPoint(record)[0] - book.gutterX) < 1e-7 &&
        Math.abs(screenPoint(record)[1] - (book.y - 10 * unit)) < 1e-7), 'the book spine must follow the measured gutter through resizing');
    }
  }
}
console.log(`PASS: ${samples} Laterano frames, exact measured geometry, single upright iris, radiant seals/braids, center-opening folio, gate continuity, truthful inventory and reduced motion. Peak: ${maxCommands}/12000.`);

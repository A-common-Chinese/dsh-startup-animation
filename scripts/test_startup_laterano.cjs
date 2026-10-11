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
  const records = [], stack = [], paintings = [];
  let currentPath = [], clips = [];
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
    save() { stack.push({ state: { ...state }, matrix: [...matrix], clips }); },
    restore() { assert.ok(stack.length, 'unmatched restore'); const saved = stack.pop(); Object.assign(state, saved.state); matrix = saved.matrix; clips = saved.clips; },
    translate(x, y) { transform([1, 0, 0, 1, x, y]); },
    scale(x, y) { transform([x, 0, 0, y, 0, 0]); },
    rotate(angle) { finite([angle]); transform([Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]); },
    transform(...values) { transform(values); },
    setLineDash(values) { finite(values); state.lineDash = [...values]; },
    measureText(value) {
      const size = Number(state.font.match(/([\d.]+)px/)?.[1] || 12);
      return { width: [...String(value)].reduce((sum, char) => sum + size * (char.charCodeAt(0) > 255 ? 1 : .58), 0) };
    },
    fillText(value, x, y) { finite([x, y]); record('fillText', [String(value), x, y]); paintings.push({ ...records.at(-1), commands: [], clips }); },
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
    if (op === 'beginPath') currentPath = [];
    else if (op === 'clip') clips = [...clips, { commands: [...currentPath], rule: args[0] || 'nonzero' }];
    else if (['fill', 'stroke', 'fillRect'].includes(op)) paintings.push({ ...records.at(-1), commands: [...currentPath], clips });
    else currentPath.push(records.at(-1));
  };
  return {
    ctx, records, paintings,
    finish() {
      assert.equal(stack.length, 0, 'saved canvas state leaked');
      assert.equal(clips.length, 0, 'canvas clipping leaked');
      assert.deepEqual(matrix, [1, 0, 0, 1, 0, 0], 'transform leaked');
      assert.equal(JSON.stringify(state), initial, 'caller styles changed');
      return createHash('sha256').update(JSON.stringify(records)).digest('hex');
    },
  };
}
function render(width, height, state) {
  const recorder = recordingContext(); draw(recorder.ctx, width, height, state);
  return { hash: recorder.finish(), records: recorder.records, paintings: recorder.paintings };
}
function screenPoint(record, x = record.args[0], y = record.args[1]) {
  const [a, b, c, d, e, f] = record.matrix;
  return [a * x + c * y + e, b * x + d * y + f];
}
function paintedPaths(records) {
  let commands = [];
  const paths = [];
  for (const record of records) {
    if (record.op === 'beginPath') commands = [];
    else if (['moveTo', 'lineTo', 'arc', 'bezierCurveTo', 'closePath', 'rect'].includes(record.op)) commands.push(record);
    else if (record.op === 'fill' || record.op === 'stroke') paths.push({ ...record, commands: [...commands] });
  }
  return paths;
}
function pathSegments(path) {
  const segments = [];
  let at = null, origin = null;
  function advance(point) { if (at && Math.hypot(at[0] - point[0], at[1] - point[1]) > 1e-9) segments.push([at, point]); at = point; }
  for (const command of path.commands) {
    const v = command.args;
    if (command.op === 'moveTo') { at = screenPoint(command); origin = at; }
    else if (command.op === 'lineTo') advance(screenPoint(command));
    else if (command.op === 'closePath' && origin) advance(origin);
    else if (command.op === 'arc') {
      for (let sample = 0; sample <= 192; sample++) {
        const angle = v[3] + (v[4] - v[3]) * sample / 192;
        advance(screenPoint(command, v[0] + Math.cos(angle) * v[2], v[1] + Math.sin(angle) * v[2]));
      }
    } else if (command.op === 'bezierCurveTo') {
      const start = at, p = [screenPoint(command, v[0], v[1]), screenPoint(command, v[2], v[3]), screenPoint(command, v[4], v[5])];
      if (!start) continue;
      for (let sample = 1; sample <= 48; sample++) {
        const t = sample / 48, s = 1 - t;
        advance([0, 1].map(axis => s ** 3 * start[axis] + 3 * s ** 2 * t * p[0][axis] + 3 * s * t ** 2 * p[1][axis] + t ** 3 * p[2][axis]));
      }
    }
  }
  return segments;
}
function distanceToSegments(point, segments) {
  return Math.min(...segments.map(([a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
    const q = length ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length)) : 0;
    return Math.hypot(point[0] - a[0] - dx * q, point[1] - a[1] - dy * q);
  }));
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

// Stage titles use glyph-local contrast, not a large rectangular hole in the
// architecture. Their measured bounds still anchor capitals and the handoff.
const heading = { x: 265, y: 153, width: 752, height: 128 };
const identityPlate = { x: 408, y: 333, width: 464, height: 200 };
for (const phase of [1, 2, 3, 4]) {
  const sample = render(1280, 720, { ...base, phase, progress: 1, impulse: 0, reducedMotion: true,
    layout: { heading, identity: identityPlate } });
  assert.ok(sample.paintings.every(paint => ![0, 8 * .72, 14 * .72].some(padding => clipHole(paint, heading, padding))),
    `phase ${phase} must keep the architecture continuous through the stage title bounds`);
  if (phase === 2) {
    const arches = sample.paintings.filter(paint => paint.op === 'stroke' && paint.lineWidth === 2.3 && paint.globalAlpha === .88);
    const numerals = sample.paintings.filter(paint => paint.op === 'fillText' && paint.globalAlpha === .055 && parseFloat(paint.font.split(' ')[1]) > 500);
    assert.ok(arches.length >= 2 && numerals.length === 3, 'the real pointed portal and III backdrop must still be painted');
    assert.ok([...arches, ...numerals].every(paint => clipHole(paint, identityPlate, 14 * .72)),
      'removing the stage-title hole must retain the measured password/identity plate exclusion');
  }
}
const boundSource = render(1280, 720, { ...base, phase: 3, progress: 0, visualProgress: 0, impulse: 0,
  bookAge: 0, bookOpen: 0, layout: { heading },
  bookSource: { phase: 2, progress: 1, viewport: { width: 1280, height: 720 }, layout: { heading, identity: identityPlate } } });
const sourceArches = boundSource.paintings.filter(paint => paint.op === 'stroke' && paint.lineWidth === 2.3 && paint.globalAlpha === .88);
assert.ok(sourceArches.length >= 2);
assert.ok(sourceArches.every(paint => clipHole(paint, identityPlate, 0) &&
  ![0, 8 * .72, 14 * .72].some(padding => clipHole(paint, heading, padding))),
  'the moving source arches must preserve identity protection without carrying a rectangular title hole into the book');

// Once the title no longer cuts a rectangular hole in the background, small
// foreground ornaments must be placed clear of its actual caption rectangle.
for (const [width, height, book] of [
  [1280, 720, { x: 210, y: 350, width: 860, height: 250, gutterX: 619,
    left: { x: 210, y: 350, width: 398, height: 250 }, right: { x: 630, y: 350, width: 440, height: 250 } }],
  [390, 844, { x: 24, y: 350, width: 342, height: 320, gutterX: 193,
    left: { x: 24, y: 350, width: 163, height: 320 }, right: { x: 199, y: 350, width: 167, height: 320 } }],
]) {
  for (const gap of [60, 3]) {
    const caption = { x: width * .18, y: book.y - gap - 95, width: width * .64, height: 95 };
    const sample = render(width, height, { ...base, phase: 3, reducedMotion: true, impulse: 0,
      layout: { book, inventory: book, heading: caption } });
    const braids = sample.paintings.filter(paint => paint.op === 'stroke' && paint.globalAlpha === .74 && [1.45, 5].includes(paint.lineWidth));
    if (gap === 60) {
      assert.ok(braids.length > 0, 'a genuine caption-to-paper gap should retain the paired manuscript braids');
      const points = braids.flatMap(pathSegments).flat();
      assert.ok(points.every(point => point[1] > caption.y + caption.height + 6 && point[1] < book.y - 8),
        'the complete braid silhouette must sit between the caption and paper, not across a title baseline');
    } else assert.equal(braids.length, 0, 'a compact stage must omit the upper braid pair when its measured gap is too small');
    const crest = sample.paintings.find(paint => paint.op === 'stroke' && paint.lineWidth === 1.1 && Math.abs(paint.globalAlpha - .576) < 1e-9);
    assert.ok(crest, 'the smaller interlace must remain as the binding ornament');
    assert.ok(Math.abs(crest.matrix[4] - book.gutterX) < 1e-7 && Math.abs(crest.matrix[5] - book.y) < 60,
      'the completed interlace must dock on the measured spine instead of hovering beside the subtitle');
    const crestInk = sample.paintings.filter(paint => Math.abs(paint.matrix[4] - crest.matrix[4]) < 1e-7 &&
      Math.abs(paint.matrix[5] - crest.matrix[5]) < 1e-7);
    assert.ok(crestInk.flatMap(pathSegments).flat().every(point => point[1] >= caption.y + caption.height + 5),
      'the whole interlace silhouette, including its protruding plates, must clear the final subtitle');
  }
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

// The last identity arch must survive as moving ink, including partial source
// poses. Compare the actual outgoing arcs with the transformed paths at age 0;
// this fails if a new approximate portal is simply faded in at the next chapter.
const mainArches = records => paintedPaths(records).filter(path => path.op === 'stroke' && path.lineWidth === 2.3 && path.globalAlpha === .88);
const folioPaper = records => paintedPaths(records).filter(path => path.op === 'fill' &&
  ['#183459', '#294974', '#dce6ed', '#1c3047', '#f6f7f6', '#0c1424', '#ffffff', '#101c2d'].includes(path.fillStyle) &&
  path.commands.filter(command => command.op === 'bezierCurveTo').length >= 3);
const pathBounds = path => {
  const points = pathSegments(path).flat();
  return { left: Math.min(...points.map(point => point[0])), right: Math.max(...points.map(point => point[0])),
    top: Math.min(...points.map(point => point[1])), bottom: Math.max(...points.map(point => point[1])) };
};
for (const [width, height, book] of [
  [1528, 732, { x: 305, y: 318, width: 922, height: 247, gutterX: 755, spread: true,
    left: { x: 305, y: 318, width: 437, height: 247 }, right: { x: 768, y: 318, width: 459, height: 247 } }],
  [390, 844, { x: 24, y: 350, width: 342, height: 280, gutterX: 198, spread: true,
    left: { x: 24, y: 350, width: 163, height: 280 }, right: { x: 209, y: 350, width: 157, height: 280 } }],
]) {
  const unit = Math.min(width, height) / 1000;
  const sourceLayout = { identity: { x: width * .28, y: height * .43, width: width * .41, height: height * .27 },
    heading: { x: width * .20, y: height * .17, width: width * .60, height: height * .18 } };
  const state = { ...base, phase: 3, progress: .75, visualProgress: .75, textAge: 3, impulse: 0,
    bookOpen: 0, layout: { book, inventory: book }, bookSource: { phase: 2, progress: 1, viewport: { width, height }, layout: sourceLayout } };
  const frame = (bookAge, changes = {}) => render(width, height, { ...state, bookAge, ...changes });
  for (const progress of [.4, .55, 1]) {
    const old = render(width, height, { ...base, phase: 2, visualProgress: progress, impulse: 0, layout: sourceLayout });
    const next = frame(0, { bookSource: { ...state.bookSource, progress } });
    const oldSegments = mainArches(old.records).flatMap(pathSegments), nextSegments = mainArches(next.records).flatMap(pathSegments);
    assert.ok(oldSegments.length && nextSegments.length, 'both chapters must draw the actual highlighted pointed arch');
    for (const [points, segments] of [[oldSegments.flat(), nextSegments], [nextSegments.flat(), oldSegments]]) {
      const distance = Math.max(...points.map(point => distanceToSegments(point, segments)));
      assert.ok(distance < .8,
        `source arch must be geometrically continuous at ${width}px, source progress ${progress}; discontinuity ${distance.toFixed(3)}px`);
    }
  }
  // The physical outlines move continuously, retaining their opaque ink rather
  // than disappearing and being replaced by the destination page at a cut.
  for (const age of [.1, .3, .48, .56, .68, .72, 1.08, 1.35, 1.65, 1.72]) {
    const before = mainArches(frame(age).records).flatMap(pathSegments).flat();
    const after = mainArches(frame(age + .00001).records).flatMap(pathSegments).flat();
    assert.equal(before.length, after.length, 'the same arch topology must survive each choreography boundary');
    assert.ok(before.every((point, i) => Math.hypot(point[0] - after[i][0], point[1] - after[i][1]) < .1),
      'an infinitesimal clock advance must not jump the source geometry');
  }
  const movingPoints = age => mainArches(frame(age).records).flatMap(pathSegments).flat();
  const distanceFromBinding = points => Math.max(...points.map(point => Math.abs(point[0] - book.gutterX)));
  assert.ok(distanceFromBinding(movingPoints(.56)) < distanceFromBinding(movingPoints(0)) * .3,
    'the original arches must collect around the measured binding before becoming the page rims');

  const covers = folioPaper(frame(.6).records);
  assert.ok(covers.length > 0 && covers.every(path => path.fillStyle === '#183459'), 'covers lead the construction before any paper leaf opens');
  const midPaper = folioPaper(frame(.90).records);
  assert.ok(midPaper.some(path => path.fillStyle === '#dce6ed') && midPaper.some(path => path.fillStyle === '#f6f7f6'),
    'the two underleaves must already be following the cover on distinct delayed trajectories');
  assert.ok(!midPaper.some(path => path.fillStyle === '#ffffff'), 'the main white leaf must enter after the underleaves');
  const latePaper = folioPaper(frame(1.2).records);
  assert.ok(latePaper.some(path => path.fillStyle === '#ffffff'), 'the final writing leaf must eventually open');
  const leftSheets = latePaper.filter(path => pathBounds(path).right <= book.gutterX + .001);
  const byColor = ink => pathBounds(leftSheets.find(path => path.fillStyle === ink));
  assert.ok(byColor('#183459').left < byColor('#dce6ed').left && byColor('#dce6ed').left < byColor('#f6f7f6').left &&
    byColor('#f6f7f6').left < byColor('#ffffff').left,
    'cover, underleaves and writing leaf must have visibly distinct extents during the staggered opening');

  const complete = frame(2.5, { bookOpen: 1 }), registered = frame(2.5, { phase: 4, bookOpen: 1 });
  const fullPaper = folioPaper(complete.records);
  const writingLeaves = fullPaper.filter(path => path.fillStyle === '#ffffff');
  assert.equal(writingLeaves.length, 2, 'the completed spread must retain two writing surfaces');
  for (const leaf of writingLeaves) {
    const bounds = pathBounds(leaf), left = bounds.right <= book.gutterX;
    const expected = left ? book.left.x : book.right.x + book.right.width;
    assert.ok(Math.abs((left ? bounds.left : bounds.right) - expected) < 1e-7,
      'the final paper edge must meet the actual measured page edge');
    assert.ok(leaf.commands.some(command => command.op === 'lineTo') && leaf.commands.filter(command => command.op === 'bezierCurveTo').length >= 3,
      'paper needs bowed edges, a cut corner and a binding contour, not a rectangle mask');
    assert.ok(bounds.top < book.y && bounds.bottom > book.y + book.height,
      'the contour must surround the real typesetting rectangle');
    const [a, b, c, d] = leaf.matrix;
    assert.ok(a === unit && d === unit && b === 0 && c === 0, 'the spread remains flat without perspective or skew');
  }
  assert.deepEqual(folioPaper(registered.records), fullPaper, 'registration must preserve the already opened physical folio');
  assert.deepEqual(mainArches(registered.records), mainArches(complete.records), 'the recomposed arch ink must not restart at registration');
  const binding = paintedPaths(complete.records).filter(path => path.op === 'stroke' && path.lineWidth === 1.2);
  assert.ok(binding.some(path => pathSegments(path).some(([a, b]) => Math.abs(a[0] - book.gutterX) < 1e-7 && Math.abs(b[0] - book.gutterX) < 1e-7)),
    'the source axis must finish as the actual off-center book spine');

  // Resizing must reproject the saved source measurements, while standalone
  // chapter seeks can use the identity fallback without stale screen geometry.
  const shrunk = { width: width * .7, height: height * .7 };
  const oldOnNewViewport = render(shrunk.width, shrunk.height, { ...base, phase: 2, visualProgress: 1, impulse: 0,
    layout: Object.fromEntries(Object.entries(sourceLayout).map(([name, box]) => [name, Object.fromEntries(Object.entries(box).map(([key, value]) => [key, value * .7]))])) });
  const changedViewport = render(shrunk.width, shrunk.height, { ...state, bookAge: 0 });
  const projected = mainArches(changedViewport.records).flatMap(pathSegments);
  assert.ok(mainArches(oldOnNewViewport.records).flatMap(pathSegments).flat().every(point => distanceToSegments(point, projected) < .8),
    'saved source geometry must follow the original viewport when the current viewport changes');
  const fallback = frame(0, { bookSource: null });
  assert.ok(mainArches(fallback.records).length, 'direct chapter entry must still construct a portal without a captured source');
}
// Manuscript illumination uses actual writing bounds. Record the active canvas
// clips on each paint so a pretty but ineffective exclusion cannot pass merely
// by drawing an unused rectangle somewhere else in the frame.
function clipHole(paint, box, padding = 6) {
  return paint.clips.find(clip => clip.rule === 'evenodd' && clip.commands.filter(command => command.op === 'rect').length === 2 &&
    clip.commands.some(command => {
      if (command.op !== 'rect') return false;
      const [x, y, w, h] = command.args, top = screenPoint(command, x, y), bottom = screenPoint(command, x + w, y + h);
      return Math.abs(top[0] - box.x + padding) < 1e-7 && Math.abs(top[1] - box.y + padding) < 1e-7 &&
        Math.abs(bottom[0] - box.x - box.width - padding) < 1e-7 && Math.abs(bottom[1] - box.y - box.height - padding) < 1e-7;
    }));
}
const illuminatedPage = (x, y, width, height, compact) => {
  const inset = compact ? 12 : 35, top = compact ? 25 : 44;
  const heading = { x: x + inset, y: y + top, width: width - inset * 2, height: 44 };
  const list = { x: x + inset, y: heading.y + heading.height + 12, width: width - inset * 2, height: height - top - 86 };
  return { x, y, width, height, heading, list, occupiedBottom: list.y + 34, footerY: list.y + list.height };
};
for (const [width, height, left, right] of [
  [1528, 900, illuminatedPage(280, 330, 476, 390, false), illuminatedPage(772, 330, 476, 390, false)],
  [390, 844, illuminatedPage(24, 330, 171, 360, true), illuminatedPage(195, 330, 171, 360, true)],
]) {
  const unit = Math.min(width, height) / 1000;
  const book = { x: left.x, y: left.y, width: right.x + right.width - left.x, height: left.height,
    gutterX: (left.x + left.width + right.x) / 2, spread: true, left, right };
  const state = { ...base, phase: 3, visualProgress: 1, progress: 1, bookAge: 3, bookOpen: 1, textAge: 3, impulse: 0,
    layout: { book, inventory: book } };
  const frame = changes => {
    const sample = render(width, height, { ...state, ...changes });
    maxCommands = Math.max(maxCommands, sample.records.length);
    assert.ok(sample.records.length < 12000, 'manuscript illumination must remain within the canvas command budget');
    return sample;
  };
  const ornaments = sample => sample.paintings.filter(paint => [left, right].some(page => clipHole(paint, page.heading)));
  const sealRings = sample => sample.paintings.filter(paint => {
    if (paint.op !== 'stroke' || paint.globalAlpha !== .67 || Math.abs(paint.lineWidth * unit - 1.05) >= 1e-7 ||
      paint.commands.length !== 1 || paint.commands[0].op !== 'arc') return false;
    const [x, y] = screenPoint(paint.commands[0]);
    return x > book.x && x < book.x + book.width && y > book.y && y < book.y + book.height;
  });
  const completed = frame(), illumination = ornaments(completed);
  assert.ok(illumination.length > 20, 'the completed pages must gain real ornamental paths inside the measured writing exclusions');
  for (const paint of illumination) {
    const page = clipHole(paint, left.heading) ? left : right;
    const occupied = { ...page.list, height: page.occupiedBottom - page.list.y };
    const headingClip = clipHole(paint, page.heading), writingClip = clipHole(paint, occupied);
    assert.ok(writingClip && writingClip !== headingClip, 'each ornamental stroke needs independent heading and real text exclusions');
    assert.ok(paint.clips.some(clip => clip.rule === 'nonzero' && clip.commands.filter(command => command.op === 'bezierCurveTo').length >= 3),
      'illumination must remain inside the real bowed paper contour while the page unfolds');
    assert.equal(paint.matrix[1], 0); assert.equal(paint.matrix[2], 0);
  }
  const rings = sealRings(completed);
  assert.equal(rings.length, 8, 'both sparse pages must gain a composed four-part seal');
  for (const ring of rings) {
    const arc = ring.commands[0], center = screenPoint(arc), radius = arc.args[2] * unit;
    const page = center[0] < book.gutterX ? left : right;
    assert.ok(center[1] - radius > page.occupiedBottom + 6, 'seal crown must stay below the last real row');
    assert.ok(center[1] + radius * 1.21 < page.footerY, 'seal and colophon must leave the actual footer clear');
    assert.ok(center[0] - radius > page.list.x && center[0] + radius < page.list.x + page.list.width,
      'seals must adapt to narrow page widths instead of being cropped into the spine');
  }
  const early = frame({ bookAge: 1.12 }), ruled = frame({ bookAge: 1.4 }), inscribed = frame({ bookAge: 1.8 });
  assert.equal(ornaments(early).length, 0, 'illumination must wait for the physical leaves');
  assert.ok(ornaments(ruled).length > 0, 'border tracery enters while the leaves are opening');
  assert.equal(sealRings(ruled).length, 0, 'page seals follow the earlier border layer');
  if (left.width >= 210) {
    const headerCopy = sample => ornaments(sample).filter(paint => paint.op === 'fillText').map(paint => paint.args[0]).join('');
    assert.equal(headerCopy(ruled), '', 'running heads must follow the earlier border layer');
    assert.match(headerCopy(frame({ bookAge: 1.6 })), /CONCORD \/ ICONCORD \/ II/, 'running heads must start engraving before the seals');
  }
  assert.equal(sealRings(inscribed).length, 8, 'seal construction begins after the border and running head');
  const earlySweep = sealRings(inscribed)[0].commands[0].args;
  const fullSweep = rings[0].commands[0].args;
  assert.ok(earlySweep[4] - earlySweep[3] < fullSweep[4] - fullSweep[3], 'seals must be drawn progressively, not merely faded in as complete rings');
  assert.deepEqual(ornaments(frame({ phase: 4 })), illumination, 'result registration must carry the same page illumination without rebuilding it');
  assert.equal(frame({ reducedMotion: true, bookAge: 0, ambientTime: 0 }).hash,
    frame({ reducedMotion: true, bookAge: 100, ambientTime: 100 }).hash, 'reduced motion must use the final readable illumination pose');

  for (const occupancy of ['overflow', 'unknown', 'wrapped']) {
    const adjusted = Object.fromEntries(['left', 'right'].map(side => {
      const page = book[side];
      return [side, { ...page, occupiedBottom: occupancy === 'unknown' ? NaN : page.list.y + page.list.height - (occupancy === 'wrapped' ? 12 : 0) }];
    }));
    assert.equal(sealRings(frame({ layout: { book: { ...book, ...adjusted }, inventory: book } })).length, 0,
      `${occupancy} text bounds must remove the seal rather than spend real list space on decoration`);
  }
  const missing = { ...book, left: { ...left, heading: null }, right: { ...right, list: null } };
  assert.equal(sealRings(frame({ layout: { book: missing, inventory: book } })).length, 0,
    'unmeasured writing must never receive a guessed decorative seal');
  // Heading and list can overlap under aggressive text zoom. Their holes must
  // intersect as exclusions instead of cancelling through even-odd winding.
  const enlarged = { ...left, heading: { ...left.heading, height: left.heading.height + 45 } };
  const overlap = frame({ layout: { book: { ...book, left: enlarged }, inventory: book } });
  const overlapInk = overlap.paintings.filter(paint => clipHole(paint, enlarged.heading));
  assert.ok(overlapInk.length > 0);
  assert.ok(overlapInk.every(paint => clipHole(paint, { ...left.list, height: left.occupiedBottom - left.list.y })),
    'overlapping title/body exclusions must both remain active on the same ornamental strokes');
}
console.log(`PASS: ${samples} Laterano frames, measured writing exclusions, layered manuscript illumination, single upright iris, portal-to-spine continuity, staggered curved folio, truthful inventory and reduced motion. Peak: ${maxCommands}/12000.`);

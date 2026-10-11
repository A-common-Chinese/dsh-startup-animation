// Exercise the actual Laterano renderer with measured host layouts. These
// checks cover geometry and truthful data; browser review covers appearance.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const sandbox = { window: {} };
vm.createContext(sandbox);
for (const name of ['startup-laterano-emblem.js', 'startup-text.js', 'startup-laterano-ornaments.js', 'startup-laterano.js']) {
  const source = process.argv.includes('--benchmark') && process.env.DSH_BENCH_REV
    ? require('node:child_process').execFileSync('git', ['show', `${process.env.DSH_BENCH_REV}:docs/${name}`], { encoding: 'utf8', cwd: path.join(__dirname, '..') })
    : fs.readFileSync(path.join(__dirname, '../docs', name), 'utf8');
  vm.runInContext(source, sandbox, { filename: name });
}
const { draw, phaseCount } = sandbox.window.DSHLateranoVisuals;
assert.equal(phaseCount, 6);
assert.ok(sandbox.window.DSHLateranoEmblem.parts.length >= 3, 'render the shipped emblem rather than a fixture');

// Optional diagnostic mode: run the real geometry against a non-rasterizing
// Canvas shim. Times are observations, not CI thresholds or browser FPS claims.
if (process.argv.includes('--benchmark')) {
  const canvasMethods = ['translate', 'scale', 'rotate', 'transform', 'setLineDash', 'beginPath', 'closePath', 'clip', 'fill', 'stroke', 'moveTo', 'lineTo', 'bezierCurveTo', 'arc', 'rect', 'fillRect', 'fillText'];
  const countedCanvas = () => {
    const calls = {}, stack = [], style = { globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
      lineCap: 'butt', lineJoin: 'miter', font: '12px sans-serif', textAlign: 'left', textBaseline: 'alphabetic' };
    const count = name => { calls[name] = (calls[name] || 0) + 1; };
    const ctx = {
      save() { count('save'); stack.push({ ...style }); },
      restore() { count('restore'); Object.assign(style, stack.pop()); },
      measureText(value) {
        count('measureText'); const size = Number(style.font.match(/([\d.]+)px/)?.[1] || 12);
        return { width: [...String(value)].reduce((sum, char) => sum + size * (char.charCodeAt(0) > 255 ? 1 : .58), 0) };
      },
    };
    for (const key of Object.keys(style)) Object.defineProperty(ctx, key, { get: () => style[key], set: value => { style[key] = value; } });
    for (const name of canvasMethods) ctx[name] = () => count(name);
    return { ctx, calls, clear() { for (const key of Object.keys(calls)) calls[key] = 0; } };
  };
  const page = x => ({ x, y: 330, width: 426, height: 300,
    heading: { x: x + 30, y: 354, width: 366, height: 40 },
    list: { x: x + 30, y: 406, width: 366, height: 192 }, occupiedBottom: 448, footerY: 598 });
  const left = page(198), right = page(644);
  const book = { x: 198, y: 330, width: 872, height: 300, gutterX: 634, spread: true, left, right };
  const source = { heading: { x: 295, y: 122, width: 690, height: 128 }, identity: { x: 420, y: 320, width: 440, height: 245 } };
  const base = { phase: 3, visualProgress: 1, progress: 1, bookOpen: 1, bookAge: 3, textAge: 4, light: true, identity: 'BENCHMARK OPERATOR',
    pointer: [.5, .5], drag: 0, impulse: 0, inventory: { status: 'complete', skills: [{ name: 'actual-skill' }], plugins: [{ name: 'actual-plugin' }], issues: [] },
    layout: { heading: { x: 295, y: 150, width: 690, height: 128 }, inventory: book, book },
    bookSource: { phase: 2, progress: 1, viewport: { width: 1280, height: 720 }, layout: source } };
  const cases = [
    ['identity', { phase: 2, layout: source }], ['book-source', { bookAge: 0, bookOpen: 0 }],
    ['book-gather', { bookAge: .65, bookOpen: 0 }], ['book-leaves', { bookAge: 1.25, bookOpen: 0 }],
    ['book-opening', { bookAge: 1.7, bookOpen: .55 }], ['book-settled', { bookAge: 3 }], ['registration', { phase: 4 }],
  ];
  const observations = [];
  for (const [name, state] of cases) {
    const counter = countedCanvas(), fixture = { ...base, ...state };
    for (let index = 0; index < 40; index++) draw(counter.ctx, 1280, 720, fixture);
    counter.clear(); draw(counter.ctx, 1280, 720, fixture);
    const calls = { ...counter.calls }, timings = [];
    for (let index = 0; index < 180; index++) {
      const start = performance.now(); draw(counter.ctx, 1280, 720, fixture); timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    observations.push({ name, median_ms: +timings[90].toFixed(3), p95_ms: +timings[171].toFixed(3),
      canvas_calls: Object.values(calls).reduce((sum, count) => sum + count, 0), strokes: calls.stroke || 0, fills: calls.fill || 0,
      line_segments: calls.lineTo || 0, text_measurements: calls.measureText || 0, clips: calls.clip || 0 });
  }
  console.log(JSON.stringify({ source: process.env.DSH_BENCH_REV || 'working tree', note: 'Node geometry only; excludes rasterization, DOM, layout and compositor.', observations }, null, 2));
  process.exit(0);
}

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

// Connection labels must sit outside the actual moving interlace silhouette.
// Match its shared local origin, rather than assuming a fixed circle radius.
for (const [width, height] of [[1280, 720], [390, 844], [900, 420]]) for (const ambientTime of [0, 7.3]) {
  const sample = render(width, height, { ...base, phase: 1, progress: 1, textAge: 4, ambientTime, pointer: [.5, .5], drag: 0, impulse: 0 });
  const nodes = sample.paintings.filter(paint => paint.op === 'fill' && paint.commands.length === 1 &&
    paint.commands[0].op === 'arc' && paint.commands[0].args[2] === 6).map(paint => screenPoint(paint.commands[0])).sort((a, b) => a[0] - b[0]);
  for (const [index, letter] of ['a', 'b'].entries()) {
    const label = sample.paintings.find(paint => paint.op === 'fillText' && paint.args[0] === letter && paint.font.startsWith('400 24px'));
    assert.ok(label && nodes[index], 'both local connection labels and their actual node geometry must be present');
    const points = sample.paintings.filter(paint => paint.op !== 'fillText' &&
      Math.abs(paint.matrix[4] - nodes[index][0]) < 1e-6 && Math.abs(paint.matrix[5] - nodes[index][1]) < 1e-6).flatMap(pathSegments).flat();
    assert.ok(points.length, 'the label clearance fixture must include the real interlace around its node');
    const [x] = screenPoint(label, label.args[1], label.args[2]), glyphWidth = 24 * .58 * Math.min(width, height) / 1000;
    assert.ok(index ? x > Math.max(...points.map(point => point[0])) + 3 : x + glyphWidth < Math.min(...points.map(point => point[0])) - 3,
      'connection letters must remain outside rotating opaque star plates in wide, narrow and short viewports');
  }
}
if (process.argv.includes('--connection-labels')) {
  console.log('PASS: moving connection geometry keeps both outer labels clear at 3 viewport proportions and 2 ambient poses.');
  process.exit(0);
}

// Exercise the celestial layer through its actual public API and canvas state.
// Its measured text holes are independent, so overlapping title/card rectangles
// cannot cancel one another through even-odd parity.
const ornamentsDraw = sandbox.window.DSHLateranoOrnaments?.draw;
assert.equal(typeof ornamentsDraw, 'function', 'the shipped celestial module must be loaded by renderer tests');
const skyPalette = { paper: '#e9eef4', ink: '#101820', blue: '#195acc', line: '#a5bfd4', faint: '#dce6ed', soft: '#60768d', white: '#ffffff' };
function renderSky(width, height, state = {}) {
  const recorder = recordingContext(), unit = Math.min(width, height) / 1000;
  const designBox = box => box ? { left: (box.x - width / 2) / unit, top: (box.y - height / 2) / unit,
    right: (box.x + box.width - width / 2) / unit, bottom: (box.y + box.height - height / 2) / unit } : null;
  recorder.ctx.save(); recorder.ctx.translate(width / 2, height / 2); recorder.ctx.scale(unit, unit);
  const folio = state.folio && { center: (state.folio.center - width / 2) / unit,
    top: (state.folio.top - height / 2) / unit, bottom: (state.folio.bottom - height / 2) / unit,
    leaves: state.folio.leaves.map(leaf => ({ ...designBox(leaf), writing: leaf.writing && {
      heading: designBox(leaf.writing.heading), list: designBox(leaf.writing.list), occupied: designBox(leaf.writing.occupied),
      end: (leaf.writing.end - height / 2) / unit, footer: (leaf.writing.footer - height / 2) / unit,
    } })) };
  const input = { width: width / unit, height: height / unit, unit, phase: 2, progress: 1,
    ambient: 0, reduced: false, bookAge: 3, palette: skyPalette, accent: '#159dcc', ...state,
    heading: designBox(state.heading), sourceHeading: designBox(state.sourceHeading), identity: designBox(state.identity),
    sourceIdentity: designBox(state.sourceIdentity), inventory: designBox(state.inventory), folio };
  for (const layer of state.layer ? [state.layer] : ['background', 'foreground']) ornamentsDraw(recorder.ctx, { ...input, layer });
  recorder.ctx.restore();
  return { hash: recorder.finish(), records: recorder.records, paintings: recorder.paintings };
}
function textExclusion(paint, box) {
  return paint.clips.find(clip => {
    const rectangles = clip.commands.filter(command => command.op === 'rect');
    if (clip.rule !== 'evenodd' || rectangles.length !== 2) return false;
    const holes = rectangles.map(rectangle => {
      const [x, y, w, h] = rectangle.args;
      const top = screenPoint(rectangle, x, y), bottom = screenPoint(rectangle, x + w, y + h);
      return { x: top[0], y: top[1], right: bottom[0], bottom: bottom[1], area: Math.abs(w * h) };
    }).sort((a, b) => a.area - b.area);
    return holes[0].x <= box.x && holes[0].y <= box.y && holes[0].right >= box.x + box.width && holes[0].bottom >= box.y + box.height;
  });
}
for (const [width, height] of [[1280, 720], [390, 844], [2560, 360], [360, 1600]]) {
  const heading = { x: width * .28, y: height * .20, width: width * .44, height: height * .20 };
  const identity = { x: width * .29, y: height * .36, width: width * .42, height: height * .43 };
  const inventoryBox = { x: width * .09, y: height * .37, width: width * .82, height: height * .49 };
  const leaves = [0, 1].map(index => {
    const x = inventoryBox.x + index * inventoryBox.width * .51, y = inventoryBox.y, w = inventoryBox.width * .49, h = inventoryBox.height;
    return { x, y, width: w, height: h, writing: {
      heading: { x: x + w * .08, y: y + h * .08, width: w * .84, height: h * .16 },
      list: { x: x + w * .08, y: y + h * .20, width: w * .84, height: h * .67 },
      occupied: { x: x + w * .08, y: y + h * .20, width: w * .84, height: h * .43 }, end: y + h * .63, footer: y + h * .87,
    } };
  });
  const folio = { center: width / 2, top: inventoryBox.y, bottom: inventoryBox.y + inventoryBox.height, leaves };
  for (const phase of [2, 3, 4]) {
    const state = { phase, heading, identity, inventory: inventoryBox, folio };
    const full = renderSky(width, height, state), readings = phase === 2 ? [identity] : leaves.flatMap(leaf => [leaf.writing.heading, leaf.writing.occupied]);
    assert.ok(full.paintings.length > 0, 'the two celestial passes must actually paint vector ornaments');
    assert.equal(renderSky(width, height, { ...state, layer: phase === 2 ? 'foreground' : 'background' }).paintings.length, 0,
      'each sun, moon and star must have one owning layer without a duplicate or opacity handoff');
    for (const paint of full.paintings) {
      const exclusions = [heading, ...readings].map(box => textExclusion(paint, box));
      assert.ok(exclusions.every(Boolean) && new Set(exclusions).size === exclusions.length,
        'every celestial mark must independently protect the real title, page headings and occupied text even when their rectangles overlap');
    }
    assert.equal(full.hash, renderSky(width, height, { ...state, bookAge: 80 }).hash, 'completed celestial construction must not rebuild while its independent motion clock is fixed');
    const drifting = renderSky(width, height, { ...state, ambient: 7.3 });
    assert.notEqual(full.hash, drifting.hash, 'selected celestial parts must keep moving after their entrance has finished');
    for (const paint of drifting.paintings) for (const box of [heading, ...readings]) {
      assert.ok(textExclusion(paint, box), 'self-moving ornamentation must retain the same real-text exclusions');
    }
    assert.equal(renderSky(width, height, { ...state, reduced: true, progress: 0, sourceProgress: 0, bookAge: 0 }).hash,
      renderSky(width, height, { ...state, reduced: true, progress: 1, sourceProgress: 1, bookAge: 80, ambient: 80 }).hash,
      'reduced motion must show one stable, complete celestial arrangement');
  }
  const settled = renderSky(width, height, { heading, identity });
  const crescents = settled.paintings.filter(paint => paint.op === 'fill' && paint.commands.filter(command => command.op === 'bezierCurveTo').length >= 2);
  assert.ok(crescents.length > 0, 'the moon must be actual curved vector cutwork');
  assert.ok(crescents.every(paint => paint.fillStyle !== skyPalette.paper), 'a crescent must not erase the architecture with a paper-coloured patch');
  assert.ok(settled.paintings.some(paint => paint.op === 'fill' && paint.commands.filter(command => command.op === 'lineTo').length >= 7), 'the sky must contain drawn star silhouettes, not a font symbol');
  assert.ok(settled.paintings.some(paint => paint.op === 'stroke' && paint.commands.some(command => command.op === 'arc')), 'the solar geometry must contain actual ring paths');
  assert.ok(!settled.paintings.some(paint => paint.op === 'fillText'), 'celestial emblems must remain original vectors');
  assert.notEqual(renderSky(width, height, { progress: .14 }).hash, renderSky(width, height, { progress: .63 }).hash,
    'the celestial elements must construct across multiple moments');
  const skyInk = sample => sample.paintings.map(({ clips, ...paint }) => paint);
  for (const progress of [.4, .63, 1]) assert.deepEqual(
    skyInk(renderSky(width, height, { phase: 3, bookAge: 0, sourceProgress: progress, heading, sourceIdentity: identity, inventory: inventoryBox, folio })),
    skyInk(renderSky(width, height, { phase: 2, progress, heading, identity })),
    'the book must inherit the actual partially assembled sky rather than replace it at the identity boundary');
  assert.deepEqual(skyInk(renderSky(width, height, { phase: 3, bookAge: .8, sourceProgress: .63 })),
    skyInk(renderSky(width, height, { phase: 4, bookAge: .8, sourceProgress: .63 })),
    'discovery and registration must carry one uninterrupted celestial assembly clock');
}
// An unusually wide identity heading can move the entire sun/moon into the
// margins. A differently placed book title must not reset them at the boundary.
const broadIdentityHeading = { x: 180, y: 70, width: 920, height: 200 };
const celestialInk = sample => sample.paintings.map(({ clips, ...paint }) => paint);
for (const progress of [.4, .63, 1]) {
  const sourceSky = renderSky(1280, 720, { phase: 2, progress, heading: broadIdentityHeading });
  assert.notDeepEqual(celestialInk(sourceSky), celestialInk(renderSky(1280, 720, { phase: 2, progress })),
    'the wide-heading fixture must actually displace celestial medallions before the handoff');
  for (const bookHeading of [broadIdentityHeading, { x: 265, y: 176, width: 752, height: 128 }]) {
    const incomingSky = renderSky(1280, 720, { phase: 3, bookAge: 0, sourceProgress: progress,
      heading: bookHeading, sourceHeading: broadIdentityHeading });
    assert.deepEqual(celestialInk(incomingSky), celestialInk(sourceSky),
      'title-avoiding medallions must inherit the displaced source pose before moving around the new book heading');
  }
}

// Follow the same opaque sun and crescent through their actual vector paths.
// They travel to the spine and reopen as page clasps; a decorative fade-in at
// the destination would fail these positional and ownership checks.
const skyPage = x => ({ x, y: 330, width: 418, height: 292, writing: {
  heading: { x: x + 28, y: 346, width: 362, height: 42 },
  list: { x: x + 28, y: 402, width: 362, height: 193 },
  occupied: { x: x + 28, y: 402, width: 362, height: 58 }, end: 460, footer: 595,
} });
const celestialFolio = { center: 636, top: 330, bottom: 622, leaves: [skyPage(200), skyPage(656)] };
const skySourceIdentity = { x: 420, y: 315, width: 440, height: 260 };
const celestialState = { phase: 3, sourceProgress: 1, sourceHeading: broadIdentityHeading, sourceIdentity: skySourceIdentity,
  heading: { x: 265, y: 165, width: 752, height: 126 }, sourceViewport: { width: 1280, height: 720 }, folio: celestialFolio };
function skyBodies(sample) {
  const sun = sample.paintings.find(paint => paint.op === 'fill' && paint.commands.length === 1 &&
    paint.commands[0].op === 'arc' && Math.abs(paint.commands[0].args[4] - paint.commands[0].args[3] - Math.PI * 2) < 1e-8);
  const moon = sample.paintings.find(paint => paint.op === 'fill' && paint.commands.filter(command => command.op === 'bezierCurveTo').length === 2);
  assert.ok(sun && moon, 'both the solar disc and actual crescent must survive every part of the handoff');
  assert.ok([sun, moon].every(paint => paint.globalAlpha === 1 && ['#ffffff', '#fff'].includes(paint.fillStyle)),
    'the moving emblems must stay opaque white rather than crossfade or become paper-coloured erasers');
  return [{ paint: sun, point: screenPoint(sun.commands[0]) }, { paint: moon, point: screenPoint(moon, 0, 0) }];
}
const skyFrame = (bookAge, extra = {}) => renderSky(1280, 720, { ...celestialState, bookAge, ...extra });
const startBodies = skyBodies(skyFrame(0));
const radiusEnvelope = body => Math.max(...pathSegments(body.paint).flat().map(point => Math.hypot(point[0] - body.point[0], point[1] - body.point[1])));
for (const [width, height] of [[1280, 720], [390, 844]]) {
  const entering = skyBodies(renderSky(width, height, { phase: 2, progress: .25 }));
  const arrived = skyBodies(renderSky(width, height, { phase: 2, progress: 1 }));
  const vectors = entering.map((body, index) => arrived[index].point.map((value, axis) => value - body.point[axis]));
  assert.ok(vectors[0][1] > 8 && vectors[1][1] < -8,
    'sun and moon must enter from opposing vertical directions instead of sharing one horizontal slide');
  assert.ok(vectors.every(([dx, dy]) => Math.abs(dy) > Math.abs(dx)),
    'the celestial entrance must read as a descent and ascent while retaining its smaller curved lateral motion');
}
for (const phase of [2, 3, 4]) {
  const state = phase === 2 ? { phase, progress: 1, heading: broadIdentityHeading, identity: skySourceIdentity } : { ...celestialState, phase, bookAge: 3 };
  const first = renderSky(1280, 720, { ...state, ambient: 0 }), bodies = skyBodies(first);
  for (const ambient of [.7, 3.1, 8.8, 27]) {
    const next = renderSky(1280, 720, { ...state, ambient }), moved = skyBodies(next);
    moved.forEach((body, index) => {
      assert.deepEqual(body.point, bodies[index].point, 'self-motion must preserve the measured sun and moon anchor centers');
      assert.ok(Math.abs(radiusEnvelope(body) - radiusEnvelope(bodies[index])) < 1e-6,
        'rotation must stay inside its fixed silhouette envelope instead of breathing into nearby text');
    });
    assert.notDeepEqual(pathSegments(moved[1].paint), pathSegments(bodies[1].paint), 'the actual crescent must visibly turn around its own fixed center');
    const solarFaces = sample => sample.paintings.filter(paint => paint.op === 'fill' && paint.commands.filter(command => command.op === 'lineTo').length === 3 &&
      pathSegments(paint).flat().every(point => Math.hypot(point[0] - bodies[0].point[0], point[1] - bodies[0].point[1]) < radiusEnvelope(bodies[0]) * 3));
    assert.ok(solarFaces(first).length > 2, 'the solar self-motion fixture must include real radial white blades');
    assert.notDeepEqual(solarFaces(first).flatMap(pathSegments), solarFaces(next).flatMap(pathSegments),
      'solar blades must have their own motion rather than merely inherit the moon transform');
  }
}
// The next display frame may advance ambient time before changing chapters.
// A book must begin with the captured displayed pose, then smoothly catch up.
for (const progress of [.4, .63, 1]) {
  const captured = 4.37, current = captured + .08;
  const source = renderSky(1280, 720, { phase: 2, progress, ambient: captured, heading: broadIdentityHeading, identity: skySourceIdentity });
  const incomingState = { ...celestialState, sourceProgress: progress, sourceAmbient: captured, ambient: current };
  assert.deepEqual(celestialInk(renderSky(1280, 720, { ...incomingState, bookAge: 0 })), celestialInk(source),
    'age zero must inherit the last displayed celestial angle even when the ambient clock has already advanced');
  for (const age of [0, .09, .1999, .2, .24]) {
    const before = renderSky(1280, 720, { ...incomingState, bookAge: age }).paintings.flatMap(pathSegments).flat();
    const after = renderSky(1280, 720, { ...incomingState, bookAge: age + .000001 }).paintings.flatMap(pathSegments).flat();
    assert.equal(before.length, after.length, 'source ambient catch-up must not replace celestial shapes');
    assert.ok(before.every((point, index) => Math.hypot(point[0] - after[index][0], point[1] - after[index][1]) < .1),
      'captured ambient motion must blend into the shared clock without a turn or position discontinuity');
  }
}
const unmeasuredFolio = { ...celestialFolio, leaves: [{ ...celestialFolio.leaves[0], writing: undefined }, celestialFolio.leaves[1]] };
for (const paint of skyFrame(3, { folio: unmeasuredFolio }).paintings) {
  assert.ok(textExclusion(paint, unmeasuredFolio.leaves[0]), 'a not-yet-measured page must be protected in full instead of guessing where its real text ends');
  assert.ok(textExclusion(paint, unmeasuredFolio.leaves[1].writing.occupied), 'the other measured page must keep its independent actual-text guard');
}
for (const age of [0, .2, .6, .82, 1.15, 1.6, 2.15, 2.7]) {
  const bodies = skyBodies(skyFrame(age)), next = skyBodies(skyFrame(age + .00001));
  bodies.forEach((body, index) => assert.ok(Math.hypot(...body.point.map((value, axis) => value - next[index].point[axis])) < .1,
    'sun and moon must move continuously through gathering, turning and opening'));
}
for (let index = 0; index < 2; index++) {
  const sourceDistance = Math.abs(startBodies[index].point[0] - celestialFolio.center);
  const closest = Math.min(...[.65, .8, .95].map(age => Math.abs(skyBodies(skyFrame(age))[index].point[0] - celestialFolio.center)));
  assert.ok(closest < sourceDistance * .35, 'each sky emblem must visibly travel into the binding before opening out');
  const final = skyBodies(skyFrame(3))[index].point, leaf = celestialFolio.leaves[index];
  assert.ok(Math.abs(final[0] - (index ? leaf.x + leaf.width : leaf.x)) < 32 && final[1] > leaf.y && final[1] < leaf.y + leaf.height,
    'the original sun and moon must become clasps registered to the measured outer page edges');
}
assert.deepEqual(celestialInk(skyFrame(3)), celestialInk(skyFrame(80)), 'completed celestial binding must keep its constructed pose at a fixed ambient clock');
assert.deepEqual(celestialInk(skyFrame(1.05)), celestialInk(skyFrame(1.05, { phase: 4 })),
  'real inventory completion must not restart the celestial clock');
const crowdedFolio = { ...celestialFolio, leaves: celestialFolio.leaves.map(leaf => ({ ...leaf, writing: {
  ...leaf.writing, occupied: leaf.writing.list, end: leaf.writing.footer,
} })) };
for (const status of ['loading', 'complete', 'failed', 'cancelled']) for (const age of [.4, 1.25, 3]) {
  assert.deepEqual(celestialInk(skyFrame(age, { inventoryStatus: status })),
    celestialInk(skyFrame(age, { inventoryStatus: status, folio: crowdedFolio })),
    'growing real rows must update their text exclusions without teleporting sky emblems or changing the animation');
  const crowded = skyFrame(age, { inventoryStatus: status, folio: crowdedFolio });
  for (const paint of crowded.paintings) for (const leaf of crowdedFolio.leaves) {
    assert.ok(textExclusion(paint, leaf.writing.heading) && textExclusion(paint, leaf.writing.occupied),
      'moving white ornaments must remain clipped away from full or wrapped real lists');
  }
}
// Resize halfway through the source pose: the saved sky must retain a single
// similarity transform, including wide-title avoidance and rotated crescents.
for (const [width, height] of [[390, 844], [1280, 420], [896, 504]]) {
  const scale = Math.min(width / 1280, height / 720);
  const fitPoint = point => [width / 2 + (point[0] - 640) * scale, height / 2 + (point[1] - 360) * scale];
  const fitBox = box => { const [x, y] = fitPoint([box.x, box.y]); return { x, y, width: box.width * scale, height: box.height * scale }; };
  for (const progress of [.4, .63, 1]) {
    const outgoing = renderSky(1280, 720, { phase: 2, progress, heading: broadIdentityHeading, identity: skySourceIdentity });
    const incoming = renderSky(width, height, { ...celestialState, bookAge: 0, sourceProgress: progress,
      sourceHeading: fitBox(broadIdentityHeading), sourceIdentity: fitBox(skySourceIdentity) });
    const expected = outgoing.paintings.flatMap(pathSegments).flat().map(fitPoint), actual = incoming.paintings.flatMap(pathSegments).flat();
    assert.equal(actual.length, expected.length, 'resizing must retain all saved celestial geometry');
    assert.ok(expected.every((point, index) => Math.hypot(point[0] - actual[index][0], point[1] - actual[index][1]) < 1e-6),
      'source sky must project uniformly at age zero, including the saved title-avoiding pose');
  }
}
let samples = 0, maxCommands = 0, maxPaintCalls = 0;
for (const [width, height] of [[1920, 1080], [1280, 720], [390, 844]]) {
  for (const light of [true, false]) {
    for (let phase = 0; phase < phaseCount; phase++) {
      for (const progress of [0, .001, .035, .16, .31, .42, .58, .82, .999, 1]) {
        const state = { ...base, phase, progress, light, time: phase * 2.4 + progress, ambientTime: 8 + progress };
        const first = render(width, height, state), second = render(width, height, state);
        assert.equal(first.hash, second.hash, 'frames must be deterministic');
        maxCommands = Math.max(maxCommands, first.records.length);
        maxPaintCalls = Math.max(maxPaintCalls, first.paintings.length);
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

// Completed construction never restarts from elapsed sequence time. Selected
// ornamental parts have their own ambient clock, independent of scan status.
for (let phase = 0; phase < phaseCount; phase++) {
  const state = { ...base, phase, progress: 1, impulse: 0, textAge: 3, ambientTime: 0, time: 0 };
  assert.equal(render(1280, 720, state).hash, render(1280, 720, { ...state, time: 100 }).hash,
    `phase ${phase} must retain its built pose when only the sequence time changes`);
}
const linkNodes = progress => render(1280, 720, { ...base, phase: 1, progress, ambientTime: 0,
  pointer: [.5, .5], drag: 0, impulse: 0 }).paintings.filter(paint => paint.op === 'fill' && paint.globalAlpha === 1 &&
    paint.commands.length === 1 && paint.commands[0].op === 'arc' && paint.commands[0].args[2] === 6)
  .map(paint => screenPoint(paint.commands[0])).sort((a, b) => a[0] - b[0]);
const arrivingNodes = linkNodes(.25), dockedNodes = linkNodes(1);
assert.equal(arrivingNodes.length, 2); assert.equal(dockedNodes.length, 2);
assert.ok(dockedNodes[0][0] < arrivingNodes[0][0] && dockedNodes[1][0] > arrivingNodes[1][0],
  'connection nodes must expand outward from the center');
assert.ok(dockedNodes[0][1] - arrivingNodes[0][1] > 10 && dockedNodes[1][1] - arrivingNodes[1][1] < -10,
  'the paired connection nodes must arrive along opposed upper and lower arcs');

// Live carriers are tied to the host's real scan status. A timeout, cancelled
// scan, or completed scan must not leave an ornamental loop claiming activity.
for (const status of ['idle', 'loading', 'complete', 'error', 'unavailable', 'cancelled']) {
  const state = { ...base, phase: 3, progress: 1, visualProgress: 1, bookAge: 4, bookOpen: 1,
    textAge: 4, impulse: 0, drag: 0, pointer: [.5, .5], inventory: { ...inventory, status } };
  const first = render(1280, 720, { ...state, ambientTime: .25 }), later = render(1280, 720, { ...state, ambientTime: 1.05 });
  const carriers = sample => sample.paintings.filter(paint => paint.op === 'stroke' && paint.lineWidth === 2.3 && paint.globalAlpha === .9 &&
    paint.commands.length === 2 && paint.commands[0].op === 'moveTo' && paint.commands[1].op === 'lineTo').map(paint => pathSegments(paint));
  if (status === 'loading') {
    assert.equal(carriers(first).length, 2, 'the actual pending scan must have a carrier on each real catalog route');
    assert.notDeepEqual(carriers(first), carriers(later), 'actual pending scan carriers must visibly move along their routes');
  } else assert.equal(carriers(first).length + carriers(later).length, 0, `${status} inventory must not animate a false scan`);
  assert.equal(render(1280, 720, { ...state, reducedMotion: true, ambientTime: .25, bookAge: 0 }).hash,
    render(1280, 720, { ...state, reducedMotion: true, ambientTime: 100, bookAge: 100 }).hash,
    `reduced motion must remain stable for actual ${status} inventory`);
}

let extremeSamples = 0;
for (const [width, height] of [[240, 320], [320, 240], [2560, 360], [360, 1600]]) {
  const page = x => {
    const y = height * .35, w = width * .4, h = height * .48;
    const heading = { x: x + 8, y: y + h * .08, width: w - 16, height: Math.min(28, h * .22) };
    const list = { x: x + 8, y: heading.y + heading.height + 4, width: w - 16, height: h * .82 - heading.height - 18 };
    return { x, y, width: w, height: h, heading, list, occupiedBottom: list.y + Math.min(24, list.height), footerY: list.y + list.height };
  };
  const left = page(width * .08), right = page(width * .52);
  const book = { x: left.x, y: left.y, width: right.x + right.width - left.x, height: left.height,
    gutterX: (left.x + left.width + right.x) / 2, spread: true, left, right };
  for (let phase = 0; phase < phaseCount; phase++) for (const progress of [0, .55, 1]) for (const light of [true, false]) {
    const sample = render(width, height, { ...base, phase, progress, visualProgress: progress, light, impulse: 0,
      textAge: 4, bookAge: progress * 4, bookOpen: progress, ambientTime: .7,
      inventory: { ...inventory, status: phase === 3 ? 'loading' : 'complete' },
      layout: { book, inventory: book, identity: book, heading: { x: width * .2, y: height * .16, width: width * .6, height: height * .14 } } });
    assert.ok(sample.records.length < 12000, `extreme ${width}x${height} phase ${phase} exceeded the drawing budget`);
    maxCommands = Math.max(maxCommands, sample.records.length);
    maxPaintCalls = Math.max(maxPaintCalls, sample.paintings.length);
    extremeSamples++;
  }
}

// The identity portal reads as a church: sustained vertical columns support a
// short pointed crown. Inspect the painted silhouette, not its curve formula.
const portal = render(1280, 720, { ...base, phase: 2, reducedMotion: true, impulse: 0 });
const churchInk = paintedPaths(portal.records).filter(paint => paint.op === 'stroke' && paint.lineWidth === 2.3 && paint.globalAlpha === .88);
const churchSegments = churchInk.flatMap(pathSegments), churchPoints = churchSegments.flat();
const churchAxis = (Math.min(...churchPoints.map(point => point[0])) + Math.max(...churchPoints.map(point => point[0]))) / 2;
const apex = churchPoints.reduce((top, point) => point[1] < top[1] ? point : top);
const verticals = churchSegments.filter(([a, b]) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) > 5);
const column = side => verticals.filter(([a]) => side * (a[0] - churchAxis) > 0)
  .sort(([a, b], [c, d]) => Math.abs(d[1] - c[1]) - Math.abs(b[1] - a[1]))[0];
for (const side of [-1, 1]) {
  const leg = column(side);
  assert.ok(leg, 'each side of the portal must have a real vertical column');
  const spring = Math.min(leg[0][1], leg[1][1]), columnHeight = Math.abs(leg[0][1] - leg[1][1]);
  assert.ok(spring > apex[1] && columnHeight > (spring - apex[1]) * 1.15,
    'long straight columns must dominate the short crown instead of forming a tall rounded tunnel');
}
assert.ok(Math.abs(apex[0] - churchAxis) < 1e-7, 'both church halves must join at the same centered apex');
const crownSides = churchSegments.filter(segment => segment.some(point => Math.hypot(point[0] - apex[0], point[1] - apex[1]) < 1e-7))
  .map(segment => segment.find(point => Math.hypot(point[0] - apex[0], point[1] - apex[1]) > 1e-7)).filter(Boolean);
assert.ok(crownSides.some(point => point[0] < apex[0]) && crownSides.some(point => point[0] > apex[0]), 'both crown halves must reach the actual apex without a seam');
assert.ok(crownSides.every(point => point[1] - apex[1] > Math.abs(point[0] - apex[0]) * .18), 'the crown needs a pointed join rather than a flat circular summit');

// Stage titles use glyph-local contrast, not a large rectangular hole in the
// architecture. Their measured bounds still anchor capitals and the handoff.
const heading = { x: 265, y: 153, width: 752, height: 128 };
const identityPlate = { x: 408, y: 333, width: 464, height: 200 };
for (const phase of [1, 2, 3, 4]) {
  const sample = render(1280, 720, { ...base, phase, progress: 1, impulse: 0, reducedMotion: true,
    layout: { heading, identity: identityPlate } });
  const structuralInk = sample.paintings.filter(paint => paint.op === 'stroke' && paint.lineWidth === 2.3 && paint.globalAlpha === .88 || paint.op === 'fillText' && parseFloat(paint.font.split(' ')[1]) > 500);
  assert.ok(structuralInk.every(paint => ![0, 8 * .72, 14 * .72].some(padding => clipHole(paint, heading, padding))),
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
    records[index + 1]?.op === 'fill' && records[index + 1]?.fillStyle === '#e9eef4' && records[index + 1]?.globalAlpha === 1);
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
const paperBridges = rich.filter(record => record.op === 'stroke' && record.strokeStyle === '#e9eef4' && record.lineWidth === 5);
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
const windowTracery = sample => sample.paintings.filter(paint => paint.op === 'stroke' && paint.lineWidth === 1.05 && paint.globalAlpha === .58);
const windowPanes = sample => sample.paintings.filter((paint, index) => paint.op === 'fill' &&
  ['#fff', '#ffffff'].includes(paint.fillStyle) && paint.globalAlpha === 1 &&
  paint.commands.filter(command => command.op === 'lineTo').length > 20 &&
  sample.paintings[index + 1]?.op === 'stroke' && sample.paintings[index + 1]?.lineWidth === .85 &&
  ['#a5bfd4', '#35516e'].includes(sample.paintings[index + 1]?.strokeStyle));
const folioPaper = records => {
  const paths = paintedPaths(records);
  return paths.flatMap((path, index) => path.op === 'fill' &&
    ['#183459', '#294974', '#dce6ed', '#1c3047', '#e9eef4', '#0c1424', '#ffffff', '#101c2d'].includes(path.fillStyle) &&
    path.commands.filter(command => command.op === 'bezierCurveTo').length >= 3
    ? [{ ...path, contourWeight: paths[index + 1]?.op === 'stroke' ? paths[index + 1].lineWidth : null }] : []);
};
const pathBounds = path => {
  const points = pathSegments(path).flat();
  return { left: Math.min(...points.map(point => point[0])), right: Math.max(...points.map(point => point[0])),
    top: Math.min(...points.map(point => point[1])), bottom: Math.max(...points.map(point => point[1])) };
};
// Realistic measured identity cards in very different window proportions must
// keep the completed portal and both imprints inside the available canvas.
for (const [width, height, card] of [
  [320, 568, { x: 26, y: 244, width: 268, height: 220 }],
  [390, 844, { x: 35, y: 340, width: 320, height: 240 }],
  [2560, 360, { x: 1125, y: 120, width: 310, height: 160 }],
  [1920, 1080, { x: 736, y: 440, width: 448, height: 320 }],
]) {
  const title = { x: card.x - 20, y: Math.max(26, card.y - 134), width: card.width + 40, height: 88 };
  const sample = render(width, height, { ...base, phase: 2, visualProgress: 1, impulse: 0,
    layout: { identity: card, heading: title } });
  const arches = mainArches(sample.records);
  assert.ok(arches.length >= 2, 'responsive identity must retain the pointed-arch subject');
  for (const ink of [...arches, ...manuscriptRings(sample, Math.min(width, height) / 1000)]) {
    const bounds = pathBounds(ink);
    assert.ok(bounds.left >= 0 && bounds.top >= 0 && bounds.right <= width && bounds.bottom <= height,
      `completed identity subject must stay inside ${width}x${height}, without cropping important geometry`);
  }
  const rings = manuscriptRings(sample, Math.min(width, height) / 1000);
  assert.equal(rings.length, 8, 'responsive sizing must retain both distinct identity imprints');
  for (const ring of rings) {
    const radius = ring.commands[0].args[2] * Math.hypot(ring.matrix[0], ring.matrix[1]);
    assert.ok(radius < Math.min(card.width, card.height) * .18, 'small imprints must remain subordinate to the real identity card');
  }
}
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
    const oldWindow = windowTracery(old).flatMap(pathSegments).flat(), nextWindow = windowTracery(next).flatMap(pathSegments).flat();
    assert.ok(oldWindow.length > 0, 'the source portal must really paint its shoulder and window tracery');
    assert.equal(nextWindow.length, oldWindow.length, 'the book must inherit the full window construction, including partial strokes');
    assert.ok(oldWindow.every((point, index) => Math.hypot(point[0] - nextWindow[index][0], point[1] - nextWindow[index][1]) < 1e-6),
      'church window ink must remain continuous at the identity-to-book handoff');
    const oldPanes = windowPanes(old).flatMap(pathSegments).flat(), nextPanes = windowPanes(next).flatMap(pathSegments).flat();
    assert.ok(oldPanes.length > 0, 'the portal must include actual opaque white window panes');
    assert.equal(nextPanes.length, oldPanes.length, 'white panes must transfer as the same complete shapes');
    assert.ok(oldPanes.every((point, index) => Math.hypot(point[0] - nextPanes[index][0], point[1] - nextPanes[index][1]) < 1e-6),
      'white window faces must recompose with the existing ink rather than pop in as a new layer');
  }
  for (const progress of [.55, .63, 1]) {
    const old = render(width, height, { ...base, phase: 2, visualProgress: progress, ambientTime: 7.3, impulse: 0, layout: sourceLayout });
    const next = frame(0, { ambientTime: 7.38, bookSource: { ...state.bookSource, progress, ambientTime: 7.3 } });
    const oldRings = manuscriptRings(old, unit), nextRings = manuscriptRings(next, unit);
    assert.equal(oldRings.length, 8, 'the preceding identity scene must actually paint both seal originals');
    assert.equal(nextRings.length, oldRings.length, 'entry to the book must inherit the complete pair of seal originals');
    const sealInk = (sample, rings) => sample.paintings.filter(paint => rings.some(ring =>
      Math.abs(paint.matrix[4] - ring.matrix[4]) < 1e-9 && Math.abs(paint.matrix[5] - ring.matrix[5]) < 1e-9));
    const oldInk = sealInk(old, oldRings), nextInk = sealInk(next, nextRings);
    assert.equal(nextInk.length, oldInk.length, 'the source seal must retain all inner traceries, not only its outer ring');
    const previous = oldInk.flatMap(pathSegments).flat(), incoming = nextInk.flatMap(pathSegments).flat();
    assert.equal(previous.length, incoming.length);
    assert.ok(previous.every((point, index) => Math.hypot(point[0] - incoming[index][0], point[1] - incoming[index][1]) < 1e-6),
      `the entire seal imprint must be positionally continuous from source progress ${progress} at ${width}px`);
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
  assert.ok(Math.min(...[.45, .55, .65, .75, .85].map(age => distanceFromBinding(movingPoints(age)))) < distanceFromBinding(movingPoints(0)) * .35,
    'the original arches must collect around the measured binding before becoming the page rims');

  const covers = folioPaper(frame(.6).records);
  assert.ok(covers.length > 0 && covers.every(path => path.fillStyle === '#183459'), 'covers lead the construction before any paper leaf opens');
  const midPaper = folioPaper(frame(.90).records);
  assert.ok(midPaper.some(path => path.fillStyle === '#dce6ed') && midPaper.some(path => path.fillStyle === '#ffffff'),
    'the two underleaves must already be following the cover on distinct delayed trajectories');
  assert.ok(!midPaper.some(path => path.contourWeight === 1.05), 'the main writing leaf must enter after the underleaves');
  const latePaper = folioPaper(frame(1.2).records);
  assert.ok(latePaper.some(path => path.contourWeight === 1.05 && path.fillStyle === '#ffffff'), 'the final white writing leaf must eventually open');
  const leftSheets = latePaper.filter(path => pathBounds(path).right <= book.gutterX + .001);
  assert.equal(leftSheets.length, 4, 'the moving spread must include its cover and three separate physical sheets');
  assert.ok(leftSheets.slice(1).every((sheet, index) => pathBounds(leftSheets[index]).left < pathBounds(sheet).left),
    'cover, underleaves and writing leaf must have visibly distinct extents during the staggered opening');

  const complete = frame(2.5, { bookOpen: 1 }), registered = frame(2.5, { phase: 4, bookOpen: 1 });
  const fullPaper = folioPaper(complete.records);
  const writingLeaves = fullPaper.filter(path => path.contourWeight === 1.05 && path.fillStyle === '#ffffff');
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

  // Resizing must reproject the actual saved ink, not a newly rebuilt portal
  // whose responsive pixel limits may differ. Wide-to-tall changes must retain
  // one similarity transform instead of stretching card axes independently.
  const original = render(width, height, { ...base, phase: 2, visualProgress: 1, impulse: 0, layout: sourceLayout });
  for (const [targetWidth, targetHeight] of [[width * .7, height * .7], [390, 844], [1280, 420]]) {
    const scale = Math.min(targetWidth / width, targetHeight / height);
    const fitPoint = point => [targetWidth / 2 + (point[0] - width / 2) * scale, targetHeight / 2 + (point[1] - height / 2) * scale];
    const expectedArches = mainArches(original.records).flatMap(pathSegments).map(segment => segment.map(fitPoint));
    const resized = render(targetWidth, targetHeight, { ...state, bookAge: 0 });
    const actualArches = mainArches(resized.records).flatMap(pathSegments);
    assert.ok(actualArches.length > 0);
    for (const [points, segments] of [[expectedArches.flat(), actualArches], [actualArches.flat(), expectedArches]]) {
      assert.ok(Math.max(...points.map(point => distanceToSegments(point, segments))) < .8,
        `changing ${width}x${height} to ${targetWidth}x${targetHeight} must fit the saved portal as one undistorted drawing`);
    }
    const expectedSeals = manuscriptRings(original, unit).flatMap(pathSegments).flat().map(fitPoint);
    const actualSeals = manuscriptRings(resized, Math.min(targetWidth, targetHeight) / 1000).flatMap(pathSegments).flat();
    assert.equal(actualSeals.length, expectedSeals.length, 'aspect-ratio reflow must retain both source imprints');
    assert.ok(expectedSeals.every((point, index) => Math.hypot(point[0] - actualSeals[index][0], point[1] - actualSeals[index][1]) < 1e-6),
      'the seals must use the same similarity transform as the source arches during viewport reflow');
    const expectedWindow = windowTracery(original).flatMap(pathSegments).flat().map(fitPoint);
    const actualWindow = windowTracery(resized).flatMap(pathSegments).flat();
    assert.equal(actualWindow.length, expectedWindow.length, 'responsive handoff must retain all source window tracery');
    assert.ok(expectedWindow.every((point, index) => Math.hypot(point[0] - actualWindow[index][0], point[1] - actualWindow[index][1]) < 1e-6),
      'window tracery must resize together with the portal, without recomposing a different source');
    const expectedPanes = windowPanes(original).flatMap(pathSegments).flat().map(fitPoint);
    const actualPanes = windowPanes(resized).flatMap(pathSegments).flat();
    assert.equal(actualPanes.length, expectedPanes.length, 'source white panes must survive responsive projection');
    assert.ok(expectedPanes.every((point, index) => Math.hypot(point[0] - actualPanes[index][0], point[1] - actualPanes[index][1]) < 1e-6),
      'opaque white faces must share the source tracery similarity transform');
  }
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
function manuscriptRings(sample, unit) {
  return sample.paintings.filter(paint => paint.op === 'stroke' && paint.globalAlpha === .67 &&
    Math.abs(paint.lineWidth * unit - 1.05) < 1e-7 && paint.commands.length === 1 && paint.commands[0].op === 'arc');
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
    inventory: { status: 'idle', skills: [], plugins: [], issues: [] },
    layout: { book, inventory: book } };
  const frame = changes => {
    const sample = render(width, height, { ...state, ...changes });
    maxCommands = Math.max(maxCommands, sample.records.length);
    maxPaintCalls = Math.max(maxPaintCalls, sample.paintings.length);
    assert.ok(sample.records.length < 12000, 'manuscript illumination must remain within the canvas command budget');
    return sample;
  };
  const ornaments = sample => sample.paintings.filter(paint => [left, right].some(page => clipHole(paint, page.heading)));
  const onPaper = paint => paint.clips.some(clip => clip.rule === 'nonzero' && clip.commands.filter(command => command.op === 'bezierCurveTo').length >= 3);
  const pageOrnaments = sample => ornaments(sample).filter(onPaper);
  const sealRings = sample => manuscriptRings(sample, unit).filter(paint => {
    const [x, y] = screenPoint(paint.commands[0]);
    return x > book.x && x < book.x + book.width && y > book.y && y < book.y + book.height;
  });
  const completed = frame(), illumination = ornaments(completed);
  assert.ok(illumination.length > 20, 'the completed pages must gain real ornamental paths inside the measured writing exclusions');
  assert.ok(pageOrnaments(completed).length > 20, 'page-border tracery must retain the actual bowed-paper clipping surface');
  for (const paint of illumination) {
    const page = clipHole(paint, left.heading) ? left : right;
    const occupied = { ...page.list, height: page.occupiedBottom - page.list.y };
    const headingClip = clipHole(paint, page.heading), writingClip = clipHole(paint, occupied);
    assert.ok(writingClip && writingClip !== headingClip, 'each ornamental stroke needs independent heading and real text exclusions');
    const [a, b, c, d] = paint.matrix, scale = Math.hypot(a, b);
    assert.ok(scale > 0 && Math.abs(scale - Math.hypot(c, d)) < 1e-9 && Math.abs(a * c + b * d) < 1e-9 && a * d - b * c > 0,
      'ornament turns and scaling must stay in the flat page plane without skew or perspective');
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
  assert.equal(pageOrnaments(early).length, 0, 'new page-border illumination must wait for the physical leaves');
  assert.ok(pageOrnaments(ruled).length > 0, 'border tracery enters while the leaves are opening');
  assert.equal(manuscriptRings(ruled, unit).length, 8, 'the inherited seals must remain present while the page borders assemble');
  if (left.width >= 210) {
    const headerCopy = sample => ornaments(sample).filter(paint => paint.op === 'fillText').map(paint => paint.args[0]).join('');
    assert.equal(headerCopy(ruled), '', 'running heads must follow the earlier border layer');
    assert.match(headerCopy(frame({ bookAge: 1.6 })), /CONCORD \/ ICONCORD \/ II/, 'running heads must start engraving before the seals');
  }
  assert.equal(manuscriptRings(inscribed, unit).length, 8, 'all inherited ring segments remain visible during the arrival');
  const initialRing = manuscriptRings(frame({ bookAge: 0 }), unit)[0].commands[0];
  const duringRing = manuscriptRings(inscribed, unit)[0].commands[0], finalRing = rings[0].commands[0];
  const initialPoint = screenPoint(initialRing), duringPoint = screenPoint(duringRing), finalPoint = screenPoint(finalRing);
  assert.ok(Math.hypot(initialPoint[0] - finalPoint[0], initialPoint[1] - finalPoint[1]) > 30 &&
    Math.hypot(duringPoint[0] - finalPoint[0], duringPoint[1] - finalPoint[1]) > 2,
    'the existing seal must physically travel into the leaf rather than cut or fade to a second mark');
  assert.ok(finalRing.args[2] > initialRing.args[2] * 1.2, 'a sparse page must visibly expand the incoming imprint into its illuminated seal');
  for (const age of [0, .2, .58, .73, .82, 1.15, 1.8, 2.42, 2.61, 3]) {
    const sample = frame({ bookAge: age });
    const ringInk = manuscriptRings(sample, unit), next = manuscriptRings(frame({ bookAge: age + .00001 }), unit);
    const points = ringInk.flatMap(pathSegments).flat(), advanced = next.flatMap(pathSegments).flat();
    assert.equal(points.length, advanced.length, 'seal topology must be carried through each choreography handoff');
    assert.ok(points.every((point, index) => Math.hypot(point[0] - advanced[index][0], point[1] - advanced[index][1]) < .1),
      'advancing the migration clock infinitesimally must not jump a seal');
    const travellingInk = sample.paintings.filter(paint => !onPaper(paint) && clipHole(paint, left.heading) && clipHole(paint, right.heading));
    assert.ok(travellingInk.length > 20, 'both seal originals must be painted under fixed screen-space text guards');
    for (const page of [left, right]) assert.ok(travellingInk.every(paint => clipHole(paint, { ...page.list, height: page.occupiedBottom - page.list.y })),
      'rotating and moving seal ink must retain both real list exclusions at every sampled pose');
  }
  assert.deepEqual(ornaments(frame({ phase: 4 })), illumination, 'result registration must carry the same page illumination without rebuilding it');
  assert.equal(frame({ reducedMotion: true, bookAge: 0, ambientTime: 0 }).hash,
    frame({ reducedMotion: true, bookAge: 100, ambientTime: 100 }).hash, 'reduced motion must use the final readable illumination pose');
  const settled = manuscriptRings(frame({ bookAge: 100, pointer: [.5, .5], drag: 0 }), unit).flatMap(pathSegments);
  const accessible = manuscriptRings(frame({ reducedMotion: true, bookAge: 0 }), unit).flatMap(pathSegments);
  assert.deepEqual(accessible, settled, 'reduced motion must place seals in their final destinations, not freeze them along the travel path');

  // Real SSE rows may grow while the book is already open. During discovery
  // the original seals park at fixed clasps; only registration moves them into
  // the final free space, preventing per-row changes from teleporting marks.
  const filledBook = { ...book, left: { ...left, occupiedBottom: left.list.y + left.list.height },
    right: { ...right, occupiedBottom: right.list.y + right.list.height } };
  const sealPose = sample => manuscriptRings(sample, unit).flatMap(pathSegments);
  for (const status of ['loading', 'complete', 'error', 'cancelled', 'unavailable']) {
    for (const age of [.9, 1.8, 4]) {
      const actual = { ...inventory, status }, sparse = frame({ inventory: actual, bookAge: age });
      const full = frame({ inventory: actual, bookAge: age, layout: { book: filledBook, inventory: book } });
      assert.deepEqual(sealPose(sparse), sealPose(full), `${status} SSE reflow must not change a migrating imprint's destination at age ${age}`);
    }
  }
  const beforeRegistration = frame({ inventory, bookAge: 4 });
  const registration = progress => frame({ phase: 4, inventory, bookAge: 4, progress, visualProgress: progress });
  assert.deepEqual(sealPose(registration(0)), sealPose(beforeRegistration), 'registration must start from the already parked clasp pose');
  assert.deepEqual(folioPaper(registration(0).records), folioPaper(beforeRegistration.records), 'the real result must not restart or replace the opened paper');
  assert.deepEqual(sealPose(registration(1)), sealPose(completed), 'finished real results must place the inherited seals into the measured free area');
  assert.deepEqual(sealPose(frame({ phase: 4, inventory, bookAge: 0, progress: 0, visualProgress: 0, reducedMotion: true })), sealPose(registration(1)),
    'reduced motion must directly use the completed registration pose');
  for (const progress of [0, .14, .15, .25, .5, .81, .82, .99]) {
    const sample = registration(progress), current = sealPose(sample).flat(), next = sealPose(registration(progress + .00001)).flat();
    assert.equal(current.length, next.length);
    assert.ok(current.every((point, index) => Math.hypot(point[0] - next[index][0], point[1] - next[index][1]) < .1),
      'registration must move continuously from its exterior clasps into the final writing-free area');
    for (const ring of manuscriptRings(sample, unit)) for (const page of [left, right]) {
      assert.ok(clipHole(ring, page.heading) && clipHole(ring, { ...page.list, height: page.occupiedBottom - page.list.y }),
        'registered seal travel must keep both true headings and list bodies protected');
    }
  }

  for (const occupancy of ['overflow', 'unknown', 'wrapped']) {
    const adjusted = Object.fromEntries(['left', 'right'].map(side => {
      const page = book[side];
      return [side, { ...page, occupiedBottom: occupancy === 'unknown' ? NaN : page.list.y + page.list.height - (occupancy === 'wrapped' ? 12 : 0) }];
    }));
    const packed = frame({ layout: { book: { ...book, ...adjusted }, inventory: book } });
    assert.equal(sealRings(packed).length, 0,
      `${occupancy} text bounds must remove the seal rather than spend real list space on decoration`);
    const clasps = manuscriptRings(packed, unit);
    assert.equal(clasps.length, 8, 'dense or unmeasured lists must retain their inherited seals as exterior clasps');
    assert.ok(clasps.every(ring => {
      const arc = ring.commands[0], [x] = screenPoint(arc), radius = arc.args[2] * unit;
      return x + radius < book.x || x - radius > book.x + book.width;
    }), 'the entire clasp ring must stay beyond the physical page edge instead of covering a real row');
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
console.log(`PASS: ${samples} reference + ${extremeSamples} extreme Laterano frames, measured writing exclusions, layered manuscript illumination, single upright iris, portal-to-spine continuity, staggered curved folio, truthful loading activity and reduced motion. Peak: ${maxCommands}/12000 commands; ${maxPaintCalls} paint calls.`);

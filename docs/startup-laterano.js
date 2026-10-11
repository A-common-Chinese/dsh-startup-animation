/* DSH / CONCORD: geometry becoming architecture in six movements.
 * Equal circles form a vesica, intersecting arcs form a pointed portal,
 * and the portal opens into a registry spread. No copied game artwork.
 * The host owns identity, access verification, inventory and narration.
 */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const section = (value, start, end) => clamp((value - start) / (end - start));
  const ease = value => 1 - Math.pow(1 - clamp(value), 4);
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const fract = value => value - Math.floor(value);

  function draw(ctx, width, height, state = {}) {
    if (!ctx || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    const phase = clamp(Math.floor(finite(state.phase)), 0, 5);
    const reduced = !!state.reducedMotion, visualClock = Number.isFinite(state.visualProgress);
    const resting = reduced || !!state.waiting && !visualClock;
    const progress = resting ? 1 : clamp(visualClock ? state.visualProgress : finite(state.progress));
    const ambient = reduced ? 0 : finite(state.ambientTime, finite(state.time));
    const drag = reduced ? 0 : finite(typeof state.drag === 'object' ? state.drag?.x : state.drag);
    const impulse = reduced ? 0 : clamp(finite(state.impulse));
    const choice = clamp(Math.floor(finite(state.choice)), 0, 2);
    const pointer = state.pointer || {};
    const nx = reduced ? .5 : clamp(finite(Array.isArray(pointer) ? pointer[0] : pointer.x, .5));
    const ny = reduced ? .5 : clamp(finite(Array.isArray(pointer) ? pointer[1] : pointer.y, .5));
    const unit = Math.min(width, height) / 1000, W = width / unit, H = height / unit;
    const atY = fraction => (fraction - .5) * H;
    const parallax = { x: (nx - .5) * 20, y: (ny - .5) * 14 };
    const gesture = Math.sin(drag * .36) * .065;
    const ROOT3 = Math.sqrt(3), wide = W / H > 1.24;
    const light = state.light !== false;
    const color = light ? {
      paper: '#f6f7f6', ink: '#101820', blue: '#195acc', cyan: '#159dcc',
      line: '#a5bfd4', faint: '#dce6ed', soft: '#60768d', white: '#ffffff',
    } : {
      paper: '#0c1424', ink: '#edf3f9', blue: '#679cff', cyan: '#4dbbda',
      line: '#35516e', faint: '#1c3047', soft: '#96afc7', white: '#101c2d',
    };
    const accent = [color.blue, color.cyan, light ? '#3645bc' : '#a4a9ff'][choice];
    const identity = String(state.identity || 'OPERATOR').trim().slice(0, 28) || 'OPERATOR';
    const inventory = state.inventory || {};
    const skillCount = Array.isArray(inventory.skills) ? inventory.skills.length : 0;
    const pluginCount = Array.isArray(inventory.plugins) ? inventory.plugins.length : 0;
    const issues = Array.isArray(inventory.issues) ? inventory.issues : [];
    const lettering = window.DSHText || globalThis.DSHText;
    const textAge = reduced ? 10 : finite(state.textAge, resting ? 2 : progress * 2.4);
    let textOrder = 0;

    function measured(value) {
      if (!value || ![value.x, value.y, value.width, value.height].every(Number.isFinite) || value.width <= 0 || value.height <= 0) return null;
      return {
        left: (value.x - width / 2) / unit, right: (value.x + value.width - width / 2) / unit,
        top: (value.y - height / 2) / unit, bottom: (value.y + value.height - height / 2) / unit,
        rows: Array.isArray(value.rows) ? value.rows : [],
      };
    }
    const identityBox = measured(state.layout?.identity);
    const inventoryBox = measured(state.layout?.inventory);
    const bookBox = measured(state.layout?.book);
    const bookLeft = measured(state.layout?.book?.left), bookRight = measured(state.layout?.book?.right);
    const bookGutter = Number.isFinite(state.layout?.book?.gutterX) ? (state.layout.book.gutterX - width / 2) / unit : 0;
    const bookOpen = reduced ? 1 : Number.isFinite(state.bookOpen) ? clamp(state.bookOpen) : ease(section(progress, .10, .75));
    // A single clock owns the entire identity → folio construction, including
    // discovery → results. Text reveal is deliberately independent of the ink.
    const bookAge = reduced ? 3 : Math.max(0, finite(state.bookAge,
      Number.isFinite(state.bookOpen) ? clamp(state.bookOpen) * 2.02 : progress * 2.02));
    const bookBuild = smooth(section(bookAge, .10, 1.72));
    function sourceMeasured(value) {
      const viewport = state.bookSource?.viewport;
      if (!value || !viewport || !(viewport.width > 0 && viewport.height > 0)) return measured(value);
      const sx = width / viewport.width, sy = height / viewport.height;
      return measured({ ...value, x: value.x * sx, y: value.y * sy,
        width: value.width * sx, height: value.height * sy });
    }
    const sourceIdentity = sourceMeasured(state.bookSource?.layout?.identity);
    const sourceHeading = sourceMeasured(state.bookSource?.layout?.heading);
    const coverInk = light ? '#183459' : '#294974';
    // Measured cards and headings are authoritative geometry anchors. Stage
    // headings do not punch rectangular holes in the architecture behind them;
    // only real identity / inventory writing owns an exclusion rectangle.
    const headingBox = measured(state.layout?.heading) || (phase === 1 ? { left: -W * .34, right: W * .34, top: atY(.29), bottom: atY(.47) } :
      phase === 2 ? { left: -W * .36, right: W * .36, top: atY(.17), bottom: Math.min(identityBox?.top ?? atY(.43), atY(.44)) } :
      { left: -W * .35, right: W * .35, top: atY(.17), bottom: atY(.32) });

    function line(x1, y1, x2, y2, ink = color.line, alpha = 1, weight = 1) {
      if (alpha <= 0) return;
      ctx.globalAlpha = clamp(alpha); ctx.strokeStyle = ink; ctx.lineWidth = weight;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.globalAlpha = 1;
    }
    function rect(x, y, w, h, ink = color.ink, alpha = 1) {
      if (alpha <= 0 || w <= 0 || h <= 0) return;
      ctx.globalAlpha = clamp(alpha); ctx.fillStyle = ink; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
    }
    function polygon(points, ink, alpha = 1, outline = null, weight = 1) {
      if (alpha <= 0) return;
      ctx.globalAlpha = clamp(alpha); ctx.beginPath();
      points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
      if (ink) { ctx.fillStyle = ink; ctx.fill(); }
      if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = weight; ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    function arc(x, y, radius, start, end, ink = accent, alpha = 1, weight = 1) {
      if (alpha <= 0 || radius <= 0 || end <= start) return;
      ctx.globalAlpha = clamp(alpha); ctx.strokeStyle = ink; ctx.lineWidth = weight;
      ctx.beginPath(); ctx.arc(x, y, radius, start, end); ctx.stroke(); ctx.globalAlpha = 1;
    }
    function diamond(x, y, radius, ink = accent, alpha = 1, filled = true) {
      polygon([[x, y - radius], [x + radius, y], [x, y + radius], [x - radius, y]], filled ? ink : null, alpha, filled ? null : ink, 1);
    }
    function trace(points, amount, ink = accent, alpha = 1, weight = 1) {
      const distances = points.slice(1).map((point, index) => Math.hypot(point[0] - points[index][0], point[1] - points[index][1]));
      const end = distances.reduce((sum, distance) => sum + distance, 0) * clamp(amount);
      let offset = 0;
      distances.forEach((distance, index) => {
        const fraction = distance > 0 ? clamp((end - offset) / distance) : 0;
        if (fraction > 0) line(points[index][0], points[index][1], lerp(points[index][0], points[index + 1][0], fraction), lerp(points[index][1], points[index + 1][1], fraction), ink, alpha, weight);
        offset += distance;
      });
    }
    function label(value, x, y, size = 10, ink = color.soft, alpha = 1, spacing = 2, align = 'center', weight = 500, serif = false) {
      if (alpha <= 0) return;
      const valueString = String(value), chars = lettering?.characters(valueString) || [...valueString];
      ctx.save(); ctx.globalAlpha = clamp(alpha); ctx.fillStyle = ink;
      ctx.font = serif ? `400 ${size}px "Times New Roman", "Georgia", serif` : `${weight} ${size}px "Bahnschrift", "DSH Industrial SC", "Arial", sans-serif`;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const cells = chars.map(char => ctx.measureText(char).width + spacing);
      const full = Math.max(0, cells.reduce((sum, cell) => sum + cell, 0) - spacing);
      const left = align === 'center' ? x - full / 2 : align === 'right' ? x - full : x;
      const kind = size >= 30 ? 'roll' : size >= 15 ? 'type' : 'decode';
      const sample = lettering?.sample(valueString, textAge, { kind, delay: Math.min(textOrder++ * .022, .18), reducedMotion: reduced });
      const displayed = sample && !sample.settled ? lettering.characters(sample.text) : chars;
      ctx.beginPath(); ctx.rect(left - 1, y - size * .72, (full + 2) * (kind === 'type' ? sample?.reveal ?? 1 : 1), size * 1.55); ctx.clip();
      let position = left;
      displayed.forEach((char, index) => { ctx.fillText(char, position, y + (sample?.offset || 0) * size); position += cells[index] || 0; });
      ctx.restore();
    }
    function outside(boxes, paint, padding = 14) {
      ctx.save();
      // Separate clipping passes preserve overlapping exclusion rectangles.
      // One even-odd path with intersecting holes would expose their overlap.
      for (const box of boxes.filter(Boolean)) {
        ctx.beginPath(); ctx.rect(-W / 2, -H / 2, W, H);
        ctx.rect(box.left - padding, box.top - padding, box.right - box.left + padding * 2, box.bottom - box.top + padding * 2);
        ctx.clip('evenodd');
      }
      paint(); ctx.restore();
    }
    function emblem(x, y, scale, assembly = 1, ink = color.ink, alpha = 1) {
      const parts = window.DSHLateranoEmblem?.parts || [];
      ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
      // The broken circular seal owns a clean paper medallion. Construction
      // geometry can surround it, but may never cross the lancets or DSH type.
      const clear = resting ? 1 : smooth(section(assembly, .10, .72));
      ctx.save(); ctx.globalAlpha = alpha * clear; ctx.fillStyle = color.paper;
      ctx.beginPath(); ctx.arc(0, -5, 102, 0, TAU); ctx.fill(); ctx.restore();
      parts.forEach((contours, index) => {
        const arrival = resting ? 1 : ease(section(assembly, index * .035, .64 + index * .035));
        const side = index % 2 ? -1 : 1;
        ctx.save(); ctx.translate(side * (1 - arrival) * (index < 2 ? 185 : 265), (1 - arrival) * (index - 2) * 64);
        ctx.globalAlpha = clamp(alpha * Math.min(1, arrival * 2.4));
        ctx.beginPath();
        contours.forEach(points => { points.forEach(([xx, yy], point) => point ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy)); ctx.closePath(); });
        ctx.fillStyle = ink; ctx.fill('evenodd'); ctx.restore();
      });
      ctx.restore();
    }


    function type(value, x, y, size = 11, ink = color.soft, alpha = 1, spacing = 2, align = 'left', serif = false) {
      label(value, x, y, size, ink, alpha, spacing, align, serif ? 400 : 500, serif);
    }
    function dot(x, y, radius, ink = accent, alpha = 1) {
      if (alpha <= 0) return;
      ctx.save(); ctx.globalAlpha = clamp(alpha); ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill(); ctx.restore();
    }
    function page(numeral, opacity = .055) {
      // The chapter becomes an architectural fragment, not a field of HUD ticks.
      type(numeral, wide ? W * .455 : W * .48, atY(.46), wide ? 770 : 590, color.ink, opacity, -25, 'right', true);
      const x0 = -W / 2 + 43, x1 = W / 2 - 43, y = atY(.835);
      line(x0, y, x1, y, color.line, .52, .8);
      line(x0, y, x0 + 61, y, accent, .94, 2);
      type('DSH', x0, y + 25, 12, color.ink, .84, 2.5);
      type('CONCORD', x1, y + 25, 10, color.soft, .85, 3, 'right');
    }
    function axis(x, y, radius, amount, alpha = 1) {
      const q = smooth(amount), length = radius * 1.65;
      line(x - length, y, lerp(x - length, x + length, q), y, color.line, alpha * .65, .8);
      line(x, y - length, x, lerp(y - length, y + length, q), color.line, alpha * .65, .8);
      for (const side of [-1, 1]) {
        const yy = y + side * ROOT3 * radius / 2;
        line(x - 8, yy, x + 8, yy, accent, alpha * q, 1);
        line(x, yy - 8, x, yy + 8, accent, alpha * q, 1);
        dot(x, yy, 2, accent, alpha * q);
      }
    }
    function vesica(x, y, radius, amount = 1, alpha = 1, filled = false) {
      // Equal circles at half-radius offsets yield the true sqrt(3):2 lens.
      const circle = smooth(section(amount, 0, .29)), intersection = smooth(section(amount, .16, .43));
      const ink = smooth(section(amount, .34, .56));
      for (const side of [-1, 1]) {
        const start = side < 0 ? -Math.PI / 2 : Math.PI / 2;
        arc(x + side * radius / 2, y, radius, start, start + TAU * circle,
          side < 0 ? accent : color.line, alpha * (side < 0 ? .75 : .65), side < 0 ? 1.15 : .8);
      }
      axis(x, y, radius, intersection, alpha);
      if (filled && ink > 0) {
        ctx.save(); ctx.globalAlpha = ink * alpha * .07; ctx.fillStyle = accent; ctx.beginPath();
        ctx.arc(x - radius / 2, y, radius, -Math.PI / 3, Math.PI / 3);
        ctx.arc(x + radius / 2, y, radius, Math.PI * 2 / 3, Math.PI * 4 / 3);
        ctx.closePath(); ctx.fill(); ctx.restore();
      }
      const q = smooth(section(amount, .27, .60));
      arc(x - radius / 2, y, radius, -Math.PI / 3, -Math.PI / 3 + Math.PI * 2 / 3 * q, accent, alpha * .9, 2);
      arc(x + radius / 2, y, radius, Math.PI * 2 / 3, Math.PI * 2 / 3 + Math.PI * 2 / 3 * q, accent, alpha * .9, 2);
    }
    function pointedArch(x, spring, half, base, amount, alpha = 1, weight = 1, ink = accent) {
      // Opposite spring points are the circle centers. Their intersection is
      // exactly sqrt(3) * half above the spring line; no ornamental approximation.
      const q = smooth(amount), curve = Math.min(1, q * 1.5), legs = smooth(section(q, .43, 1));
      arc(x + half, spring, half * 2, Math.PI, Math.PI + Math.PI / 3 * curve, ink, alpha, weight);
      arc(x - half, spring, half * 2, Math.PI * 5 / 3, Math.PI * 5 / 3 + Math.PI / 3 * curve, ink, alpha, weight);
      for (const side of [-1, 1]) line(x + side * half, spring, x + side * half, lerp(spring, base, legs), ink, alpha, weight);
    }
    function rose(x, y, radius, amount = 1, alpha = 1) {
      const q = smooth(section(amount, 0, .38));
      arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + TAU * q, accent, alpha * .8, 1);
      arc(x, y, radius * .93, -Math.PI / 2, -Math.PI / 2 + TAU * q, color.line, alpha * .6, .8);
      for (let petal = 0; petal < 6; petal++) {
        const a = petal * TAU / 6 - Math.PI / 2;
        const reveal = smooth(section(amount, .10 + petal * .028, .46 + petal * .028));
        const xx = x + Math.cos(a) * radius * .46, yy = y + Math.sin(a) * radius * .46;
        arc(xx, yy, radius * .46, a + Math.PI, a + Math.PI + TAU * reveal, accent, alpha * .5, .9);
        if (reveal > .5) diamond(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 3, accent, alpha * reveal);
      }
      arc(x, y, radius * .12, 0, TAU * smooth(section(amount, .33, .68)), color.ink, alpha * .72, 1.5);
    }
    function iris(x, y, scale = 1, amount = 1, ink = color.ink, alpha = 1, angle = 0) {
      // An original iris cut from five ink plates. The pointed upright petal,
      // broad falling side petals and long negative veins remain botanical at
      // large scale; neither an icon font nor a copied heraldic device is used.
      const q = index => resting ? 1 : ease(section(amount, .055 + index * .055, .43 + index * .065));
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
      for (const side of [-1, 1]) {
        const open = q(1);
        if (open <= 0) continue;
        ctx.save(); ctx.scale(side, 1); ctx.translate((1 - open) * 68, (1 - open) * 40);
        ctx.rotate((1 - open) * .34); ctx.globalAlpha = alpha * open; ctx.fillStyle = ink;
        ctx.beginPath(); ctx.moveTo(7, 24);
        ctx.bezierCurveTo(12, -7, 35, -38, 63, -35);
        ctx.bezierCurveTo(94, -30, 109, 6, 94, 36);
        ctx.bezierCurveTo(86, 53, 68, 65, 52, 68);
        ctx.bezierCurveTo(70, 48, 76, 26, 66, 14);
        ctx.bezierCurveTo(49, -4, 29, 25, 31, 45);
        ctx.bezierCurveTo(28, 62, 10, 68, -2, 64);
        ctx.lineTo(-8, 43); ctx.bezierCurveTo(8, 45, 10, 36, 7, 24); ctx.closePath();
        // A tapered vein exposes the paper instead of adding a painted line.
        // Clip to the petal before cutting so a taper can never add exterior ink.
        ctx.clip();
        ctx.moveTo(21, 37); ctx.bezierCurveTo(37, -10, 65, -23, 79, 5);
        ctx.bezierCurveTo(64, -11, 43, 1, 34, 43);
        ctx.bezierCurveTo(31, 48, 24, 44, 21, 37); ctx.closePath();
        ctx.fill('evenodd'); ctx.restore();
      }
      const standard = q(0);
      if (standard > 0) {
        // Rise from the bud so the petal's highest point never exceeds its
        // final footprint; measured gate capitals can therefore stay intact.
        ctx.save(); ctx.translate(0, (1 - standard) * 87); ctx.scale(.45 + standard * .55, 1);
        ctx.globalAlpha = alpha * standard; ctx.fillStyle = ink; ctx.beginPath(); ctx.moveTo(0, -95);
        ctx.bezierCurveTo(-35, -62, -29, -16, 0, 30);
        ctx.bezierCurveTo(29, -16, 35, -62, 0, -95); ctx.closePath();
        ctx.clip();
        ctx.moveTo(0, -69); ctx.bezierCurveTo(-4, -30, -5, -15, 0, 15);
        ctx.bezierCurveTo(5, -15, 4, -30, 0, -69); ctx.closePath();
        ctx.fill('evenodd'); ctx.restore();
      }
      const bind = q(3), foot = q(4);
      polygon([[-26, 45], [26, 45], [22, 56], [-22, 56]], ink, alpha * bind);
      if (foot > 0) {
        ctx.save(); ctx.translate(0, 28 * (1 - foot)); ctx.globalAlpha = alpha * foot; ctx.fillStyle = ink;
        ctx.beginPath(); ctx.moveTo(-11, 59); ctx.lineTo(11, 59);
        ctx.bezierCurveTo(11, 79, 29, 92, 38, 75);
        ctx.bezierCurveTo(37, 105, 14, 102, 7, 83);
        ctx.lineTo(0, 114); ctx.lineTo(-7, 83);
        ctx.bezierCurveTo(-14, 102, -37, 105, -38, 75);
        ctx.bezierCurveTo(-29, 92, -11, 79, -11, 59); ctx.closePath(); ctx.fill(); ctx.restore();
      }
      ctx.restore();
    }
    function quatrefoil(x, y, radius, amount = 1, ink = accent, alpha = 1, filled = false, angle = 0) {
      const reveal = resting ? 1 : smooth(section(amount, .08, .66));
      if (reveal <= 0) return;
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle + (1 - reveal) * Math.PI / 4);
      ctx.scale(radius, radius * (.15 + .85 * reveal));
      ctx.globalAlpha = alpha * reveal;
      const contour = scale => {
        ctx.moveTo(0, -scale);
        for (let petal = 0; petal < 4; petal++) {
          ctx.bezierCurveTo(.45 * scale, -scale, .55 * scale, -.55 * scale, .35 * scale, -.35 * scale);
          ctx.bezierCurveTo(.55 * scale, -.55 * scale, scale, -.45 * scale, scale, 0);
          ctx.rotate(Math.PI / 2);
        }
        ctx.closePath();
      };
      ctx.beginPath(); contour(1);
      if (filled) { contour(.58); ctx.fillStyle = ink; ctx.fill('evenodd'); }
      else { ctx.strokeStyle = ink; ctx.lineWidth = 1.15 / radius; ctx.stroke(); }
      ctx.restore();
    }
    function interlace(x, y, radius, amount = 1, alpha = 1, angle = 0) {
      const traceAmount = smooth(section(amount, .05, .43)), lock = ease(section(amount, .33, .77));
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      const octagon = Array.from({ length: 9 }, (_, index) => {
        const a = index * TAU / 8 - Math.PI / 8;
        return [Math.cos(a) * radius, Math.sin(a) * radius];
      });
      trace(octagon, traceAmount, accent, alpha * .72, 1.1);
      for (let layer = 0; layer < 2; layer++) {
        const turn = layer * Math.PI / 4 + (1 - lock) * (layer ? -.72 : .72);
        const r = radius * (.83 + (1 - lock) * .36);
        ctx.save(); ctx.rotate(turn);
        const square = [[-r / ROOT3, -r / ROOT3], [r / ROOT3, -r / ROOT3], [r / ROOT3, r / ROOT3], [-r / ROOT3, r / ROOT3], [-r / ROOT3, -r / ROOT3]];
        trace(square, traceAmount, layer ? color.ink : accent, alpha * (layer ? .85 : .8), layer ? 2.8 : 1.2);
        ctx.restore();
      }
      for (let index = 0; index < 8; index++) {
        const a = index * TAU / 8, r = radius * .78;
        const q = resting ? 1 : smooth(section(amount, .46 + index * .019, .74 + index * .021));
        if (q <= 0) continue;
        ctx.save(); ctx.rotate(a);
        polygon([[r - 17, 0], [r, -6], [r + 17, 0], [r, 6]], index % 2 ? accent : color.ink, alpha * q);
        ctx.restore();
      }
      ctx.restore();
    }
    function radiantSeal(x, y, radius, amount = 1, alpha = 1) {
      // An engraved sun: alternating pointed rays and four cardinal plates.
      // Its angular silhouette is deliberately different from the circle study.
      const reveal = resting ? 1 : smooth(section(amount, .12, .66));
      ctx.save(); ctx.translate(x, y);
      for (let index = 0; index < 24; index++) {
        const arrival = resting ? 1 : smooth(section(amount, .08 + index % 6 * .024, .48 + index % 6 * .032));
        const angle = index * TAU / 24 - Math.PI / 2;
        const inner = radius * .46, outer = radius * (index % 3 ? .79 : 1);
        const tip = lerp(inner, outer, arrival), broad = index % 3 ? 2 : 5.2;
        ctx.save(); ctx.rotate(angle);
        polygon([[inner, -broad], [tip, 0], [inner, broad], [inner * .9, 0]],
          index % 3 ? accent : color.ink, alpha * arrival);
        ctx.restore();
      }
      diamond(0, 0, radius * .29, accent, alpha * reveal, false);
      diamond(0, 0, radius * .12, color.ink, alpha * reveal);
      for (const side of [-1, 1]) {
        line(side * radius * .15, 0, side * radius * .39, 0, accent, alpha * reveal, 1.3);
        line(0, side * radius * .15, 0, side * radius * .39, accent, alpha * reveal, 1.3);
      }
      ctx.restore();
    }
    function braid(x, y, length, amount = 1, alpha = 1, vertical = false) {
      // A two-strand, square-ended manuscript knot. Paper knockouts alternate
      // at every crossing, giving it over/under structure without any shading.
      const reveal = resting ? 1 : smooth(section(amount, .15, .78));
      if (reveal <= 0 || length <= 0) return;
      const cells = Math.max(2, Math.min(10, Math.round(length / 47))), step = length / cells;
      ctx.save(); ctx.translate(x, y); if (vertical) ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.rect(0, -13, length * reveal, 26); ctx.clip();
      for (let strand = 0; strand < 2; strand++) {
        const points = [];
        for (let i = 0; i <= cells * 2; i++) points.push([i * step / 2, Math.sin(i * Math.PI / 2 + strand * Math.PI) * 8]);
        trace(points, 1, strand ? color.ink : accent, alpha, 1.45);
      }
      for (let i = 1; i < cells; i++) {
        const xx = i * step, rise = i % 2 ? 1 : -1;
        line(xx - 5, rise * -2.3, xx + 5, rise * 2.3, color.paper, alpha, 5);
        line(xx - 5, rise * -2.3, xx + 5, rise * 2.3, i % 2 ? color.ink : accent, alpha, 1.45);
      }
      diamond(0, 0, 3, color.ink, alpha); diamond(length, 0, 3, color.ink, alpha);
      ctx.restore();
    }
    function triptych(x, y, span, height, amount = 1, alpha = 1) {
      // Three lancets share a baseline. The central window rises above its
      // neighbours, with a cut diamond and engraved fan instead of more flowers.
      const half = span / 7.3, base = y + height / 2;
      for (let index = -1; index <= 1; index++) {
        const xx = x + index * span * .34, top = y - height * (index ? .31 : .50);
        const spring = top + ROOT3 * half;
        const arrival = resting ? 1 : ease(section(amount, .09 + (index + 1) * .065, .59 + (index + 1) * .065));
        ctx.save(); ctx.beginPath(); ctx.rect(xx - half - 5, base - height * 1.12 * arrival, half * 2 + 10, height * 1.12); ctx.clip();
        ctx.beginPath(); ctx.moveTo(xx - half, base); ctx.lineTo(xx - half, spring);
        ctx.arc(xx + half, spring, half * 2, Math.PI, Math.PI + Math.PI / 3);
        ctx.arc(xx - half, spring, half * 2, Math.PI * 5 / 3, TAU);
        ctx.lineTo(xx + half, base); ctx.closePath(); ctx.fillStyle = index ? color.ink : accent;
        ctx.globalAlpha = alpha * .93; ctx.fill(); ctx.globalAlpha = 1;
        for (let rib = 1; rib <= 3; rib++) {
          line(xx, top + 16, xx + (rib - 2) * half * .60, base - 12, color.paper, alpha * .68, .75);
        }
        diamond(xx, spring + Math.max(10, (base - spring) * .26), Math.max(4, half * .28), color.paper, alpha);
        line(xx - half * .57, base - 15, xx + half * .57, base - 15, color.paper, alpha * .8, .8);
        ctx.restore();
        pointedArch(xx, spring, half + 5, base + 6, arrival, alpha * .70, .8, accent);
      }
      const arrival = resting ? 1 : smooth(section(amount, .31, .77));
      line(x - span * .54, base + 7, x + span * .54, base + 7, color.ink, alpha * arrival, 2.1);
      line(x - span * .60, base + 13, x + span * .60, base + 13, accent, alpha * arrival, .8);
    }
    function engravedCorner(x, y, direction = 1, amount = 1, alpha = 1) {
      const q = resting ? 1 : smooth(section(amount, .10, .60));
      ctx.save(); ctx.translate(x, y); ctx.scale(direction, 1);
      polygon([[0, 0], [74 * q, 0], [74 * q, 9], [9, 9], [9, 65 * q], [0, 65 * q]], color.ink, alpha);
      for (let i = 0; i < 8; i++) {
        const start = 15 + i * 7;
        line(start, 17, start - 8, 25, accent, alpha * q, .75);
      }
      trace([[17, 34], [34, 17], [51, 34], [34, 51], [17, 34]], q, accent, alpha * .78, 1);
      diamond(34, 34, 3, color.ink, alpha * q);
      ctx.restore();
    }
    function patternedPanel(x, y, panelWidth, panelHeight, amount = 1, reverse = false) {
      const open = resting ? 1 : ease(section(amount, .20, .62));
      if (open <= 0) return;
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight * open); ctx.clip();
      rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, color.ink, .94);
      const rows = 6, step = panelHeight / rows, radius = panelWidth * .29;
      for (let row = 0; row < rows; row++) {
        const cy = -panelHeight / 2 + step * (row + .5);
        const arrival = resting ? 1 : smooth(section(amount, .18 + row * .045, .63 + row * .04));
        // Alternating nested lozenges and engraved chevrons form a woven strip.
        if (row % 2) {
          diamond(0, cy, radius, color.paper, arrival * .92, false);
          diamond(0, cy, radius * .40, color.paper, arrival * .92);
        } else {
          for (let lineIndex = 0; lineIndex < 3; lineIndex++) {
            const offset = (lineIndex - 1) * 5;
            trace([[-radius, cy - 5 + offset], [0, cy + 6 + offset], [radius, cy - 5 + offset]],
              arrival, color.paper, .82, .8);
          }
        }
      }
      line(-panelWidth / 2 + 5, -panelHeight / 2, -panelWidth / 2 + 5, panelHeight / 2, color.paper, .65, .8);
      line(panelWidth / 2 - 5, -panelHeight / 2, panelWidth / 2 - 5, panelHeight / 2, color.paper, .65, .8);
      ctx.restore();
    }
    function floralMargins(variant = 0, amount = progress) {
      // One upright iris is the botanical signature. All other marginalia use
      // architectural and engraved geometry, so the page never becomes floral wallpaper.
      const book = variant === 3 || variant === 4;
      // Reserve the same right margin on every movement. Its width follows the
      // shared folio breakpoints, with the measured page as the final authority.
      // The complete +/-109 petal silhouette must fit both the page and screen.
      const pageEdge = width >= 1600 ? .80 : width > 900 ? .84 : width > 600 ? .90 : .93;
      const flowerLeft = Math.max((pageEdge - .5) * W, bookBox?.right ?? -W / 2) + 15;
      const flowerRight = W / 2 - 14;
      const flowerX = wide ? (flowerLeft + flowerRight) / 2 : W * .31;
      const flowerScale = wide ? Math.min(1.45, Math.max(.08, (flowerRight - flowerLeft) / 218)) :
        .72 * Math.min(1, height / 844);
      iris(flowerX, atY(wide ? .51 : .14), flowerScale,
        section(amount, .04, .92), color.ink, .94, 0);
      if (wide) {
        const left = -W * .437;
        const move = book ? smooth(section(bookAge, .1, 1.2)) : 0;
        triptych(left, atY(lerp(.47, .59, move)), 145, 219, section(amount, .02, .88), .86);
        patternedPanel(W * .445, atY(lerp(.754, .745, move)), 63, 152, section(amount, .12, .92));
        radiantSeal(left, atY(.29), 53, section(amount, .08, .93), .86);
        braid(left - 70, atY(.733), 141, section(amount, .24, .97), .85);
        engravedCorner(-W * .37, atY(.18), 1, section(amount, .08, .96), .74);
        engravedCorner(W * .37, atY(.775), -1, section(amount, .21, .98), .62);
      } else {
        radiantSeal(-W * .367, atY(.717), 43, section(amount, .08, .93), .90);
        braid(-W * .31, atY(.797), W * .62, section(amount, .25, .96), .78);
      }
    }
    function rowRegistration(box) {
      if (!box) return;
      const arrival = resting ? 1 : ease(section(progress, .32, .71));
      for (const side of [-1, 1]) {
        const edge = side < 0 ? box.left : box.right;
        const x = edge + side * 130 * (1 - arrival);
        const arm = Math.min(20 / unit, (box.right - box.left) * .10);
        const rise = Math.min(15 / unit, (box.bottom - box.top) * .14);
        for (const [y, direction] of [[box.top, 1], [box.bottom, -1]]) {
          line(x, y, x - side * arm, y, accent, .95, 2 / unit);
          line(x, y, x, y + direction * rise, accent, .95, 2 / unit);
        }
        box.rows.forEach(row => {
          if (![row.y, row.height].every(Number.isFinite) || row.height <= 0) return;
          const y = (row.y + row.height / 2 - height / 2) / unit;
          line(x, y, x + side * 9, y, accent, .7, 1);
        });
        const center = (box.top + box.bottom) / 2;
        diamond(x + side * 28, center, 4, accent, .8, false);
        line(x + side * 28, center - 22, x + side * 28, center - 8, color.line, .8, 1);
        line(x + side * 28, center + 8, x + side * 28, center + 22, color.line, .8, 1);
      }
    }


    function sealScene() {
      floralMargins(0);
      page('I', .045);
      const radius = wide ? Math.min(272, W * .155) : 232;
      const x = wide ? -W * .225 + parallax.x : parallax.x;
      const y = (wide ? atY(.44) : atY(.385)) + parallax.y;
      const ink = smooth(section(progress, .46, .74));
      ctx.save(); ctx.translate(x, y); ctx.rotate(gesture);
      interlace(0, 0, radius * 1.02, section(progress, .12, .92), .70, Math.PI / 8);
      rose(0, 0, radius * .79, section(progress, .18, .88), .58);
      vesica(0, 0, radius, progress, .95, true);
      if (wide) {
        // Labels share the construction transform, including manual dragging.
        type('A', -radius / 2 - 11, 19, 15, accent, ink, 0, 'right', true);
        type('B', radius / 2 + 11, 19, 15, accent, ink, 0, 'left', true);
        type('C', 13, -ROOT3 * radius / 2 - 6, 15, accent, ink, 0, 'left', true);
      }
      ctx.restore();
      emblem(x, y, wide ? 1.18 : 1.12, section(progress, .39, .77), color.ink);
      const textX = wide ? W * .075 : 0, titleY = wide ? atY(.405) : atY(.645);
      type('DSH', textX, titleY, wide ? 158 : 110, color.ink, ink, wide ? -8 : -5, wide ? 'left' : 'center', true);
      const ruleWidth = wide ? 365 : 285, ruleY = titleY + (wide ? 102 : 66), start = wide ? textX : -ruleWidth / 2;
      line(start, ruleY, start + ruleWidth * ink, ruleY, accent, .88, 1.2);
      type('CONCORD', wide ? textX : 0, ruleY + 37, wide ? 24 : 20, color.ink, ink, 6, wide ? 'left' : 'center', true);
      if (wide) {
        type('DEEPSEEK HARNESS', textX + 2, ruleY + 85, 10, color.soft, ink, 3);
        // A and B are the actual equal-circle centers; C is their intersection.
        type('AC = BC', x, y + ROOT3 * radius / 2 + 32, 12, accent, ink, 1.5, 'center', true);
        quatrefoil(textX + 322, ruleY + 86, 25, section(progress, .38, .93), color.ink, .92, true);
      }
    }
    function linkScene() {
      outside([], () => {
        floralMargins(1);
        page('II', .065);
        const y = atY(.595), anchor = Math.min(W * .32, 440), center = parallax.x * .35;
        const run = smooth(section(progress, .03, .27)), intersection = smooth(section(progress, .24, .49));
        line(-anchor, y, lerp(-anchor, anchor, run), y, color.ink, .86, 1.7);
        line(center, y - 174, center, lerp(y - 174, y + 174, intersection), accent, .84, 1.2);
        for (const side of [-1, 1]) {
          const x = side * anchor, start = side < 0 ? -Math.PI / 2 : Math.PI / 2;
          dot(x, y, 6, color.ink); arc(x, y, 14, 0, TAU * run, accent, .75, .8);
          arc(side * 92 + center, y, 184, start, start + TAU * intersection, accent, .38, .9);
          type(side < 0 ? 'CONTEXT' : 'INFERENCE', x, y + 65, 12, color.soft, smooth(section(progress, .49, .77)), 2, 'center');
          type(side < 0 ? 'a' : 'b', x, y - 37, 24, color.ink, run, 0, 'center', true);
          interlace(x, y, 57, section(progress, .19, .88), .80, side * Math.PI / 8);
          radiantSeal(x, y - 123, 49, section(progress, .08, .90), .82);
        }
        const frame = smooth(section(progress, .50, .78));
        polygon([[center - 47, y - 47], [center + 47, y - 47], [center + 47, y + 47], [center - 47, y + 47]], color.paper, frame);
        emblem(center, y, .43, section(progress, .46, .80), color.ink);
        line(center - 43, y + 90, center + 43, y + 90, accent, frame * .85, 1);
      });
    }
    function identityScene() {
      const box = identityBox || { left: -W * .24, right: W * .24, top: atY(.43), bottom: atY(.72), rows: [] };
      const x = (box.left + box.right) / 2, half = Math.min(W * .39, (box.right - box.left) / 2 + 68);
      const spring = box.top + 55, base = box.bottom + 28;
      outside([box], () => {
        floralMargins(2);
        page('III', .055);
        const construction = smooth(section(progress, 0, .27));
        for (const side of [-1, 1]) {
          arc(x + side * half, spring, 2 * half, Math.PI * 1.05, Math.PI * 1.05 + Math.PI * .90 * construction, color.line, .30, .8);
          dot(x + side * half, spring, 3, accent, construction);
        }
        line(x - half * 1.5, spring, x + half * 1.5, spring, color.line, construction * .36, .8);
        line(x, spring - ROOT3 * half - 32, x, base + 12, color.line, construction * .36, .8);
        for (let inset = 0; inset < 3; inset++) {
          pointedArch(x, spring, half + inset * 14, base, section(progress, .19 + inset * .04, .70 + inset * .035),
            inset === 1 ? .88 : .45, inset === 1 ? 2.3 : .8, inset === 1 ? accent : color.line);
        }
        const locked = smooth(section(progress, .57, .81));
        const capitalY = Math.max(spring - 8, headingBox.bottom + 67);
        const columnTop = Math.max(spring, capitalY + 50);
        for (const side of [-1, 1]) {
          const column = x + side * (half + 42);
          rect(column - 4, columnTop, 8, Math.max(0, base - columnTop) * locked, color.ink, .94);
          line(column - 12, base, column + 12, base, color.ink, locked, 2);
          if (wide) type(side < 0 ? 'IDENTITY' : 'CLEARANCE', column + side * 35, (box.top + box.bottom) / 2,
            10, color.soft, locked, 2, side < 0 ? 'right' : 'left');
          radiantSeal(column, capitalY, 45, section(progress, .18, .90), .88);
          diamond(column, base + 24, 12, accent, locked, false);
        }
        interlace(x, spring - ROOT3 * half + 55, 65, section(progress, .08, .84), .80, Math.PI / 8);
      });
      rowRegistration(identityBox);
    }
    function archiveRoutes(box, complete) {
      for (const [side, count] of [[-1, skillCount], [1, pluginCount]]) {
        const edge = side < 0 ? box.left : box.right;
        const rail = edge + side * Math.min(33, Math.max(12, (W / 2 - Math.abs(edge)) * .38));
        const q = smooth(section(bookOpen, .30, .76));
        trace([[edge, box.top - 11], [rail, box.top - 32], [rail, box.bottom + 24], [edge, box.bottom + 10]],
          q, accent, complete ? .86 : .55, complete ? 1.8 : 1);
        // One branch per actual discovered item, capped visually; no fake count.
        for (let index = 0; index < Math.min(10, count); index++) {
          const y = lerp(box.top + 37, box.bottom - 27, (index + .5) / Math.min(10, count));
          const reveal = reduced ? 1 : smooth(section(bookOpen, .45 + index * .009, .76 + index * .012));
          line(rail, y, rail + side * 12 * reveal, y, accent, .8, .9);
          diamond(rail + side * 12, y, 2.5, accent, reveal, complete);
        }
        if (inventory.status === 'loading' && !reduced) {
          const y = lerp(box.top + 25, box.bottom - 25, fract(ambient * .42 + (side < 0 ? 0 : .5)));
          line(rail, y - 18, rail, y + 18, accent, .9, 2.3);
          dot(rail, y, 3, color.ink, .85);
        }
      }
    }
    function folioGeometry(box) {
      // The DOM rectangles are padded typesetting areas. A manuscript contour
      // may bend around them, but neither text nor measured layout is skewed.
      const center = bookBox ? bookGutter : (box.left + box.right) / 2;
      const gap = Math.min(22, (box.right - box.left) * .025);
      const leaves = [
        bookLeft || { left: box.left, right: center - gap, top: box.top, bottom: box.bottom },
        bookRight || { left: center + gap, right: box.right, top: box.top, bottom: box.bottom },
      ];
      const top = Math.min(...leaves.map(leaf => leaf.top)), bottom = Math.max(...leaves.map(leaf => leaf.bottom));
      return { center, top, bottom, leaves };
    }
    function cubic(a, b, c, d, t) {
      const s = 1 - t;
      return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
    }
    function pageRim(folio, leaf, side, t, outset = 0) {
      const edge = (side < 0 ? leaf.left : leaf.right) + side * outset;
      const span = Math.abs(edge - folio.center), top = leaf.top - outset * .2;
      if (t < .22) return [edge, lerp(leaf.bottom - 16 + outset, top - 7, t / .22)];
      const q = section(t, .22, 1);
      return [cubic(edge, edge - side * span * .2, folio.center + side * span * .2, folio.center + side * 5, q),
        cubic(top - 7, top - 22, top - 22, top + 10, q)];
    }
    function folioConstruction(folio) {
      // These are the same three pointed arches, spring line, axis and sun
      // capitals as identityScene. Their points physically converge on the
      // binding, then become the rims, endbands and cover of this very book.
      // No retained bitmap, crossfade or opacity replacement owns this handoff.
      const source = sourceIdentity || { left: -W * .24, right: W * .24, top: atY(.43), bottom: atY(.72) };
      const head = sourceHeading || { bottom: Math.min(source.top, atY(.44)) };
      const x = (source.left + source.right) / 2;
      const half = Math.min(W * .39, (source.right - source.left) / 2 + 68);
      const spring = source.top + 55, base = source.bottom + 28;
      const capitalY = Math.max(spring - 8, head.bottom + 67), columnTop = Math.max(spring, capitalY + 50);
      const gather = smooth(section(bookAge, 0, .68));
      const spread = smooth(section(bookAge, .56, 1.65));
      const srcProgress = clamp(finite(state.bookSource?.progress, 1));
      const sourceConstruction = smooth(section(srcProgress, 0, .27));
      const sourceLocked = smooth(section(srcProgress, .57, .81));
      const sourceCapital = section(srcProgress, .18, .90);
      const phasePoint = (sourcePoint, bindingPoint, pagePoint) => [
        lerp(lerp(sourcePoint[0], bindingPoint[0], gather), pagePoint[0], spread),
        lerp(lerp(sourcePoint[1], bindingPoint[1], gather), pagePoint[1], spread),
      ];
      const movingHole = box => {
        if (!box || gather >= .999) return null;
        const cx = lerp((box.left + box.right) / 2, folio.center, gather);
        const cy = lerp((box.top + box.bottom) / 2, (folio.top + folio.bottom) / 2, gather);
        const scale = Math.pow(1 - gather, 2), hw = (box.right - box.left) * .5 * scale, hh = (box.bottom - box.top) * .5 * scale;
        return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
      };
      outside([movingHole(sourceIdentity)], () => {
        for (let inset = 0; inset < 3; inset++) {
          const radius = half + inset * 14;
          const sourceAmount = smooth(section(srcProgress, .19 + inset * .04, .70 + inset * .035));
          const curve = Math.min(1, sourceAmount * 1.5), legs = smooth(section(sourceAmount, .43, 1));
          for (let index = 0; index < 2; index++) {
            const side = index ? 1 : -1, leaf = folio.leaves[index], points = [];
            const bindingPoint = t => [folio.center + side * (4 + inset * 3), lerp(folio.bottom + 12, folio.top + 10, t)];
            const legPoints = [
              phasePoint([x + side * radius, lerp(spring, base, legs)], bindingPoint(0), pageRim(folio, leaf, side, 0, 3 + inset * 4)),
              phasePoint([x + side * radius, spring], bindingPoint(.22), pageRim(folio, leaf, side, .22, 3 + inset * 4)),
            ];
            trace(legPoints, 1, inset === 1 ? accent : color.line, inset === 1 ? .88 : .45, inset === 1 ? 2.3 : .8);
            // Fixed cardinality makes the entire arc-to-paper transformation
            // continuous even while the previous gate is still constructing.
            for (let point = 0; point <= 32; point++) {
              const q = point / 32, t = .22 + q * .78;
              // The right source arc grows from the apex towards its spring;
              // preserving that opposite direction matters for early skips.
              const a = (index ? 1 - curve + curve * q : q * curve) * Math.PI / 3;
              const start = [x + side * (2 * radius * Math.cos(a) - radius), spring - Math.sin(a) * radius * 2];
              points.push(phasePoint(start, bindingPoint(t), pageRim(folio, leaf, side, t, 3 + inset * 4)));
            }
            trace(points, 1, inset === 1 ? accent : color.line, inset === 1 ? .88 : .45, inset === 1 ? 2.3 : .8);
          }
        }
        // The two construction circles are resampled into the two long
        // stitched cords. Their ink survives at the finished centre seam.
        for (const side of [-1, 1]) {
          const points = [];
          for (let point = 0; point <= 40; point++) {
            const t = point / 40, a = Math.PI * (1.05 + .90 * t * sourceConstruction);
            const sourcePoint = [x + side * half + Math.cos(a) * half * 2, spring + Math.sin(a) * half * 2];
            const target = [folio.center + side * (3 + Math.sin(t * Math.PI * 10) * 2), lerp(folio.top + 10, folio.bottom + 12, t)];
            points.push(phasePoint(sourcePoint, target, target));
          }
          trace(points, 1, color.line, .30, .8);
        }
        const sourceLines = [
          [[x - half * 1.5, spring], [x + half * 1.5, spring]],
          [[x, spring - ROOT3 * half - 32], [x, base + 12]],
        ];
        sourceLines.forEach((points, index) => {
          const target = index ? [[folio.center, folio.top - 5], [folio.center, folio.bottom + 23]] :
            [[folio.center - 6, folio.top + 8], [folio.center + 6, folio.bottom + 13]];
          const ends = points.map((point, i) => phasePoint(point, target[i], target[i]));
          line(...ends[0], ...ends[1], index ? color.ink : color.line,
            index ? lerp(.36 * sourceConstruction, .88, gather) : lerp(.36 * sourceConstruction, .36, gather), index ? 1.2 : .8);
        });
        for (let index = 0; index < 2; index++) {
          const side = index ? 1 : -1, column = x + side * (half + 42), leaf = folio.leaves[index];
          const edge = index ? leaf.right : leaf.left;
          const columnBottom = lerp(columnTop, Math.max(columnTop, base), sourceLocked);
          const startCorners = [[column - 4, columnTop], [column + 4, columnTop], [column + 4, columnBottom], [column - 4, columnBottom]];
          const bindCorners = [[folio.center + side * 11 - 3, folio.top + 7], [folio.center + side * 11 + 3, folio.top + 7],
            [folio.center + side * 11 + 3, folio.bottom + 18], [folio.center + side * 11 - 3, folio.bottom + 18]];
          const coverCorners = [[edge + side * 7, leaf.top + 9], [edge + side * 13, leaf.top + 9],
            [edge + side * 13, leaf.bottom - 5], [edge + side * 7, leaf.bottom - 5]];
          polygon(startCorners.map((point, i) => phasePoint(point, bindCorners[i], coverCorners[i])), color.ink, .94);
          // Cardinal plates from the capitals become the endband stitches;
          // the remaining rays fan into small fore-edge engraved clasps.
          for (let ray = 0; ray < 24; ray++) {
            const a = ray * TAU / 24 - Math.PI / 2, inner = 45 * .46, outer = 45 * (ray % 3 ? .79 : 1);
            const broad = ray % 3 ? 2 : 5.2;
            const arrival = smooth(section(sourceCapital, .08 + ray % 6 * .024, .48 + ray % 6 * .032));
            const local = [[inner, -broad], [lerp(inner, outer, arrival), 0], [inner, broad], [inner * .9, 0]];
            const sourcePoints = local.map(([xx, yy]) => [column + xx * Math.cos(a) - yy * Math.sin(a), capitalY + xx * Math.sin(a) + yy * Math.cos(a)]);
            const atTop = ray < 12, knotY = (atTop ? folio.top : folio.bottom) + (atTop ? 1 : 16);
            const knotX = folio.center + side * (8 + ray % 12 * 1.4);
            const binding = [[knotX - 1, knotY - 3], [knotX + 1, knotY - 4], [knotX + 1, knotY + 3], [knotX - 1, knotY + 4]];
            const yy = lerp(leaf.top + 30, leaf.bottom - 34, (ray % 12) / 11);
            const final = ray % 3 === 0 ? binding : [[edge + side * 5, yy - 2], [edge + side * 10, yy], [edge + side * 5, yy + 2], [edge + side * 6, yy]];
            polygon(sourcePoints.map((point, i) => phasePoint(point, binding[i], final[i])), ray % 3 ? accent : color.ink, .88 * lerp(arrival, 1, gather));
          }
          // The capital centre itself docks as the head / tail ornament.
          const p = phasePoint([column, capitalY], [folio.center, index ? folio.bottom + 21 : folio.top - 7],
            [folio.center, index ? folio.bottom + 21 : folio.top - 7]);
          const centreInk = lerp(smooth(section(sourceCapital, .12, .66)), 1, gather);
          diamond(p[0], p[1], lerp(45 * .29, 6, gather), accent, .88 * centreInk, false);
          diamond(p[0], p[1], lerp(45 * .12, 2.5, gather), color.ink, .88 * centreInk);
        }
        const dockRadius = wide ? 14 : 12;
        // The interlace plates extend beyond its circular radius. Dock their
        // full silhouette below the caption, at the mouth of the binding.
        const dockY = Math.max(folio.top - 14, headingBox.bottom + dockRadius * .78 + 17 + 6 / unit);
        const crestX = lerp(x, folio.center, gather), crestY = lerp(spring - ROOT3 * half + 55, dockY, gather);
        interlace(crestX, crestY, lerp(65, dockRadius, gather), lerp(section(srcProgress, .08, .84), 1, gather), .80, Math.PI / 8);
      }, 0);
    }
    function paperContour(folio, leaf, side, open, offset = 0, cover = false) {
      const center = folio.center, edge = (side < 0 ? leaf.left : leaf.right) + side * offset;
      const span = Math.abs(edge - center), xx = value => center + (value - center) * open;
      const top = leaf.top + (cover ? 5 : offset * .35), bottom = leaf.bottom + offset;
      const cut = cover ? 9 : 16;
      ctx.beginPath(); ctx.moveTo(xx(center + side * 5), top + 10);
      ctx.bezierCurveTo(xx(center + side * span * .20), top - 22, xx(edge - side * span * .20), top - 22, xx(edge), top - 7);
      ctx.lineTo(xx(edge), bottom - cut);
      ctx.lineTo(xx(edge - side * cut), bottom + 2);
      ctx.bezierCurveTo(xx(edge - side * span * .30), bottom - 8, xx(center + side * span * .13), bottom - 8,
        xx(center + side * 5), bottom + 12);
      // The shallow concave inner contour is a binding gutter, not a dark
      // gradient. Its negative paper channel keeps the entire spread flat.
      ctx.bezierCurveTo(xx(center + side * 14), lerp(bottom, top, .33), xx(center + side * 14), lerp(bottom, top, .70),
        xx(center + side * 5), top + 10);
      ctx.closePath();
    }
    function codexCovers(folio) {
      for (let index = 0; index < folio.leaves.length; index++) {
        const leaf = folio.leaves[index], side = index ? 1 : -1;
        const cover = smooth(section(bookAge, .48 + index * .045, 1.08 + index * .045));
        if (cover > 0) {
          paperContour(folio, leaf, side, cover, 16, true);
          ctx.fillStyle = coverInk; ctx.fill(); ctx.strokeStyle = coverInk; ctx.lineWidth = 1.4; ctx.stroke();
        }
      }
    }
    function pageWriting(leaf, index) {
      const source = state.layout?.book?.[index ? 'right' : 'left'];
      const heading = measured(source?.heading), list = measured(source?.list);
      // The scroll viewport often fills most of the leaf even when it holds a
      // single real row. Only the occupied portion is reserved for writing;
      // an overflowing list is reported by the host as completely occupied.
      const end = list && Number.isFinite(source?.occupiedBottom) ?
        clamp((source.occupiedBottom - height / 2) / unit, list.top, list.bottom) : list?.bottom;
      const occupied = list && end > list.top ? { ...list, bottom: end } : null;
      const footer = Number.isFinite(source?.footerY) ? (source.footerY - height / 2) / unit : leaf.bottom;
      return { heading, list, occupied, end, footer };
    }
    function manuscriptSeal(x, y, radius, index, amount) {
      if (amount <= 0) return;
      const ring = smooth(section(amount, 0, .40));
      const figure = smooth(section(amount, .16, .76));
      const lock = smooth(section(amount, .61, 1));
      // Split rings are engraved in four strokes. The page-specific figures
      // are composed inside them, never pasted in as an opacity transition.
      for (let quarter = 0; quarter < 4; quarter++) {
        const a = quarter * TAU / 4 - Math.PI / 2 + .06;
        arc(x, y, radius, a, a + (Math.PI / 2 - .12) * ring, color.ink, .67, 1.05 / unit);
        arc(x, y, radius * .92, a, a + (Math.PI / 2 - .12) * ring, accent, .74, .65 / unit);
      }
      if (index === 0) {
        // Six equal circles form a rose window. The central rosette remains
        // architectural, leaving the single large iris as the floral mark.
        for (let petal = 0; petal < 6; petal++) {
          const a = petal * TAU / 6 - Math.PI / 2;
          const q = smooth(section(amount, .16 + petal * .027, .62 + petal * .032));
          const cx = x + Math.cos(a) * radius * .33, cy = y + Math.sin(a) * radius * .33;
          arc(cx, cy, radius * .33, a + Math.PI, a + Math.PI + TAU * q, accent, .76, .9 / unit);
          trace([[x + Math.cos(a) * radius * .70, y + Math.sin(a) * radius * .70],
            [x + Math.cos(a) * radius * .83, y + Math.sin(a) * radius * .83]], figure, color.ink, .75, 1.05 / unit);
        }
        arc(x, y, radius * .68, -Math.PI / 2, -Math.PI / 2 + TAU * figure, color.line, .92, .65 / unit);
        trace([[x - radius * .16, y], [x + radius * .16, y]], lock, color.ink, .86, 1.35 / unit);
        trace([[x, y - radius * .16], [x, y + radius * .16]], lock, color.ink, .86, 1.35 / unit);
      } else {
        // The facing leaf uses an eight-point woven compass surrounding an
        // almond intersection. Its silhouette deliberately differs from I.
        for (let weave = 0; weave < 2; weave++) {
          const points = Array.from({ length: 5 }, (_, point) => {
            const a = point * TAU / 4 + weave * Math.PI / 4;
            return [x + Math.cos(a) * radius * .76, y + Math.sin(a) * radius * .76];
          });
          trace(points, smooth(section(amount, .15 + weave * .10, .61 + weave * .12)),
            weave ? color.ink : accent, weave ? .72 : .83, (weave ? 1.25 : .85) / unit);
        }
        const lens = smooth(section(amount, .32, .86)), r = radius * .43;
        arc(x - r / 2, y, r, -Math.PI / 3, -Math.PI / 3 + Math.PI * 2 / 3 * lens, accent, .85, 1 / unit);
        arc(x + r / 2, y, r, Math.PI * 2 / 3, Math.PI * 2 / 3 + Math.PI * 2 / 3 * lens, accent, .85, 1 / unit);
        trace([[x, y - radius * .53], [x, y + radius * .53]], lock, color.ink, .59, .7 / unit);
      }
      for (let point = 0; point < 8; point++) {
        const a = point * TAU / 8 - Math.PI / 2;
        const r = radius * (point % 2 ? 1 : 1.035);
        const q = smooth(section(amount, .53 + point * .02, .84 + point * .02));
        const xx = x + Math.cos(a) * r, yy = y + Math.sin(a) * r;
        const size = radius * (point % 2 ? .021 : .038) * q;
        if (size > 0) diamond(xx, yy, size, point % 2 ? accent : color.ink, .85);
      }
      diamond(x, y, radius * .058 * lock, accent, .9, false);
      // A pair of short colophon rules gives the circular mark a manuscript
      // baseline while keeping every part within its measured free rectangle.
      for (const side of [-1, 1]) {
        trace([[x + side * radius * .27, y + radius * 1.17],
          [x + side * radius * .71, y + radius * 1.17]], lock, accent, .78, .7 / unit);
      }
      diamond(x, y + radius * 1.17, radius * .028 * lock, color.ink, .78);
    }
    function folioIllumination(folio, leaf, index) {
      const writing = pageWriting(leaf, index), side = index ? 1 : -1;
      const widthPx = (leaf.right - leaf.left) * unit;
      const edge = index ? leaf.right : leaf.left, center = (leaf.left + leaf.right) / 2;
      const delay = index * .045;
      const border = smooth(section(bookAge, 1.15 + delay, 1.65 + delay));
      const header = smooth(section(bookAge, 1.45 + delay, 1.95 + delay));
      const seal = smooth(section(bookAge, 1.65 + delay, 2.45 + delay));
      if (border <= 0) return;
      // All illumination shares two hard, independently clipped writing
      // exclusions. Overlapping rectangles must never cancel each other out.
      outside([writing.heading, writing.occupied], () => {
        const railInset = (widthPx < 220 ? 3.5 : 12) / unit;
        const railWidth = (widthPx < 220 ? 2 : 6) / unit;
        const railX = edge - side * railInset;
        const railTop = leaf.top + 30 / unit, railBottom = leaf.bottom - 31 / unit;
        if (railBottom > railTop) {
          trace([[railX, railTop], [railX, railBottom]], border, accent, .77, .65 / unit);
          const knotCount = Math.max(2, Math.min(7, Math.floor((railBottom - railTop) * unit / 34)));
          for (let knot = 0; knot < knotCount; knot++) {
            const yy = lerp(railTop + 9 / unit, railBottom - 9 / unit, (knot + .5) / knotCount);
            const q = smooth(section(bookAge, 1.19 + knot * .035 + delay, 1.55 + knot * .035 + delay));
            const span = 7 / unit;
            trace([[railX, yy - span], [railX - side * railWidth, yy],
              [railX, yy + span], [railX + side * railWidth, yy], [railX, yy - span]],
              q, knot % 2 ? color.ink : accent, .79, .75 / unit);
            trace([[railX - side * railWidth, yy - span * 1.25], [railX + side * railWidth, yy - span * .55]],
              q, color.line, .84, .65 / unit);
          }
        }
        // Running heads use only the measured top padding. At compact and
        // short viewports there may only be room for an engraved headpiece.
        const headRoom = writing.heading ? (writing.heading.top - leaf.top) * unit : 0;
        if (headRoom >= 28 && widthPx >= 210 && header > 0) {
          const y = leaf.top + Math.min(21, headRoom - 13) / unit;
          const extent = Math.min(widthPx * .35, 154) / unit;
          const labelHalf = 45 / unit;
          for (const direction of [-1, 1]) {
            trace([[center + direction * labelHalf, y], [center + direction * extent, y]],
              header, accent, .72, .7 / unit);
            const xx = center + direction * (extent + 4 / unit);
            trace([[xx - 3 / unit, y + 3 / unit], [xx, y - 3 / unit], [xx + 3 / unit, y + 3 / unit]],
              header, color.ink, .85, .8 / unit);
          }
          ctx.save(); ctx.beginPath();
          ctx.rect(center - labelHalf, y - 6 / unit, labelHalf * 2 * header, 12 / unit); ctx.clip();
          type(index ? 'CONCORD / II' : 'CONCORD / I', center, y, 7.7 / unit, color.soft, .93,
            .95 / unit, 'center', true); ctx.restore();
        } else if (headRoom >= 18 && header > 0) {
          const yy = leaf.top + 6 / unit, extent = Math.min(21, widthPx * .13) / unit;
          for (const direction of [-1, 1]) {
            trace([[center, yy], [center + direction * extent, yy]], header, accent, .75, .7 / unit);
          }
          trace([[center - 3 / unit, yy], [center, yy - 3 / unit], [center + 3 / unit, yy],
            [center, yy + 3 / unit], [center - 3 / unit, yy]], header, color.ink, .85, .8 / unit);
        }
        if (!writing.heading || !writing.list || !Number.isFinite(writing.end) || seal <= 0) return;
        const blankTop = Math.max(writing.end, writing.heading.bottom) + 14 / unit;
        const blankBottom = Math.min(writing.footer - 10 / unit, leaf.bottom - 30 / unit);
        const blankLeft = Math.max(leaf.left + 25 / unit, writing.list.left);
        const blankRight = Math.min(leaf.right - 25 / unit, writing.list.right);
        // Never reserve space away from data: a long inventory gets the full
        // page. The seal simply vanishes when there is no genuine lower gap.
        const radius = Math.min(78 / unit, (blankRight - blankLeft) * .34, (blankBottom - blankTop) / 2.22);
        if (radius * unit < 23) return;
        const sealX = (blankLeft + blankRight) / 2;
        const sealY = (blankTop + blankBottom - radius * .17) / 2;
        manuscriptSeal(sealX, sealY, radius, index, seal);
      }, 6 / unit);
    }
    function codexLeaves(folio) {
      const { center, top, bottom, leaves } = folio;
      for (let index = 0; index < leaves.length; index++) {
        const leaf = leaves[index], side = index ? 1 : -1;
        const edge = index ? leaf.right : leaf.left;
        // Covers lead, then three distinct sheets follow the same binding on
        // delayed trajectories. No page is a clipping reveal of a rectangle.
        for (let sheet = 0; sheet < 3; sheet++) {
          const opening = smooth(section(bookAge, .72 + sheet * .13 + index * .035, 1.38 + sheet * .17 + index * .035));
          if (opening <= 0) continue;
          paperContour(folio, leaf, side, opening, (2 - sheet) * 4);
          ctx.fillStyle = sheet === 2 ? color.white : sheet ? color.paper : color.faint;
          ctx.fill(); ctx.strokeStyle = sheet === 2 ? color.ink : color.line; ctx.lineWidth = sheet === 2 ? 1.05 : .8; ctx.stroke();
        }
        const opening = smooth(section(bookAge, .98 + index * .035, 1.72 + index * .035));
        if (opening <= 0) continue;
        ctx.save(); paperContour(folio, leaf, side, opening); ctx.clip();
        const margin = Math.min(18, (leaf.right - leaf.left) * .065);
        // Rules are drawn by moving their endpoints outward from the spine,
        // preserving a common motion language with the arches they came from.
        const inkLeft = lerp(center, leaf.left + margin, opening), inkRight = lerp(center, leaf.right - margin, opening);
        line(inkLeft, leaf.top + 12, inkRight, leaf.top + 12, accent, .73, .7);
        line(inkLeft, leaf.bottom - 10, inkRight, leaf.bottom - 10, color.line, .84, .7);
        for (const yy of [leaf.top + 12, leaf.bottom - 10]) {
          diamond(inkLeft, yy, 2.5, accent, .85);
          diamond(inkRight, yy, 2.5, accent, .85);
        }
        const foreEdge = lerp(center, edge - side * 5, opening);
        line(foreEdge, leaf.top + 22, foreEdge, leaf.bottom - 24, color.line, .66, .7);
        for (let etch = 0; etch < 9; etch++) {
          const yy = leaf.bottom - 24 - etch * 6;
          const movingEdge = lerp(center, edge, opening);
          line(movingEdge, yy, movingEdge - side * 3.5, yy - 2, accent, .62, .65);
        }
        folioIllumination(folio, leaf, index);
        ctx.restore();
        type(index ? 'II' : 'I', (leaf.left + leaf.right) / 2, leaf.bottom + 27,
          12, color.ink, bookOpen, 1.5, 'center', true);
      }
      const ribbon = smooth(section(bookAge, 1.05, 1.95));
      if (ribbon > 0) {
        // A single cut ribbon drops through the real gutter; it is never laid
        // over the skill or plugin columns. The forked tail stays planar.
        const end = lerp(top + 12, bottom + 43, ribbon), left = center - 6, right = center + 6;
        polygon([[left, top + 12], [right, top + 12], [right, end], [center, end - 7], [left, end]], accent, .94);
        line(center, top + 14, center, end - 12, color.paper, .60, .8);
      }
      return folio;
    }
    function archiveScene(complete = false) {
      const box = bookBox || inventoryBox || { left: -W * .37, right: W * .37, top: atY(.38), bottom: atY(.80) };
      const exclusion = inventoryBox || box;
      const folio = folioGeometry(box);
      outside([exclusion], () => {
        // The open folio is carried intact from discovery into registration.
        // Both phases share the same locations and the persistent book clock.
        floralMargins(3, 1);
        page('IV', .045);
        const crestX = bookBox ? bookGutter : (box.left + box.right) / 2;
        const railWidth = Math.min(W * .24, 280);
        // A running braid belongs in the space between caption and paper,
        // never across a title baseline. Compact stages omit this pair when
        // the measured gap cannot hold the full 26-unit engraved silhouette.
        const braidTop = headingBox.bottom + 8 / unit + 13;
        const braidBottom = folio.top - 38;
        if (braidBottom >= braidTop) {
          const braidY = (braidTop + braidBottom) / 2;
          for (const side of [-1, 1]) {
            const left = side < 0 ? crestX - railWidth - 114 : crestX + 114;
            braid(left, braidY, railWidth, bookBuild, .74);
          }
        }
        archiveRoutes(exclusion, complete);
      });
      // The source ink lands on the unfolding cover, then the paper travels
      // over its interior. Endbands and the outer engraved rims stay visible.
      codexCovers(folio);
      folioConstruction(folio);
      codexLeaves(folio);
      if (complete) {
        const arrival = reduced ? 1 : smooth(section(progress, .12, .75));
        const stampX = folio.leaves[1].right - 27, stampY = folio.bottom + 30;
        diamond(stampX, stampY, 11, accent, arrival, false);
        if (inventory.status === 'complete' && issues.length === 0) {
          trace([[stampX - 5, stampY], [stampX - 1, stampY + 4], [stampX + 6, stampY - 5]],
            arrival, accent, .92, 1.45);
        } else {
          line(stampX, stampY - 4, stampX, stampY + 1, accent, arrival, 1.25);
          dot(stampX, stampY + 5, 1.2, accent, arrival);
        }
        const caption = inventory.status === 'complete' ? issues.length ? 'ARCHIVE / CHECK ISSUES' : 'ARCHIVE / LOCAL' : 'ARCHIVE / NOT READ';
        type(caption, box.left, folio.bottom + 47, 9, issues.length ? accent : color.soft, arrival * .85, 1.2);
      }
    }
    function readyScene() {
      floralMargins(5);
      page('VI', .062);
      const x = wide ? -W * .26 + parallax.x * .3 : parallax.x * .3;
      const y = (wide ? atY(.45) : atY(.355)) + parallax.y * .3, radius = wide ? 171 : 172;
      ctx.save(); ctx.translate(x, y); ctx.rotate(gesture * .45);
      interlace(0, 0, radius * 1.13, section(progress, .07, .85), .80, Math.PI / 8);
      rose(0, 0, radius * 1.02, section(progress, .17, .91), .64);
      vesica(0, 0, radius, progress, .70); ctx.restore();
      emblem(x, y, 1.02, section(progress, .27, .70), color.ink);
      const reveal = smooth(section(progress, .45, .79)), tx = wide ? -W * .042 : 0, ty = wide ? atY(.435) : atY(.61);
      type('READY', tx, ty, wide ? 140 : 102, color.ink, reveal, -5, wide ? 'left' : 'center', true);
      type('DEEPSEEK HARNESS', tx, ty - (wide ? 113 : 89), 11, accent, reveal, 3.1, wide ? 'left' : 'center');
      const start = wide ? tx : -190;
      line(start, ty + 93, start + (wide ? 423 : 380) * reveal, ty + 93, accent, .82, 1.1);
      type(identity, tx, ty + 132, 20, color.ink, reveal, 2.4, wide ? 'left' : 'center');
      if (wide) type('DSH / CONCORD', tx, ty + 174, 10, color.soft, reveal, 2.7);
      braid(x - radius * .85, y + radius * 1.53, radius * 1.70, section(progress, .30, .95), .88);
    }
    function interaction() {
      if (reduced || impulse <= .001) return;
      const x = (nx - .5) * W, y = (ny - .5) * H, age = 1 - impulse, r = 18 + smooth(age) * 145;
      for (const side of [-1, 1]) arc(x + side * r / 2, y, r, -Math.PI / 2,
        -Math.PI / 2 + TAU * Math.min(1, age * 2 + .2), accent, impulse * .6, 1.1);
      for (const side of [-1, 1]) diamond(x, y + side * ROOT3 * r / 2, 3, color.ink, impulse * .6, false);
    }

    ctx.save();
    try {
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.setLineDash([]);
      ctx.fillStyle = color.paper; ctx.fillRect(0, 0, width, height);
      ctx.translate(width / 2, height / 2); ctx.scale(unit, unit);
      [sealScene, linkScene, identityScene, () => archiveScene(false), () => archiveScene(true), readyScene][phase]();
      const exclusion = phase === 2 ? [identityBox] : phase === 3 || phase === 4 ? [inventoryBox] : [];
      outside(exclusion, interaction);
    } finally { ctx.restore(); }
  }
  window.DSHLateranoVisuals = Object.freeze({ draw, phaseCount: 6, name: 'CONCORD' });
})();

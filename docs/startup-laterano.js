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
    const reduced = !!state.reducedMotion, resting = reduced || !!state.waiting;
    const progress = resting ? 1 : clamp(finite(state.progress));
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
    // Measured cards and headings are authoritative. The secondary corridor is
    // only a fallback for standalone renderers without DOM measurements.
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
        const open = q(side < 0 ? 1 : 2);
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
    function patternedPanel(x, y, panelWidth, panelHeight, amount = 1, reverse = false) {
      const open = resting ? 1 : ease(section(amount, .20, .62));
      if (open <= 0) return;
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath(); ctx.rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight * open); ctx.clip();
      rect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, color.ink, .94);
      const rows = 4, step = panelHeight / rows, radius = Math.min(panelWidth * .25, step * .34);
      for (let row = 0; row < rows; row++) {
        const cy = -panelHeight / 2 + step * (row + .5);
        quatrefoil(0, cy, radius, section(amount, .21 + row * .045, .75 + row * .04), color.paper, .9, true, reverse ? Math.PI / 4 : 0);
        if (row < rows - 1) diamond(0, cy + step / 2, 2.5, color.paper, .65);
      }
      line(-panelWidth / 2 + 5, -panelHeight / 2, -panelWidth / 2 + 5, panelHeight / 2, color.paper, .65, .8);
      line(panelWidth / 2 - 5, -panelHeight / 2, panelWidth / 2 - 5, panelHeight / 2, color.paper, .65, .8);
      ctx.restore();
    }
    function floralMargins(variant = 0) {
      // Cropped botanical anchors carry black mass. Their repeatable cutwork
      // is reused as gate capitals and page edges, not unrelated decorations.
      const swap = variant % 2 === 1, offset = variant === 5 ? .045 : 0;
      const leftX = -W * (wide ? .493 : .58), rightX = W * (wide ? .478 : .58);
      iris(leftX, atY(swap ? .31 : .65), wide ? 2.05 : 1.72, progress, color.ink, .92, swap ? Math.PI : -.12);
      iris(rightX, atY(swap ? .68 : .235) + offset * H, wide ? 1.80 : 1.67, section(progress, .06, .90), color.ink, .94, swap ? .12 : Math.PI);
      if (wide) {
        const panelSide = swap ? -1 : 1;
        patternedPanel(panelSide * W * .438, atY(swap ? .68 : .64), 82, 212,
          section(progress, .10, .94), swap);
        // The upper-left rosette starts below the masthead's brand metadata.
        interlace(-panelSide * W * .421, atY(swap ? .69 : .365), 99,
          section(progress, .04, .90), .64, Math.PI / 8);
      } else {
        for (const side of [-1, 1]) quatrefoil(side * W * .435, atY(.765), 31,
          section(progress, .25, .95), accent, .75, true);
      }
    }
    function knife(amount, left = true, strength = 1) {
      if (resting || amount <= 0 || amount >= 1) return;
      // One decisive black cut between construction and ink, then a long hold.
      const q = ease(amount), side = left ? 1 : -1;
      const x = side * lerp(-W * .78, W * .78, q), thickness = 48 * Math.sin(Math.PI * amount);
      ctx.save(); ctx.transform(1, 0, -.40, 1, 0, 0);
      rect(x - thickness / 2, -H * .6, thickness, H * 1.2, color.ink, strength);
      rect(x + thickness / 2 + 7, -H * .6, 2, H * 1.2, accent, strength * .8);
      ctx.restore();
    }
    function doorPlanes(box, amount) {
      const open = ease(section(amount, .48, .78)), alpha = resting ? 0 : 1 - smooth(section(amount, .65, .82));
      if (alpha <= 0) return;
      for (const side of [-1, 1]) {
        const hinge = (side < 0 ? box.left : box.right) + side * open * W * .48, outer = side * W * .68;
        polygon([[hinge, box.top - 160], [outer, box.top - 330], [outer, box.bottom + 130], [hinge, box.bottom + 45]], color.ink, alpha * .91);
        line(hinge, box.top - 160, hinge, box.bottom + 45, accent, alpha, 4);
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
      knife(section(progress, .38, .54), true, .84);
    }
    function linkScene() {
      outside([headingBox], () => {
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
          iris(x, y - 120, .46, section(progress, .08, .90), color.ink, .87);
        }
        const frame = smooth(section(progress, .50, .78));
        polygon([[center - 47, y - 47], [center + 47, y - 47], [center + 47, y + 47], [center - 47, y + 47]], color.paper, frame);
        emblem(center, y, .43, section(progress, .46, .80), color.ink);
        line(center - 43, y + 90, center + 43, y + 90, accent, frame * .85, 1);
        knife(section(progress, .39, .52), false, .70);
      });
    }
    function identityScene() {
      const box = identityBox || { left: -W * .24, right: W * .24, top: atY(.43), bottom: atY(.72), rows: [] };
      const x = (box.left + box.right) / 2, half = Math.min(W * .39, (box.right - box.left) / 2 + 68);
      const spring = box.top + 55, base = box.bottom + 28;
      outside([box, headingBox], () => {
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
        const capitalScale = .60;
        const capitalY = Math.max(spring - 79, headingBox.bottom + 14 + 95 * capitalScale + 8);
        const columnTop = Math.max(spring, capitalY + 114 * capitalScale + 7);
        for (const side of [-1, 1]) {
          const column = x + side * (half + 42);
          rect(column - 4, columnTop, 8, Math.max(0, base - columnTop) * locked, color.ink, .94);
          line(column - 12, base, column + 12, base, color.ink, locked, 2);
          if (wide) type(side < 0 ? 'IDENTITY' : 'CLEARANCE', column + side * 35, (box.top + box.bottom) / 2,
            10, color.soft, locked, 2, side < 0 ? 'right' : 'left');
          iris(column, capitalY, capitalScale, section(progress, .18, .90), color.ink, .94);
          quatrefoil(column, base + 29, 24, section(progress, .32, .92), accent, .92, true);
        }
        interlace(x, spring - ROOT3 * half + 55, 65, section(progress, .08, .84), .80, Math.PI / 8);
        doorPlanes(box, progress);
      });
      rowRegistration(identityBox);
    }
    function archiveRoutes(box, complete) {
      for (const [side, count] of [[-1, skillCount], [1, pluginCount]]) {
        const edge = side < 0 ? box.left : box.right;
        const rail = edge + side * Math.min(33, Math.max(12, (W / 2 - Math.abs(edge)) * .38));
        const q = smooth(section(progress, .30, .76));
        trace([[edge, box.top - 11], [rail, box.top - 32], [rail, box.bottom + 24], [edge, box.bottom + 10]],
          q, accent, complete ? .86 : .55, complete ? 1.8 : 1);
        // One branch per actual discovered item, capped visually; no fake count.
        for (let index = 0; index < Math.min(10, count); index++) {
          const y = lerp(box.top + 37, box.bottom - 27, (index + .5) / Math.min(10, count));
          const reveal = resting ? 1 : smooth(section(progress, .45 + index * .009, .76 + index * .012));
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
    function archiveScene(complete = false) {
      const box = inventoryBox || { left: -W * .37, right: W * .37, top: atY(.38), bottom: atY(.80) };
      outside([box, headingBox], () => {
        floralMargins(complete ? 4 : 3);
        page(complete ? 'V' : 'IV', .067);
        const radius = Math.min(W * .33, 350), roseY = Math.min(atY(.25), box.top - 48);
        rose(0, roseY, radius, progress, complete ? .57 : .31);
        interlace(0, roseY, radius * .79, section(progress, .13, .87), complete ? .56 : .38, Math.PI / 8);
        const bound = smooth(section(progress, .19, .55)), unfold = ease(section(progress, .44, .79));
        for (const side of [-1, 1]) {
          const edge = side < 0 ? box.left : box.right, drift = (1 - unfold) * side * W * .33;
          // The two leaves register against the real registry's outer bounds.
          const points = [[edge + drift, box.top - 17], [edge + side * 20 + drift, box.top - 34],
            [edge + side * 20 + drift, box.bottom + 27], [edge + drift, box.bottom + 11]];
          trace(points, bound, color.ink, .62, 1.2);
          trace(points.map(([x, y]) => [x + side * 6, y + 4]), bound, color.line, .46, .8);
          line(edge + drift, box.bottom + 11, side * 37, box.bottom + 11 + 16 * unfold, accent, unfold * .64, .8);
          if (complete) pointedArch(side * radius * .70, roseY + 36, 70, box.top - 25, section(progress, .31, .77), .42, .8, accent);
          iris(edge + side * 35, box.top - 84, .51, section(progress, .20, .91), color.ink, .92);
          for (let border = 0; border < 3; border++) {
            quatrefoil(edge + side * 55, lerp(box.top + 72, box.bottom - 30, border / 2), 14,
              section(progress, .32 + border * .035, .91), accent, .65, complete);
          }
        }
        archiveRoutes(box, complete);
        knife(section(progress, .40, .52), !complete, .58);
      });
      const settle = resting ? 1 : smooth(section(progress, .50, .81));
      for (const side of [-1, 1]) {
        const x = side < 0 ? box.left : box.right;
        for (const [y, direction] of [[box.top, -1], [box.bottom, 1]]) {
          line(x, y, x + side * 11 * settle, y + direction * 11 * settle, accent, .82, 1.4);
          diamond(x + side * 11, y + direction * 11, 2, accent, settle);
        }
      }
      if (complete) {
        const caption = inventory.status === 'complete' ? issues.length ? 'ARCHIVE / CHECK ISSUES' : 'ARCHIVE / LOCAL' : 'ARCHIVE / NOT READ';
        type(caption, box.left, box.bottom + 39, 9, issues.length ? accent : color.soft, .85, 1.2);
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
      for (const side of [-1, 1]) {
        iris(x + side * radius * .77, y + radius * .92, .64,
          section(progress, .30 + (side > 0 ? .07 : 0), .95), color.ink, .93, side * -.16);
      }
      knife(section(progress, .32, .48), false, .84);
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
      const exclusion = phase === 2 ? [identityBox, headingBox] : phase === 3 || phase === 4 ? [inventoryBox, headingBox] : phase === 1 ? [headingBox] : [];
      outside(exclusion, interaction);
    } finally { ctx.restore(); }
  }
  window.DSHLateranoVisuals = Object.freeze({ draw, phaseCount: 6, name: 'CONCORD' });
})();

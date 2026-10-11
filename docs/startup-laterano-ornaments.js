/* CONCORD / celestial leaves. Original flat vector ornamentation.
 * One set of sun, moon and star shapes moves from sky to binding to page edge.
 * The host owns the clock and measured writing; this module owns no UI state.
 */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
  const mix = (a, b, q) => a + (b - a) * q;
  const section = (x, a, b) => smooth((x - a) / (b - a));
  const validBox = box => box && [box.left, box.right, box.top, box.bottom].every(Number.isFinite);
  const starForms = new Map();
  function starForm(rays) {
    if (!starForms.has(rays)) starForms.set(rays, Array.from({ length: rays * 2 }, (_, n) => {
      const a = n * Math.PI / rays - Math.PI / 2, radius = n % 2 ? .24 : 1;
      return [Math.cos(a) * radius, Math.sin(a) * radius];
    }));
    return starForms.get(rays);
  }

  function draw(ctx, state) {
    const { width: W, height: H, unit, palette: c } = state;
    if (!ctx || ![W, H, unit].every(x => Number.isFinite(x) && x > 0) || !c) return;
    const phase = state.phase || 0, book = phase === 3 || phase === 4;
    const layer = state.layer || 'background';
    // Each physical symbol belongs to one pass; there is no opacity handoff.
    if (book !== (layer === 'foreground')) return;
    const reduced = !!state.reduced, css = px => px / unit;
    const progress = reduced ? 1 : clamp(state.progress || 0);
    const sourceProgress = Number.isFinite(state.sourceProgress) ? clamp(state.sourceProgress) : 1;
    const age = reduced ? 3 : Math.max(0, Number.isFinite(state.bookAge) ? state.bookAge : 3);
    const gather = book ? section(age, 0, .86) : 0;
    const ink = c.blue, white = c.pureWhite || '#ffffff';
    const currentAmbient = !reduced && Number.isFinite(state.ambient) ? Math.max(0, state.ambient) : 0;
    // Start with the clock of the last painted identity frame. Resume the one
    // continuous host clock smoothly; manual pause freezes both clocks there.
    const ambient = reduced ? 0 : book && Number.isFinite(state.sourceAmbient) ?
      mix(Math.max(0, state.sourceAmbient), currentAmbient, section(age, 0, .20)) : currentAmbient;

    // Reconstruct the source sky before projecting it uniformly, just as the
    // church does. A changed viewport must not stretch its old crescent or sun.
    const viewport = book && state.sourceViewport;
    const oldUnit = viewport?.width > 0 && viewport?.height > 0 ? Math.min(viewport.width, viewport.height) / 1000 : unit;
    const projection = viewport?.width > 0 && viewport?.height > 0 ?
      Math.min(W * unit / viewport.width, H * unit / viewport.height) * oldUnit / unit : 1;
    const sourceW = viewport?.width > 0 ? viewport.width / oldUnit : W;
    const sourceH = viewport?.height > 0 ? viewport.height / oldUnit : H;
    const wide = sourceW / sourceH > 1.24;
    const size = Math.min(1.05, Math.max(.62, sourceW / 1120), 1.45 / oldUnit) * projection;
    const SW = sourceW * projection, SH = sourceH * projection;
    const sourceArrival = index => reduced ? 1 : section(book ? sourceProgress : progress,
      .02 + index * .037, .53 + index * .046);
    const arrived = index => book ? mix(sourceArrival(index), 1, section(age, .04, .76)) : sourceArrival(index);
    const fallback = validBox(state.book) ? state.book : validBox(state.inventory) ? state.inventory :
      { left: -W * .36, right: W * .36, top: -H * .09, bottom: H * .34 };
    const folio = state.folio || { center: (fallback.left + fallback.right) / 2,
      top: fallback.top, bottom: fallback.bottom, leaves: [
        { ...fallback, right: (fallback.left + fallback.right) / 2 - css(8) },
        { ...fallback, left: (fallback.left + fallback.right) / 2 + css(8) },
      ] };
    const motionByOrder = [];

    function stroke(points, q = 1, color = c.line, alpha = .65, weight = 1) {
      if (q <= 0 || points.length < 2) return;
      ctx.beginPath(); ctx.moveTo(...points[0]);
      if (q >= 1) {
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
      } else {
        const spans = new Array(points.length - 1);
        let length = 0;
        for (let i = 0; i < spans.length; i++) {
          const span = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
          spans[i] = span; length += span;
        }
        let budget = length * q;
        for (let i = 0; i < spans.length && budget > 0; i++) {
          const part = Math.min(1, budget / Math.max(.00001, spans[i]));
          ctx.lineTo(mix(points[i][0], points[i + 1][0], part), mix(points[i][1], points[i + 1][1], part));
          budget -= spans[i];
        }
      }
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = Math.max(css(.5), weight); ctx.stroke();
    }
    function polygon(points, fill = white, outline = ink, alpha = 1, weight = .9) {
      if (!points.length) return;
      ctx.beginPath(); ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p)); ctx.closePath();
      ctx.globalAlpha = alpha;
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = Math.max(css(.55), weight); ctx.stroke(); }
    }
    function ring(x, y, radius, q = 1, color = c.line, alpha = .7, weight = .9, start = -Math.PI / 2, span = TAU) {
      if (q <= 0 || radius <= 0) return;
      ctx.beginPath(); ctx.arc(x, y, radius, start, start + span * clamp(q));
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = Math.max(css(.5), weight); ctx.stroke();
    }
    function star(x, y, radius, rays, q, angle = 0, solid = true) {
      if (q <= 0 || radius <= 0) return;
      const cosine = Math.cos(angle), sine = Math.sin(angle), scale = radius * q;
      const points = starForm(rays).map(([xx, yy]) =>
        [x + (xx * cosine - yy * sine) * scale, y + (xx * sine + yy * cosine) * scale]);
      polygon(points, solid ? white : null, ink, 1, .85);
    }
    function sun(x, y, radius, q, turn) {
      if (q <= 0) return;
      // Twelve white blades arrive in counter-rotating groups. Their faces are
      // opaque planar shapes, never gradients or a translucent duplicate seal.
      for (let n = 0; n < 12; n++) {
        const part = section(q, .04 + n % 4 * .045, .66 + n % 4 * .06);
        if (!part) continue;
        const orbit = ambient * (n % 2 ? -.19 : .24) * q;
        const a = n * TAU / 12 + turn + orbit + (n % 2 ? -1 : 1) * (1 - part) * .65;
        const r = radius * mix(2.05, .88, part), span = radius * (.11 + .07 * part);
        const radial = radius * .31;
        const dx = Math.cos(a), dy = Math.sin(a);
        polygon([[x + dx * (r - radial), y + dy * (r - radial)],
          [x + dx * r + dy * span, y + dy * r - dx * span],
          [x + dx * (r + radial), y + dy * (r + radial)],
          [x + dx * r - dy * span, y + dy * r + dx * span]],
        white, n % 3 ? c.line : ink, 1, n % 3 ? .8 : 1.15);
      }
      const center = section(q, .15, .72);
      if (center > 0) {
        ctx.beginPath(); ctx.arc(x, y, radius * .48 * center, 0, TAU);
        ctx.globalAlpha = 1; ctx.fillStyle = white; ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = Math.max(css(.55), 1.1); ctx.stroke();
      }
      ring(x, y, radius * 1.35, section(q, .20, .94), c.line, .72);
      star(x, y, radius * .25, 8, section(q, .36, 1), -turn * .55 - ambient * .045, false);
    }
    function moon(x, y, radius, q, turn) {
      if (q <= 0) return;
      const r = radius * mix(.54, 1, q);
      const sway = Math.sin(ambient * .43) * .105 * q;
      ctx.save(); ctx.translate(x, y); ctx.rotate(turn + sway);
      ctx.beginPath(); ctx.moveTo(r * .48, -r * .87);
      ctx.bezierCurveTo(-r * 1.38, -r * .90, -r * 1.38, r * .90, r * .48, r * .87);
      ctx.bezierCurveTo(-r * .48, r * .35, -r * .48, -r * .35, r * .48, -r * .87);
      ctx.closePath(); ctx.globalAlpha = 1; ctx.fillStyle = white; ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = Math.max(css(.6), 1.25); ctx.stroke();
      ring(0, 0, r * 1.38, section(q, .12, .94), c.line, .75);
      const orbit = (1 - q) * Math.PI * 1.45 + ambient * .78 * q;
      star(Math.cos(orbit) * r * .46, Math.sin(orbit) * r * .46, r * .33, 4, section(q, .16, .92), -turn - sway);
      ctx.restore();
    }
    function haloCross(x, y, radius, q) {
      const turn = ambient * .12;
      ring(x, y, radius * .48, q, ink, .52, .9, turn, Math.PI * .68);
      ring(x, y, radius * .48, q, ink, .52, .9, turn + Math.PI, Math.PI * .68);
      for (let n = 0; n < 4; n++) {
        const a = n * Math.PI / 2, dx = Math.cos(a), dy = Math.sin(a);
        stroke([[x + dx * radius * .15, y + dy * radius * .15], [x + dx * radius, y + dy * radius]], q, ink, .65);
        stroke([[x + dx * radius * .72 - dy * radius * .14, y + dy * radius * .72 + dx * radius * .14],
          [x + dx * radius * .72 + dy * radius * .14, y + dy * radius * .72 - dx * radius * .14]], q, ink, .65);
      }
    }
    function trefoil(x, y, radius, q) {
      const points = Array.from({ length: 49 }, (_, n) => {
        const a = n * TAU / 48 - Math.PI / 2, r = radius * (.74 + .24 * Math.cos((a + Math.PI / 2) * 3));
        return [x + Math.cos(a) * r, y + Math.sin(a) * r];
      });
      stroke(points, q, ink, .65);
      star(x, y, radius * .28, 3, q, -ambient * .15, true);
    }
    function avoidHeading(x, y, radius, side, head) {
      const gap = 14 / oldUnit * projection, margin = 10 / oldUnit * projection;
      if (!validBox(head) || x + radius < head.left - gap || x - radius > head.right + gap ||
          y + radius < head.top - gap || y - radius > head.bottom + gap) return [x, y];
      const shifted = side < 0 ? head.left - gap - radius : head.right + gap + radius;
      if (shifted - radius > -SW / 2 + margin && shifted + radius < SW / 2 - margin) return [shifted, y];
      const above = head.top - gap - radius;
      return [x, above - radius > -SH / 2 + margin ? above : y];
    }
    function edge(side, t, outset = 0) {
      const leaf = folio.leaves[side < 0 ? 0 : 1];
      return [side < 0 ? leaf.left - outset : leaf.right + outset,
        mix(leaf.top + css(9), leaf.bottom - css(9), clamp(t))];
    }
    function migrate(point, target, side, order = 0) {
      if (!book) return point;
      let motion = motionByOrder[order];
      if (!motion) {
        const delay = order * .013;
        const fold = reduced ? 1 : section(age, delay, .82 + delay);
        const open = reduced ? 1 : section(age, .65 + delay, 2.12 + delay);
        motion = motionByOrder[order] = { fold, open, arc: fold > 0 && fold < 1 ? Math.sin(fold * Math.PI) * (1 - open) : 0,
          offset: css(3 + order % 3 * 2),
          y: mix(folio.top + css(12), folio.bottom - css(12), .18 + order % 7 * .105) };
      }
      const { fold, open, arc } = motion;
      if (open >= 1) return target;
      if (fold <= 0) return point;
      let x = mix(mix(point[0], folio.center + side * motion.offset, fold), target[0], open);
      let y = mix(mix(point[1], motion.y, fold), target[1], open);
      if (arc === 0) return [x, y];
      const reach = Math.min(SW * .12, 148 * size, Math.max(0, W / 2 - css(9) - side * x));
      const lift = Math.min(SH * .09, 102 * size, Math.max(0, y + H / 2 - css(9)));
      x += side * reach * arc; y -= lift * arc;
      return [x, y];
    }
    function emblemPose(side, initialRadius, order) {
      const q = sourceArrival(order), r = initialRadius * size;
      const raw = side < 0 ? [-SW * (wide ? .305 : .325), -SH * .345] :
        [SW * (wide ? .305 : .335), wide ? -SH * .345 : SH * .257];
      const anchor = avoidHeading(...raw, r * 1.7, side, book ? state.sourceHeading || state.heading : state.heading);
      // Solar descent and lunar ascent are intentionally different entrances.
      // Avoidance is chosen from the settled pose, so crossing a title boundary
      // cannot suddenly change which side of the title an object occupies.
      const origin = [anchor[0] + Math.sin((1 - q) * Math.PI) * (side < 0 ? 42 : -31) * size,
        anchor[1] + (side < 0 ? -104 : 112) * (1 - q) * size];
      if (!book) return { point: origin, radius: r, turn: side * (1 - q) * .9 };
      const leaf = folio.leaves[side < 0 ? 0 : 1], outer = side < 0 ? leaf.left + W / 2 : W / 2 - leaf.right;
      // Fixed outside page clasps cannot jump when a new real list row arrives.
      // Interior space remains available for the registry's existing large seals.
      const finalRadius = Math.max(css(2), Math.min(css(17), outer / 2.30, (leaf.bottom - leaf.top) * .064));
      const target = edge(side, side < 0 ? .24 : .72, finalRadius * .62);
      const open = reduced ? 1 : section(age, .60 + order * .013, 2.14 + order * .013);
      const point = migrate(origin, target, side, order);
      const turn = mix(side * (1 - q) * .9, side * Math.PI * 1.15, gather) * (1 - open);
      return { point, radius: mix(r, finalRadius, open), turn };
    }
    function exclude(box, padding) {
      if (!validBox(box)) return;
      ctx.beginPath(); ctx.rect(-W / 2, -H / 2, W, H);
      ctx.rect(box.left - padding, box.top - padding, box.right - box.left + padding * 2, box.bottom - box.top + padding * 2);
      ctx.clip('evenodd');
    }

    ctx.save();
    try {
      exclude(state.heading, css(book ? 6 : 9));
      if (!book && phase === 2) exclude(state.identity, css(9));
      if (book) {
        // Paper is not one large exclusion: only the actual text is protected.
        // Separate clips retain protection when heading and body bounds overlap.
        for (const leaf of folio.leaves) {
          const writing = leaf.writing;
          if (!validBox(writing?.heading) || !validBox(writing?.list) || !Number.isFinite(writing?.end)) {
            // During an unmeasured layout, preserve the whole affected leaf.
            // Its external clasps remain visible without guessing at real text.
            exclude(leaf, css(6));
          } else {
            exclude(writing.heading, css(6));
            exclude(writing.occupied, css(6));
          }
        }
        if (validBox(state.sourceIdentity) && gather < 1) {
          const box = state.sourceIdentity, cx = mix((box.left + box.right) / 2, folio.center, gather);
          const cy = mix((box.top + box.bottom) / 2, (folio.top + folio.bottom) / 2, gather);
          const scale = (1 - gather) ** 2;
          exclude({ left: cx - (box.right - box.left) * scale / 2, right: cx + (box.right - box.left) * scale / 2,
            top: cy - (box.bottom - box.top) * scale / 2, bottom: cy + (box.bottom - box.top) * scale / 2 }, css(9) * (1 - gather));
        }
      }

      const solar = emblemPose(-1, wide ? 43 : 34, 0), lunar = emblemPose(1, wide ? 29 : 24, 2);
      sun(...solar.point, solar.radius, arrived(0), solar.turn);
      moon(...lunar.point, lunar.radius, arrived(2), lunar.turn);

      // Sampled vault lines become outer page rails. Their constituent points
      // first join the spine, then open outward with the architectural frame.
      const rx = SW * .385, ry = SH * .325, cy = -SH * .077;
      for (let band = 0; band < 2; band++) for (let bay = 0; bay < 8; bay++) {
        const side = bay < 4 ? -1 : 1, start = Math.PI + bay * Math.PI / 8 + .028;
        const end = Math.PI + (bay + 1) * Math.PI / 8 - .028;
        const q0 = sourceArrival(1 + bay % 3), q = arrived(1 + bay % 3);
        const points = Array.from({ length: 13 }, (_, n) => {
          const t = n / 12, a = mix(start, end, t) + (1 - q0) * (band ? -.24 : .24);
          const offset = (1 - q0) * (bay % 2 ? 32 : -32) * size;
          const origin = [Math.cos(a) * (rx + band * 9 * size), cy + Math.sin(a) * (ry + band * 9 * size) + offset];
          const lane = side < 0 ? 1 - (bay + t) / 4 : (bay - 4 + t) / 4;
          return migrate(origin, edge(side, lane, css(3 + band * 3)), side, bay % 4 + band);
        });
        stroke(points, q, band ? c.line : ink, band ? .65 : .42);
      }
      for (let n = 0; n < 11; n++) {
        const q0 = sourceArrival(3 + n % 3);
        const a = Math.PI + (n + .5) * Math.PI / 11 + (1 - q0) * (n % 2 ? -.40 : .32);
        const side = n < 5 ? -1 : 1, target = edge(side, side < 0 ? 1 - (n + .5) / 5.5 : (n - 5) / 5.5, css(4.5));
        const origin = [Math.cos(a) * (rx + (1 - q0) * 62 * size),
          cy + Math.sin(a) * (ry + (1 - q0) * 62 * size)];
        const p = migrate(origin, target, side, 4 + n % 4);
        const open = book ? section(age, .75, 2.25) : 0;
        star(...p, mix((n % 5 === 0 ? 10 : 4.6) * size, css(n % 5 === 0 ? 4 : 2.2), open),
          4, arrived(3 + n % 3), (1 - arrived(3 + n % 3)) * side * 1.25, n % 2 === 0);
      }

      for (const side of [-1, 1]) {
        const x = side * SW * (wide ? .315 : .325), y = SH * (wide ? .10 : .30), spread = (wide ? 82 : 42) * size;
        const nodes = [[x - side * spread, y - 80 * size], [x, y - 115 * size],
          [x + side * spread * .55, y - 25 * size], [x - side * spread * .25, y + 32 * size],
          [x + side * spread * .64, y + 91 * size]];
        const q0 = sourceArrival(4 + (side > 0 ? 1 : 0)), q = arrived(4 + (side > 0 ? 1 : 0));
        const points = nodes.map(([xx, yy], n) => {
          const order = side < 0 ? n : 4 - n;
          const node = section(q0, order * .08, .62 + order * .075);
          return migrate([xx + Math.sin((1 - node) * Math.PI) * side * 21 * size,
            yy + (side < 0 ? -100 : 105) * (1 - node) * size],
          edge(side, .10 + n * .195, css(8 + (n % 2) * 2)), side, 5 + n);
        });
        stroke(side < 0 ? points : points.slice().reverse(), q, c.line, .85, 1.05);
        points.forEach((p, n) => {
          const order = side < 0 ? n : 4 - n;
          const t = section(q, order * .08, .62 + order * .075);
          const small = book ? section(age, .72, 2.35) : 0;
          star(...p, mix((n % 2 ? 8 : 5) * size, css(2.5), small), n === 2 ? 8 : 4, t,
            side * (1 - t) * Math.PI * .7, n % 2 === 0);
          if (n === 1 || n === 3) ring(...p, mix(12 * size, css(4), small), t, c.line, .75);
        });
        // Two small couriers are purely ornamental: they follow the existing
        // star chains even when no inventory is loading and imply no progress.
        const courier = section(q, .78, 1);
        if (courier > 0) {
          const position = (.5 - Math.cos(ambient * .34 + (side < 0 ? 0 : Math.PI)) * .5) * (points.length - 1);
          const segment = Math.min(points.length - 2, Math.floor(position)), fraction = position - segment;
          const x = mix(points[segment][0], points[segment + 1][0], fraction);
          const y = mix(points[segment][1], points[segment + 1][1], fraction);
          const radius = mix(3 * size, css(1.65), book ? section(age, .72, 2.35) : 0) * courier;
          ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.globalAlpha = 1;
          ctx.fillStyle = white; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = css(.65); ctx.stroke();
        }
        if (wide) {
          const open = book ? section(age, .70, 2.30) : 0;
          const position = migrate([x, SH * .27], edge(side, side < 0 ? .84 : .12, css(5)), side, 6);
          const r = mix((side < 0 ? 22 : 25) * size, css(5), open);
          if (side < 0) haloCross(...position, r, arrived(6)); else trefoil(...position, r, arrived(6));
          for (let n = 0; n < 4; n++) {
            const point = migrate([x + (n - 1.5) * 23 * size, SH * .365],
              edge(side, .35 + n * .095, css(6)), side, 6 + n);
            star(...point, mix(9 * size, css(2.6), open), 4, arrived(6 + n % 2), Math.PI / 4, false);
          }
        }
      }

      // Three white pieces become the top register, fixed to the real spine.
      for (let n = 0; n < 3; n++) {
        const side = n === 0 ? -1 : 1, q0 = sourceArrival(5), q = arrived(5);
        const point = migrate([(n - 1) * (26 + Math.sin(q0 * Math.PI) * 36) * size,
          -SH * .402 + (n === 1 ? 1 : -1) * (1 - q0) * 80 * size],
          [folio.center + (n - 1) * css(9), folio.top - css(8)], side, 7 + n);
        const open = book ? section(age, .75, 2.30) : 0;
        star(...point, mix((n === 1 ? 10 : 4) * size, css(n === 1 ? 4 : 2), open),
          n === 1 ? 8 : 4, q, (1 - q) * (n - 1), n !== 1);
      }
    } finally { ctx.restore(); }
  }
  window.DSHLateranoOrnaments = Object.freeze({ draw });
})();

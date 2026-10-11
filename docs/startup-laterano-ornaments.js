/* CONCORD / the celestial margin. Original flat vector ornamentation.
 * The sky is drawn before the architecture, in the host's centred design space.
 * Its measured exclusions protect real identity and capability text at any size.
 */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = x => Math.max(0, Math.min(1, x));
  const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
  const mix = (a, b, q) => a + (b - a) * q;
  const section = (x, a, b) => smooth((x - a) / (b - a));

  function draw(ctx, state) {
    const { width: W, height: H, unit, palette: c } = state;
    if (!ctx || ![W, H, unit].every(x => Number.isFinite(x) && x > 0) || !c) return;
    const phase = state.phase || 0, reduced = !!state.reduced;
    const book = phase === 3 || phase === 4, wide = W / H > 1.24;
    const progress = reduced ? 1 : clamp(state.progress || 0);
    const source = Number.isFinite(state.sourceProgress) ? clamp(state.sourceProgress) : 1;
    const bookAge = Number.isFinite(state.bookAge) ? state.bookAge : 3;
    const gathering = reduced ? 1 : section(bookAge, 0, 1.70);
    // The source sky survives the identity -> folio boundary. During the turn,
    // stars travel to the outside margins, then settle rather than orbit forever.
    const arrival = index => {
      const a = .02 + index * .037, b = .53 + index * .046;
      return reduced ? 1 : book ? mix(section(source, a, b), 1, gathering) : section(progress, a, b);
    };
    const css = px => px / unit;
    const size = Math.min(1.05, Math.max(.62, W / 1120), 1.45 / unit);
    const ink = c.blue;
    function stroke(points, q = 1, color = c.line, alpha = .65, weight = 1) {
      if (q <= 0 || points.length < 2) return;
      const spans = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
      let budget = spans.reduce((a, b) => a + b, 0) * clamp(q);
      ctx.beginPath(); ctx.moveTo(...points[0]);
      for (let i = 0; i < spans.length && budget > 0; i++) {
        const part = Math.min(1, budget / Math.max(.00001, spans[i]));
        ctx.lineTo(mix(points[i][0], points[i + 1][0], part), mix(points[i][1], points[i + 1][1], part));
        budget -= spans[i];
      }
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = Math.max(css(.5), weight); ctx.stroke();
    }
    function ring(x, y, r, q = 1, color = c.line, alpha = .6, weight = .9, start = -Math.PI / 2) {
      if (q <= 0 || r <= 0) return;
      ctx.beginPath(); ctx.arc(x, y, r, start, start + TAU * clamp(q));
      ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = Math.max(css(.5), weight); ctx.stroke();
    }
    function star(x, y, r, rays = 4, q = 1, alpha = .7, solid = true, angle = 0) {
      if (q <= 0) return;
      const points = Array.from({ length: rays * 2 }, (_, n) => {
        const a = n * Math.PI / rays - Math.PI / 2 + angle;
        const radius = r * q * (n % 2 ? .23 : 1);
        return [x + Math.cos(a) * radius, y + Math.sin(a) * radius];
      });
      points.push(points[0]);
      if (!solid) return stroke(points, 1, ink, alpha);
      ctx.beginPath(); ctx.moveTo(...points[0]); points.slice(1).forEach(p => ctx.lineTo(...p));
      ctx.closePath(); ctx.fillStyle = ink; ctx.globalAlpha = alpha; ctx.fill();
    }
    function sun(x, y, radius, q) {
      ring(x, y, radius * .49, section(q, .12, .70), ink, .78, 1.3);
      ring(x, y, radius * .38, section(q, .30, .88), c.line, .7);
      for (let n = 0; n < 24; n++) {
        const a = n * TAU / 24 - Math.PI / 2;
        const stage = section(q, .10 + (n % 6) * .055, .65 + (n % 6) * .055);
        const start = radius * mix(1.8, .62, stage), end = radius * (n % 3 ? .88 : 1.12);
        stroke([[x + Math.cos(a) * start, y + Math.sin(a) * start],
          [x + Math.cos(a) * end, y + Math.sin(a) * end]], stage, n % 3 ? c.line : ink, .8, n % 3 ? .9 : 1.5);
      }
      star(x, y, radius * .18, 8, section(q, .43, 1), .85);
      ring(x, y, radius * 1.24, section(q, .14, .92), c.line, .5);
    }
    function moon(x, y, radius, q) {
      if (q <= 0) return;
      // A single closed crescent, not a paper-coloured disc masking other ink.
      const r = radius * mix(.64, 1, q);
      ctx.beginPath(); ctx.moveTo(x + r * .48, y - r * .87);
      ctx.bezierCurveTo(x - r * 1.38, y - r * .90, x - r * 1.38, y + r * .90, x + r * .48, y + r * .87);
      ctx.bezierCurveTo(x - r * .48, y + r * .35, x - r * .48, y - r * .35, x + r * .48, y - r * .87);
      ctx.closePath(); ctx.fillStyle = ink; ctx.globalAlpha = .72 * q; ctx.fill();
      ring(x, y, r * 1.29, section(q, .10, .95), c.line, .7);
      star(x + r * .39, y - r * .03, r * .32, 4, section(q, .25, 1), .90);
      for (const sign of [-1, 1]) star(x + sign * r * 1.59, y, 3.7 * size, 4, q, .7);
    }
    function haloCross(x, y, radius, q) {
      ring(x, y, radius * .48, q, ink, .35);
      for (let n = 0; n < 4; n++) {
        const a = n * Math.PI / 2;
        const dx = Math.cos(a), dy = Math.sin(a);
        stroke([[x + dx * radius * .15, y + dy * radius * .15], [x + dx * radius, y + dy * radius]], q, ink, .6);
        stroke([[x + dx * radius * .72 - dy * radius * .14, y + dy * radius * .72 + dx * radius * .14],
          [x + dx * radius * .72 + dy * radius * .14, y + dy * radius * .72 - dx * radius * .14]], q, ink, .6);
      }
    }
    function trefoil(x, y, radius, q) {
      const points = Array.from({ length: 73 }, (_, n) => {
        const a = n * TAU / 72 - Math.PI / 2, r = radius * (.74 + .24 * Math.cos((a + Math.PI / 2) * 3));
        return [x + Math.cos(a) * r, y + Math.sin(a) * r];
      });
      stroke(points, q, ink, .62);
      star(x, y, radius * .28, 3, q, .63, false);
    }

    ctx.save();
    try {
      // Apply independent holes: overlapping boxes must never cancel out.
      const exclusions = [state.heading, phase === 2 ? state.identity : book ? state.inventory : null];
      for (const box of exclusions.filter(Boolean)) {
        if (![box.left, box.top, box.right, box.bottom].every(Number.isFinite)) continue;
        const pad = css(9);
        ctx.beginPath(); ctx.rect(-W / 2, -H / 2, W, H);
        ctx.rect(box.left - pad, box.top - pad, box.right - box.left + pad * 2, box.bottom - box.top + pad * 2);
        ctx.clip('evenodd');
      }
      const outward = book ? Math.sin(gathering * Math.PI) * 30 * size : 0;
      const skyY = -H * .345;
      const sunRadius = (wide ? 43 : 34) * size, moonRadius = (wide ? 29 : 24) * size;
      function avoidHeading(x, y, radius, side, head) {
        const gap = css(14), margin = css(10);
        if (!head || x + radius < head.left - gap || x - radius > head.right + gap ||
            y + radius < head.top - gap || y - radius > head.bottom + gap) return [x, y];
        const shifted = side < 0 ? head.left - gap - radius : head.right + gap + radius;
        if (shifted - radius > -W / 2 + margin && shifted + radius < W / 2 - margin) {
          return [shifted, y];
        }
        const above = head.top - gap - radius;
        return [x, above - radius > -H / 2 + margin ? above : y];
      }
      function celestialAnchor(x, y, radius, side) {
        const target = avoidHeading(x, y, radius, side, state.heading);
        if (!book) return target;
        // Recover the preceding identity pose first, including any heading
        // avoidance it already needed. Age zero must not jump back to raw x/y.
        const origin = avoidHeading(x, y, radius, side, state.sourceHeading || state.heading);
        return target.map((value, index) => mix(origin[index], value, gathering));
      }
      const sunPosition = celestialAnchor(-W * (wide ? .305 : .325) - outward,
        skyY + (1 - arrival(0)) * 52 * size, sunRadius * 1.30, -1);
      const moonPosition = celestialAnchor(W * (wide ? .305 : .335) + outward,
        wide ? skyY : H * .257, moonRadius * 1.80, 1);
      sun(...sunPosition, sunRadius, arrival(0));
      moon(...moonPosition, moonRadius, arrival(2));

      // A segmented celestial vault: a high arch of fixed stars, with broken
      // sections and fine radial etching. It never competes with the main portal.
      const rx = W * .385, ry = H * .325, cy = -H * .077;
      for (let band = 0; band < 2; band++) {
        for (let bay = 0; bay < 8; bay++) {
          const a0 = Math.PI + bay * Math.PI / 8 + .028, a1 = Math.PI + (bay + 1) * Math.PI / 8 - .028;
          const q = arrival(1 + bay % 3), offset = (1 - q) * (bay % 2 ? 42 : -42) * size;
          const points = Array.from({ length: 15 }, (_, n) => {
            const a = mix(a0, a1, n / 14);
            return [Math.cos(a) * (rx + band * 9 * size), cy + Math.sin(a) * (ry + band * 9 * size) + offset];
          });
          stroke(points, q, band ? c.line : ink, band ? .42 : .32);
        }
      }
      for (let n = 0; n < 11; n++) {
        const a = Math.PI + (n + .5) * Math.PI / 11;
        const x = Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        star(x, y, (n % 5 === 0 ? 8 : 3.6) * size, 4, arrival(3 + n % 3), n % 5 === 0 ? .75 : .44, n % 2 === 0);
      }

      // Each margin has its own drawn constellation and a sacred emblem.
      // On compact views the chains stay above/below the form, not across it.
      for (const side of [-1, 1]) {
        const x = side * W * (wide ? .315 : .325);
        const y = H * (wide ? .10 : .30), spread = (wide ? 82 : 42) * size;
        const nodes = [[x - side * spread, y - 80 * size], [x, y - 115 * size],
          [x + side * spread * .55, y - 25 * size], [x - side * spread * .25, y + 32 * size],
          [x + side * spread * .64, y + 91 * size]];
        const q = arrival(4 + (side > 0 ? 1 : 0));
        const drift = (1 - q) * side * 55 * size + side * outward;
        const shifted = nodes.map(([xx, yy]) => [xx + drift, yy]);
        stroke(shifted, q, c.line, .62);
        shifted.forEach(([xx, yy], n) => {
          const t = section(q, n * .085, .64 + n * .085);
          star(xx, yy, (n % 2 ? 7 : 4) * size, n === 2 ? 8 : 4, t, .66, n % 2 === 0);
          if (n === 1 || n === 3) ring(xx, yy, 12 * size, t, c.line, .52);
        });
        if (wide) {
          const bottomY = H * .27;
          if (side < 0) haloCross(x, bottomY, 22 * size, arrival(6));
          else trefoil(x, bottomY, 25 * size, arrival(6));
          // Fine quatrefoil tessellation provides density without a dark mass.
          for (let i = 0; i < 4; i++) {
            const xx = x + (i - 1.5) * 23 * size, yy = H * .365;
            star(xx, yy, 9 * size, 4, arrival(6 + i % 2), .40, false, Math.PI / 4);
            if (i < 3) stroke([[xx + 9 * size, yy], [xx + 14 * size, yy]], arrival(7), c.line, .65);
          }
        }
      }
      // Three small phases below the sky's keystone recall illuminated calendars.
      // Their fixed central star remains a point, not another large floral motif.
      const crownY = -H * .402, crownQ = arrival(5);
      ring(-24 * size, crownY, 4 * size, crownQ, ink, .66);
      star(0, crownY, 9 * size, 8, crownQ, .72, false);
      ring(24 * size, crownY, 4 * size, crownQ, ink, .66);
      stroke([[-51 * size, crownY], [-37 * size, crownY]], crownQ, c.line, .66);
      stroke([[37 * size, crownY], [51 * size, crownY]], crownQ, c.line, .66);
    } finally { ctx.restore(); }
  }
  window.DSHLateranoOrnaments = Object.freeze({ draw });
})();

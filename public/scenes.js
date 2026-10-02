/*
 * Background scenes. Each one owns a full-bleed canvas and returns a stop
 * function. Everything is drawn in code — no frames, stills or logos from
 * anybody's film — and every scene:
 *
 *   - caps device pixel ratio at 2 and scales its particle budget to the area,
 *     so a 4K projector does not melt a laptop;
 *   - draws a single static frame and stops when prefers-reduced-motion is set;
 *   - stops animating while the tab is hidden, and picks up where it left off.
 *
 * Register a new look by adding to window.Scenes and naming it in a theme.
 */
(() => {
  "use strict";

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const token = (name, fallback) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

  /** Shared plumbing: sizing, the frame loop, visibility, teardown. */
  function makeScene(canvas, { draw, init }) {
    const ctx = canvas && canvas.getContext("2d", { alpha: true });
    if (!ctx) return () => {};

    const S = { w: 0, h: 0, dpr: 1, t: 0, ctx };
    let raf = 0, stopped = false, last = 0;

    function resize() {
      S.dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      S.w = Math.max(1, Math.round(r.width));
      S.h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(S.w * S.dpr);
      canvas.height = Math.round(S.h * S.dpr);
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      if (init) init(S);
    }

    function frame(now) {
      if (stopped) return;
      const dt = last ? Math.min(50, now - last) : 16;
      last = now;
      S.t += dt;
      draw(S, dt);
      raf = requestAnimationFrame(frame);
    }

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
        raf = 0;
        last = 0;
      } else if (!stopped && !raf && !reduced()) {
        raf = requestAnimationFrame(frame);
      }
    }

    const onResize = () => { resize(); draw(S, 16); };

    resize();
    draw(S, 16);

    if (!reduced()) {
      raf = requestAnimationFrame(frame);
      document.addEventListener("visibilitychange", onVisibility);
    }
    window.addEventListener("resize", onResize);

    return function stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      ctx.clearRect(0, 0, S.w, S.h);
    };
  }

  /* ============================================================== comic ==== */

  /*
   * A comic page coming off the press. Five things make it read as print rather
   * than as "dots on a background":
   *
   *   1. Two halftone screens in different inks at different angles, the way
   *      four-colour printing actually lays them down.
   *   2. A deliberate misregistration -- the second screen sits a pixel or two
   *      off -- which is the single strongest cue that something was printed.
   *   3. Raking speed lines, the page's way of saying motion.
   *   4. Ink burst outlines drifting across, the shape behind an impact.
   *   5. Paper grain and edge darkening, so it looks scanned rather than drawn.
   */
  function comic(canvas) {
    let bursts = [], grain = [];

    function seed(S) {
      bursts = Array.from({ length: 3 }, (_, i) => ({
        x: 0.2 + i * 0.3,
        y: 0.25 + ((i * 0.37) % 0.5),
        r: 0.1 + (i % 2) * 0.05,
        spin: i * 1.1,
        speed: 0.000045 + i * 0.000022,
        spikes: 11 + i * 3,
      }));
      const n = Math.round(Math.min(260, Math.max(70, (S.w * S.h) / 9000)));
      grain = Array.from({ length: n }, () => ({
        x: Math.random(), y: Math.random(), a: 0.03 + Math.random() * 0.07,
      }));
    }

    /*
     * One halftone screen: dots on a lattice rotated by `angle`.
     *
     * The lattice indices are bounded by projecting the screen's corners back
     * into lattice space. Iterating a square span over the diagonal instead
     * (the obvious way) visits about ten times as many cells as it draws, and
     * at 1080p that was 200k wasted iterations a frame across three screens.
     */
    function screenDots(ctx, w, h, t, angle, gap, colour, alpha, offx, offy, drift) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
      for (const [px, py] of [[0, 0], [w, 0], [0, h], [w, h]]) {
        const dx = px - w * 0.5 - offx, dy = py - h * 0.5 - offy;
        const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
        const i = (lx - drift) / gap, j = (ly - drift * 0.4) / gap;
        if (i < i0) i0 = i;
        if (i > i1) i1 = i;
        if (j < j0) j0 = j;
        if (j > j1) j1 = j;
      }
      i0 = Math.floor(i0) - 1; i1 = Math.ceil(i1) + 1;
      j0 = Math.floor(j0) - 1; j1 = Math.ceil(j1) + 1;

      ctx.fillStyle = colour;
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const lx = i * gap + drift;
          const ly = j * gap + drift * 0.4;
          const x = w * 0.5 + lx * cos - ly * sin + offx;
          const y = h * 0.5 + lx * sin + ly * cos + offy;
          if (x < -gap || x > w + gap || y < -gap || y > h + gap) continue;
          const k = (x / Math.max(w, 1)) * 0.55 + (y / Math.max(h, 1)) * 0.45;
          const pulse = 0.5 + 0.5 * Math.sin(t * 0.0007 + k * 5.5);
          ctx.globalAlpha = alpha * (0.35 + k * 0.9);
          ctx.beginPath();
          ctx.arc(x, y, (0.55 + k * 1.9) * (0.78 + pulse * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    return makeScene(canvas, {
      init: seed,
      draw(S) {
        const { ctx, w, h, t } = S;
        const ink = token("--ink", "#15120E");
        const red = token("--red", "#D01E28");
        const azure = token("--azure", "#1B64B8");
        ctx.clearRect(0, 0, w, h);

        /* Raking speed lines, converging off the top-left corner. */
        ctx.save();
        ctx.globalAlpha = 0.09;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        const cx = -w * 0.22, cy = -h * 0.3;
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 0.6 + 0.14 + Math.sin(t * 0.0003 + i) * 0.006;
          const r0 = 130 + ((i * 41 + t * 0.03) % 280);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * (r0 + 190), cy + Math.sin(a) * (r0 + 190));
          ctx.stroke();
        }
        ctx.restore();

        /* Ink burst outlines, tumbling slowly. */
        ctx.save();
        ctx.globalAlpha = 0.11;
        ctx.strokeStyle = red;
        ctx.lineWidth = 2;
        for (const b of bursts) {
          const bx = b.x * w, by = b.y * h, br = b.r * Math.min(w, h);
          const rot = b.spin + t * b.speed;
          ctx.beginPath();
          for (let i = 0; i <= b.spikes * 2; i++) {
            const a = rot + (i / (b.spikes * 2)) * Math.PI * 2;
            const r = i % 2 === 0 ? br : br * 0.52;
            const px = bx + Math.cos(a) * r, py = by + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
        ctx.restore();

        /* Two screens, two angles, deliberately out of register. */
        /* Budget is for all three screens together, not each. */
        const gap = Math.max(16, Math.sqrt((w * h) / 2200));
        const drift = (t * 0.011) % gap;
        const slip = 1.6 + Math.sin(t * 0.0004) * 0.9;
        ctx.save();
        screenDots(ctx, w, h, t, 0.26, gap, ink, 0.1, 0, 0, drift);
        screenDots(ctx, w, h, t, 1.31, gap * 1.15, red, 0.075, slip, -slip, drift * 0.8);
        screenDots(ctx, w, h, t, 0.79, gap * 1.45, azure, 0.045, -slip, slip * 0.6, drift * 1.3);
        ctx.restore();

        /* Paper grain. */
        ctx.save();
        ctx.fillStyle = ink;
        for (const g of grain) {
          ctx.globalAlpha = g.a;
          ctx.fillRect(g.x * w, g.y * h, 1, 1);
        }
        ctx.restore();

        /* Edge darkening, like a page scanned slightly off the glass. */
        const vig = ctx.createRadialGradient(w * 0.48, h * 0.46, Math.min(w, h) * 0.38,
          w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.3)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);
      },
    });
  }

  /* ============================================================= cosmic ==== */

  /*
   * Deep space on a slow loop, in the spirit of the big vector intros that used
   * to open a site: layered parallax, additive glows, long easing. Five layers,
   * back to front — nebula wash, three star fields, rising embers, a pulsing
   * core, then a vignette to sit the content on top.
   */
  function cosmic(canvas) {
    let stars = [], embers = [], blobs = [];

    function seed(S) {
      const area = S.w * S.h;
      const starCount = Math.round(Math.min(420, Math.max(90, area / 5200)));
      const emberCount = Math.round(Math.min(130, Math.max(30, area / 16000)));

      stars = [];
      for (let i = 0; i < starCount; i++) {
        const depth = Math.random();            // 0 far, 1 near
        stars.push({
          x: Math.random() * S.w,
          y: Math.random() * S.h,
          r: 0.4 + depth * 1.5,
          depth,
          twinkle: Math.random() * Math.PI * 2,
          speed: 0.004 + depth * 0.018,
        });
      }

      embers = [];
      for (let i = 0; i < emberCount; i++) {
        embers.push({
          x: Math.random() * S.w,
          y: Math.random() * S.h,
          r: 0.8 + Math.random() * 2.2,
          vy: -(0.08 + Math.random() * 0.26),
          vx: (Math.random() - 0.5) * 0.09,
          life: Math.random(),
          hue: Math.random(),
        });
      }

      blobs = [
        { x: 0.22, y: 0.28, r: 0.52, c: "azure", a: 0.3, sx: 0.00007, sy: 0.00005 },
        { x: 0.78, y: 0.66, r: 0.60, c: "red", a: 0.26, sx: -0.00005, sy: 0.00008 },
        { x: 0.55, y: 0.12, r: 0.40, c: "gold", a: 0.16, sx: 0.00009, sy: -0.00004 },
      ];
    }

    function hexToRgb(hex) {
      const h = hex.replace("#", "");
      const n = h.length === 3
        ? h.split("").map((c) => c + c).join("")
        : h.slice(0, 6);
      const v = parseInt(n, 16);
      return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }

    return makeScene(canvas, {
      init: seed,
      draw(S, dt) {
        const { ctx, w, h, t } = S;
        const paper = token("--paper", "#0B0B14");
        const ink = token("--ink", "#EFEAFF");

        /* 1. the void, lifted slightly toward the middle */
        ctx.clearRect(0, 0, w, h);
        const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.45, Math.max(w, h) * 0.78);
        const [pr, pg, pb] = hexToRgb(paper);
        bg.addColorStop(0, `rgba(${Math.min(255, pr + 26)},${Math.min(255, pg + 22)},${Math.min(255, pb + 46)},1)`);
        bg.addColorStop(1, `rgb(${pr},${pg},${pb})`);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        /* 2. nebula: broad additive washes, drifting against each other */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const b of blobs) {
          const cx = (b.x + Math.sin(t * b.sx) * 0.08) * w;
          const cy = (b.y + Math.cos(t * b.sy) * 0.07) * h;
          const rad = b.r * Math.max(w, h) * 0.5;
          const [r, g, bl] = hexToRgb(token("--" + b.c, "#7C9BFF"));
          const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
          grad.addColorStop(0, `rgba(${r},${g},${bl},${b.a})`);
          grad.addColorStop(0.45, `rgba(${r},${g},${bl},${b.a * 0.3})`);
          grad.addColorStop(1, `rgba(${r},${g},${bl},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, rad, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        /* 3. parallax stars, nearer ones drifting faster and twinkling harder */
        const [ir, ig, ib] = hexToRgb(ink);
        ctx.save();
        for (const s of stars) {
          s.x -= s.speed * dt * 0.06;
          if (s.x < -2) { s.x = w + 2; s.y = Math.random() * h; }
          const tw = 0.55 + 0.45 * Math.sin(t * 0.002 + s.twinkle);
          ctx.globalAlpha = (0.18 + s.depth * 0.6) * tw;
          ctx.fillStyle = `rgb(${ir},${ig},${ib})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        /* 4. embers rising, warm and glowing, wrapping at the top */
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const gold = hexToRgb(token("--gold", "#FFC24A"));
        const red = hexToRgb(token("--red", "#FF3B5C"));
        for (const e of embers) {
          e.y += e.vy * dt * 0.06;
          e.x += e.vx * dt * 0.06 + Math.sin((e.y + t * 0.03) * 0.012) * 0.12;
          if (e.y < -6) { e.y = h + 6; e.x = Math.random() * w; }
          const mix = e.hue;
          const r = Math.round(gold[0] * mix + red[0] * (1 - mix));
          const g = Math.round(gold[1] * mix + red[1] * (1 - mix));
          const b = Math.round(gold[2] * mix + red[2] * (1 - mix));
          const fade = 0.35 + 0.35 * Math.sin(t * 0.0015 + e.life * 9);
          const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 5);
          grad.addColorStop(0, `rgba(${r},${g},${b},${fade})`);
          grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r * 5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        /* 5. the core: a slow pulse with radiating spokes, low in the frame */
        const ccx = w * 0.5, ccy = h * 0.62;
        const beat = 0.5 + 0.5 * Math.sin(t * 0.0009);
        const base = Math.min(w, h) * 0.17;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const [ar, ag, ab] = hexToRgb(token("--azure", "#7C9BFF"));
        const halo = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, base * (1.5 + beat * 0.5));
        halo.addColorStop(0, `rgba(${ar},${ag},${ab},${0.1 + beat * 0.09})`);
        halo.addColorStop(1, `rgba(${ar},${ag},${ab},0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(ccx, ccy, base * (1.5 + beat * 0.5), 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${0.1 + beat * 0.12})`;
        ctx.lineWidth = 1;
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2 + t * 0.00012;
          const r0 = base * (0.9 + 0.08 * Math.sin(t * 0.0016 + i * 0.7));
          const r1 = r0 + base * (0.22 + 0.3 * beat) * (0.5 + 0.5 * Math.sin(i * 2.1));
          ctx.beginPath();
          ctx.moveTo(ccx + Math.cos(a) * r0, ccy + Math.sin(a) * r0 * 0.55);
          ctx.lineTo(ccx + Math.cos(a) * r1, ccy + Math.sin(a) * r1 * 0.55);
          ctx.stroke();
        }
        ctx.restore();

        /* 6. vignette, so text on top always has somewhere dark to sit */
        const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.3, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.55)");
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);
      },
    });
  }


  /* ================================================================ hud ==== */

  /*
   * A tactical readout: the briefing-screen look those films use for anything
   * technical. Counter-rotating instrument rings over a receding floor grid, with
   * a scan sweep and corner brackets. Geometry and type conventions only — no
   * insignia, no borrowed interface.
   */
  function hud(canvas) {
    let bars = [];

    function seed() {
      bars = Array.from({ length: 22 }, () => ({
        v: Math.random(),
        speed: 0.0004 + Math.random() * 0.0016,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    function ring(ctx, cx, cy, r, from, to, width, colour, alpha) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(cx, cy, r, from, to);
      ctx.stroke();
    }

    return makeScene(canvas, {
      init: seed,
      draw(S) {
        const { ctx, w, h, t } = S;
        const ink = token("--ink", "#DCE6F2");
        const azure = token("--azure", "#4FD4FF");
        const gold = token("--gold", "#FFC24A");
        const paper = token("--paper", "#070B12");

        ctx.clearRect(0, 0, w, h);
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, paper);
        bg.addColorStop(1, paper);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);

        /* Floor grid, receding to a horizon just below centre. */
        const hz = h * 0.58;
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.strokeStyle = azure;
        ctx.lineWidth = 1;
        for (let i = 1; i < 16; i++) {
          const k = i / 16;
          const y = hz + Math.pow(k, 2.1) * (h - hz) * 1.25;
          if (y > h) break;
          ctx.globalAlpha = 0.16 * (1 - k * 0.7);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        const vanish = w * 0.5;
        for (let i = -9; i <= 9; i++) {
          ctx.globalAlpha = 0.1;
          ctx.beginPath();
          ctx.moveTo(vanish + i * 10, hz);
          ctx.lineTo(vanish + i * (w * 0.16), h);
          ctx.stroke();
        }
        ctx.restore();

        /* Instrument rings, counter-rotating with broken arcs and tick marks. */
        const cx = w * 0.5, cy = h * 0.42;
        const base = Math.min(w, h) * 0.2;
        ctx.save();
        for (let layer = 0; layer < 3; layer++) {
          const r = base * (1 + layer * 0.34);
          const dir = layer % 2 === 0 ? 1 : -1;
          const spin = t * 0.00016 * dir * (1 + layer * 0.3);
          const gaps = 3 + layer;
          for (let g = 0; g < gaps; g++) {
            const from = spin + (g / gaps) * Math.PI * 2;
            ring(ctx, cx, cy, r, from, from + (Math.PI * 2 / gaps) * 0.62,
              layer === 1 ? 2.5 : 1.4, layer === 1 ? azure : ink, 0.3 - layer * 0.06);
          }
          const ticks = 36 + layer * 12;
          ctx.globalAlpha = 0.22;
          ctx.strokeStyle = layer === 2 ? gold : ink;
          ctx.lineWidth = 1;
          for (let i = 0; i < ticks; i++) {
            const a = spin * 1.4 + (i / ticks) * Math.PI * 2;
            const long = i % 6 === 0;
            const r0 = r + 5;
            const r1 = r0 + (long ? 11 : 5);
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
            ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
            ctx.stroke();
          }
        }
        /* Core glow. */
        const beat = 0.5 + 0.5 * Math.sin(t * 0.0012);
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * 0.95);
        glow.addColorStop(0, `rgba(255,255,255,${0.05 + beat * 0.05})`);
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, base * 0.95, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        /* Telemetry bars down the left, drifting independently. */
        ctx.save();
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = azure;
        const bw = Math.min(90, w * 0.1);
        bars.forEach((b, i) => {
          const y = 24 + i * ((h - 48) / bars.length);
          const v = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * b.speed + b.phase));
          ctx.globalAlpha = 0.1 + v * 0.22;
          ctx.fillRect(18, y, bw * v, 2);
        });
        ctx.restore();

        /* Scan sweep. */
        const sy = ((t * 0.045) % (h + 240)) - 120;
        const sweep = ctx.createLinearGradient(0, sy - 110, 0, sy + 110);
        sweep.addColorStop(0, "rgba(255,255,255,0)");
        sweep.addColorStop(0.5, `rgba(${hexRgb(azure)},0.055)`);
        sweep.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sweep;
        ctx.fillRect(0, sy - 110, w, 220);

        /* Corner brackets, so the whole frame reads as an instrument. */
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = gold;
        ctx.lineWidth = 2;
        const m = 20, len = Math.min(46, w * 0.08);
        for (const [ox, oy, dx, dy] of [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]]) {
          ctx.beginPath();
          ctx.moveTo(ox, oy + dy * len);
          ctx.lineTo(ox, oy);
          ctx.lineTo(ox + dx * len, oy);
          ctx.stroke();
        }
        ctx.restore();

        /* Vignette. */
        const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.32, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.5)");
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, w, h);
      },
    });
  }

  /** "#rrggbb" -> "r,g,b" for use inside an rgba() string. */
  function hexRgb(hex) {
    const c = String(hex).replace("#", "");
    const n = c.length === 3 ? c.split("").map((x) => x + x).join("") : c.slice(0, 6);
    const v = parseInt(n, 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255].join(",");
  }

  window.Scenes = { comic, cosmic, hud };
})();

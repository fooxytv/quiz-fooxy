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

  /* The press look: drifting halftone and raking speed lines. */
  function comic(canvas) {
    return makeScene(canvas, {
      draw(S) {
        const { ctx, w, h, t } = S;
        const ink = token("--ink", "#17161A");
        const red = token("--red", "#C8102E");
        ctx.clearRect(0, 0, w, h);

        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        const cx = -w * 0.25, cy = -h * 0.35;
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 0.62 + 0.12 + Math.sin(t * 0.0003 + i) * 0.006;
          const r0 = 120 + ((i * 37 + t * 0.035) % 260);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
          ctx.lineTo(cx + Math.cos(a) * (r0 + 170), cy + Math.sin(a) * (r0 + 170));
          ctx.stroke();
        }
        ctx.restore();

        /* Dot spacing scales with the canvas so the op count stays bounded: a
           fixed 16px grid is ~8.6k arcs a frame at 1080p and ~32k at 4K, which
           drops frames on exactly the big screen this is meant for. */
        const gap = Math.max(16, Math.sqrt((w * h) / 6000));
        const drift = (t * 0.012) % gap;
        ctx.save();
        for (let y = -gap; y < h + gap; y += gap) {
          for (let x = -gap; x < w + gap; x += gap) {
            const px = x + drift, py = y + drift * 0.5;
            const k = (px / Math.max(w, 1)) * 0.6 + (py / Math.max(h, 1)) * 0.4;
            const pulse = 0.5 + 0.5 * Math.sin(t * 0.0008 + k * 6);
            ctx.globalAlpha = 0.05 + k * 0.1;
            ctx.fillStyle = k > 0.72 ? red : ink;
            ctx.beginPath();
            ctx.arc(px, py, 0.7 + k * 2.1 * (0.75 + pulse * 0.25), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
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

  window.Scenes = { comic, cosmic };
})();

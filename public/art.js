/*
 * Original comic-book artwork, drawn in code. Nothing here is traced, sampled or
 * derived from any publisher's property: it is halftone dots, speed lines, ink
 * bursts and a geometric badge — the vocabulary of the genre, not anyone's
 * characters, logos or trade dress.
 *
 * Everything reads its colours from the CSS custom properties, so it follows the
 * light and dark palettes without a second set of values.
 */
(() => {
  "use strict";

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function token(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  /* ------------------------------------------------------------- backdrop --- */

  /**
   * A drifting field of halftone dots with raking speed lines, the way a comic
   * page suggests motion. Low contrast on purpose: it sits behind real content.
   */
  function backdrop(canvas) {
    if (!canvas) return () => {};
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return () => {};

    let w = 0, h = 0, dpr = 1, raf = 0, t = 0, stopped = false;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function frame() {
      const ink = token("--ink", "#17161A");
      const red = token("--red", "#C8102E");
      ctx.clearRect(0, 0, w, h);

      /* Raking speed lines, converging off the top-left corner. */
      ctx.save();
      ctx.globalAlpha = 0.1;
      ctx.strokeStyle = ink;
      ctx.lineWidth = 1.5;
      const cx = -w * 0.25, cy = -h * 0.35;
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 0.62 + 0.12 + Math.sin(t * 0.0003 + i) * 0.006;
        const r0 = 120 + ((i * 37 + t * 0.035) % 260);
        const r1 = r0 + 170;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
      }
      ctx.restore();

      /* Halftone dots, drifting and swelling toward the lower right. */
      const gap = 16;
      const drift = (t * 0.012) % gap;
      ctx.save();
      for (let y = -gap; y < h + gap; y += gap) {
        for (let x = -gap; x < w + gap; x += gap) {
          const px = x + drift;
          const py = y + drift * 0.5;
          const k = (px / Math.max(w, 1)) * 0.6 + (py / Math.max(h, 1)) * 0.4;
          const pulse = 0.5 + 0.5 * Math.sin(t * 0.0008 + k * 6);
          const r = 0.7 + k * 2.1 * (0.75 + pulse * 0.25);
          ctx.globalAlpha = 0.05 + k * 0.1;
          ctx.fillStyle = k > 0.72 ? red : ink;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    function loop() {
      if (stopped) return;
      t += 16;
      frame();
      raf = requestAnimationFrame(loop);
    }

    const onResize = () => { resize(); frame(); };
    resize();
    frame();

    if (!reduced()) {
      raf = requestAnimationFrame(loop);
      window.addEventListener("resize", onResize);
    }

    return function stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }

  /* --------------------------------------------------------------- shapes --- */

  /** Points of a spiked ink burst, the shape a comic puts behind an impact. */
  function burstPoints(spikes, inner, outer, seed) {
    const pts = [];
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const even = i % 2 === 0;
      const jitter = 0.86 + ((Math.sin(seed + i * 2.399) + 1) / 2) * 0.28;
      const r = (even ? outer : inner) * jitter;
      pts.push([50 + Math.cos(a) * r, 50 + Math.sin(a) * r]);
    }
    return pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  }

  /** A full-bleed starburst to sit behind a number or a revealed word. */
  function starburst({ spikes = 16, fill = "var(--red)", opacity = 0.16, seed = 3 } = {}) {
    return `<svg class="art-burst" viewBox="0 0 100 100" aria-hidden="true" focusable="false" preserveAspectRatio="none">
      <polygon points="${burstPoints(spikes, 26, 50, seed)}" fill="${fill}" opacity="${opacity}"></polygon>
      <polygon points="${burstPoints(spikes, 18, 38, seed + 9)}" fill="${fill}" opacity="${opacity * 0.7}"></polygon>
    </svg>`;
  }

  /**
   * The quiz's own badge: a six-sided plate for the six guesses, a chevron, and a
   * halftone wash. Geometric and original — no shield, no star, no circle-and-
   * ring lockup that would read as somebody's insignia.
   */
  function emblem(size = 34) {
    const id = "em" + Math.random().toString(36).slice(2, 8);
    return `<svg class="art-emblem" width="${size}" height="${size}" viewBox="0 0 48 48" role="img" aria-label="Six Panels badge">
      <defs>
        <pattern id="${id}" width="4" height="4" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="currentColor" opacity=".45"></circle>
        </pattern>
      </defs>
      <polygon points="24,2 43,13 43,35 24,46 5,35 5,13" fill="var(--red)" stroke="currentColor" stroke-width="3"></polygon>
      <polygon points="24,2 43,13 43,35 24,46 5,35 5,13" fill="url(#${id})"></polygon>
      <path d="M13 29 L24 17 L35 29" fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="square" stroke-linejoin="miter"></path>
      <path d="M17 36 L31 36" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="square"></path>
    </svg>`;
  }

  /** One-shot ink burst over an element, for a solve. Cleans itself up. */
  function pop(el, { text = "", fill = "var(--green)" } = {}) {
    if (!el || reduced()) return;
    const node = document.createElement("div");
    node.className = "art-pop";
    node.setAttribute("aria-hidden", "true");
    node.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon points="${burstPoints(14, 24, 49, 7)}" fill="${fill}" opacity=".9"></polygon>
      </svg>${text ? `<span>${text}</span>` : ""}`;
    el.appendChild(node);
    setTimeout(() => node.remove(), 760);
  }

  window.ComicArt = { backdrop, starburst, emblem, pop, reduced };
})();

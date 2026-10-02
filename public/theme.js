/*
 * Applies a theme to the page: palette, wordmark, background scene, intro card.
 *
 * Palette values arrive from the server already restricted to a whitelist of
 * custom property names and validated as hex, so they are written straight onto
 * the root element. Nothing else from a theme reaches CSS.
 */
(() => {
  "use strict";

  const PALETTE_KEYS = [
    "paper", "surface", "sunk", "ink", "muted", "hair",
    "red", "gold", "green", "azure",
    "tile-edge", "on-solid", "panel-shadow",
  ];
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  let current = null;
  let stopScene = null;
  let sceneWanted = false;
  let introTimer = 0;
  /* The title card covers the page, so it never plays by itself. The host
     triggers it, and may opt into a loop for an unattended lobby screen. */
  let introLoop = false;

  const el = (id) => document.getElementById(id);
  const prefersDark = () =>
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

  /* -------------------------------------------------------------- palette --- */

  function applyPalette(theme) {
    const root = document.documentElement;
    /* Clear whatever the last theme set, so switching does not leave debris. */
    for (const k of PALETTE_KEYS) root.style.removeProperty("--" + k);

    const base = theme.palette || {};
    const dark = (prefersDark() && theme.paletteDark) ? theme.paletteDark : {};
    const merged = { ...base, ...dark };
    for (const [k, v] of Object.entries(merged)) {
      if (!PALETTE_KEYS.includes(k) || !HEX.test(String(v))) continue;
      root.style.setProperty("--" + k, v);
    }
    root.setAttribute("data-scene", theme.scene || "hud");
  }

  function applyWordmark(theme) {
    const lead = document.querySelector(".wordmark .a");
    const tail = document.querySelector(".wordmark .b");
    if (lead) lead.textContent = theme.wordmark?.lead ?? "MARVEL";
    if (tail) tail.textContent = theme.wordmark?.tail ?? "Quiz";
  }

  /* ---------------------------------------------------------------- scene --- */

  function startScene() {
    const canvas = el("backdrop");
    if (!canvas || !current) return;
    stopScene?.();
    stopScene = null;
    const make = window.Scenes?.[current.scene] || window.Scenes?.hud;
    if (make) stopScene = make(canvas);
    if (current.backdropImage) {
      canvas.style.backgroundImage = `url("/assets/${encodeURIComponent(current.backdropImage)}")`;
      canvas.classList.add("has-image");
    } else {
      canvas.style.backgroundImage = "";
      canvas.classList.remove("has-image");
    }
  }

  function stop() {
    stopScene?.();
    stopScene = null;
  }

  /**
   * Show or hide the background. Scenes only run on the waiting screens, where
   * there is nothing to read and they have the stage to themselves.
   */
  function setBackdrop(on) {
    sceneWanted = !!on;
    document.body.classList.toggle("art-on", sceneWanted);
    if (sceneWanted) {
      startScene();
      if (introLoop) scheduleIntro();
    } else {
      stop();
      clearTimeout(introTimer);
      introTimer = 0;
      hideIntro();
    }
  }

  /* ---------------------------------------------------------------- intro --- */

  /*
   * The title card: letters drop in one after another, the strapline wipes
   * under them, it holds, then it clears. It replays on a loop while the lobby
   * is up, the way an intro used to sit looping on a landing page.
   */
  function playIntro() {
    if (!current?.intro) return;
    const host = el("introCard");
    if (!host) return;
    if (window.ComicArt?.reduced?.()) {
      host.innerHTML = `<div class="intro-title">${esc(current.intro.title)}</div>
        ${current.intro.subtitle ? `<div class="intro-sub">${esc(current.intro.subtitle)}</div>` : ""}`;
      host.classList.add("on");
      return;
    }

    const letters = String(current.intro.title).split("");
    host.innerHTML = `
      <div class="intro-title">${letters.map((ch, i) =>
        ch === " "
          ? `<span class="sp"> </span>`
          : `<span class="ch" style="animation-delay:${(i * 65)}ms">${esc(ch)}</span>`
      ).join("")}</div>
      ${current.intro.subtitle
        ? `<div class="intro-sub" style="animation-delay:${letters.length * 65 + 260}ms">${esc(current.intro.subtitle)}</div>`
        : ""}`;
    host.classList.remove("on");
    void host.offsetWidth;          // restart the animations
    host.classList.add("on");

    const hold = letters.length * 65 + 3400;
    setTimeout(() => host.classList.remove("on"), hold);
  }

  function hideIntro() {
    const host = el("introCard");
    if (host) { host.classList.remove("on"); host.innerHTML = ""; }
  }

  function scheduleIntro() {
    clearTimeout(introTimer);
    if (!current?.intro || !sceneWanted || !introLoop) { hideIntro(); return; }
    playIntro();
    introTimer = setTimeout(scheduleIntro, current.intro.everyMs);
  }

  /** Looping is opt-in, and remembered per device. */
  function setIntroLoop(on) {
    introLoop = !!on;
    try { localStorage.setItem("mcuQuiz.introLoop", introLoop ? "1" : "0"); } catch (e) {}
    if (introLoop) scheduleIntro();
    else { clearTimeout(introTimer); introTimer = 0; hideIntro(); }
    return introLoop;
  }
  function introLooping() { return introLoop; }
  function hasIntro() { return !!current?.intro; }
  try { introLoop = localStorage.getItem("mcuQuiz.introLoop") === "1"; } catch (e) {}

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ----------------------------------------------------------------- api --- */

  function apply(theme) {
    if (!theme) return;
    const changed = !current || current.id !== theme.id;
    current = theme;
    applyPalette(theme);
    applyWordmark(theme);
    if (sceneWanted && changed) {
      startScene();
      if (introLoop) scheduleIntro();
    }
  }

  async function load() {
    try {
      const res = await fetch("/api/theme", { credentials: "same-origin" });
      const data = await res.json();
      apply(data.theme);
      return data.theme;
    } catch (e) {
      return null;
    }
  }

  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
      if (current) applyPalette(current);
    });
  }

  window.Theme = {
    apply, load, setBackdrop, playIntro, hideIntro,
    setIntroLoop, introLooping, hasIntro,
    get current() { return current; },
  };
})();

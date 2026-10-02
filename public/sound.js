/*
 * All audio is synthesised in the browser from oscillators and filtered noise.
 * There are no sound files, no samples, and no transcription of anybody's
 * recording or theme — the lobby bed is a plain i-VI-III-VII minor loop (a chord
 * sequence, which nobody owns) under a motif written for this page.
 *
 * Nothing makes a sound until someone asks for it: browsers block audio before a
 * gesture anyway, and a quiz that starts blaring on load would be unforgivable in
 * a meeting. The choice is remembered per device.
 */
(() => {
  "use strict";

  const LS_KEY = "marvelQuiz.sound";
  const BUS = 0.55;
  const BPM = 84;
  const BEAT = 60 / BPM;

  /* A minor, i - VI - III - VII. Two beats of lead-in per bar of four. */
  const A2 = 110.0;
  const PROG = [
    { root: A2 * 1.0,     third: A2 * 1.1892, fifth: A2 * 1.4983 }, // Am
    { root: A2 * 0.7937,  third: A2 * 1.0,    fifth: A2 * 1.1892 }, // F
    { root: A2 * 1.1892,  third: A2 * 1.4983, fifth: A2 * 1.7818 }, // C
    { root: A2 * 0.8909,  third: A2 * 1.1225, fifth: A2 * 1.3348 }, // G
  ];
  /* The motif, written for this page: semitones from A, and the beat it lands on.
     It answers itself across the last two bars rather than repeating every bar. */
  const MOTIF_A = [[0, 0], [3, 0.75], [7, 1.5], [5, 2.5]];
  const MOTIF_B = [[8, 0.5], [7, 1.5], [3, 2.5], [0, 3.25]];
  const semi = (base, n) => base * Math.pow(2, n / 12);

  let ctx = null;
  let master = null;
  let armed = false;
  let wantsLobbyFn = null;
  let repaint = () => {};
  let enabled = false;
  let loopOn = false;
  let timer = 0;
  let nextTime = 0;
  let step = 0;

  try { enabled = localStorage.getItem(LS_KEY) === "1"; } catch (e) { enabled = false; }

  /** True only when audio can actually be heard right now. */
  function running() {
    return !!(enabled && ctx && ctx.state === "running");
  }

  /*
   * A browser creates an AudioContext suspended and will not resume it without a
   * user gesture. The preference is remembered, so a page could load with
   * `enabled` already true, build a context, fail to resume it, and sit there
   * silent while the button claimed "Sound on" -- and pressing the button then
   * turned it off rather than unlocking it. So: any gesture anywhere unlocks,
   * the button unlocks rather than toggling when it is on-but-locked, and the
   * label tells the truth in between.
   */
  function arm(wantsLobby) {
    wantsLobbyFn = wantsLobby || null;
    if (armed) return;
    armed = true;
    const go = () => {
      if (!enabled || !ensure()) return;
      if (ctx.state === "running") { settle(); return; }
      ctx.resume().then(settle).catch(() => {});
    };
    const settle = () => {
      repaint();
      if (ctx && ctx.state === "running") {
        document.removeEventListener("pointerdown", go, true);
        document.removeEventListener("keydown", go, true);
        if (wantsLobbyFn && wantsLobbyFn()) lobbyStart();
      }
    };
    document.addEventListener("pointerdown", go, true);
    document.addEventListener("keydown", go, true);
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = BUS;
    /*
     * The bed used to sit around -32 dBFS -- arithmetically present, practically
     * inaudible on laptop speakers, which is why "no music" was a real report
     * rather than a stale build. Levels below are now mixed for a meeting room,
     * with a compressor to keep the summed voices off the ceiling.
     */
    try {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      master.connect(comp);
      comp.connect(ctx.destination);
    } catch (e) {
      master.connect(ctx.destination);
    }
    return ctx;
  }

  function noiseBuffer() {
    if (noiseBuffer.cached) return noiseBuffer.cached;
    const n = Math.floor(ctx.sampleRate * 0.6);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    noiseBuffer.cached = buf;
    return buf;
  }

  /* ------------------------------------------------------------- voices --- */

  /** A brass-ish tone: two detuned saws through a swept lowpass. */
  function brass(freq, at, dur, level = 0.3) {
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(600, at);
    f.frequency.linearRampToValueAtTime(2600, at + Math.min(0.14, dur * 0.4));
    f.frequency.linearRampToValueAtTime(900, at + dur);
    f.Q.value = 6;

    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.035);
    g.gain.setValueAtTime(level, at + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    for (const cents of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq * Math.pow(2, cents / 1200);
      o.connect(f);
      o.start(at);
      o.stop(at + dur + 0.05);
    }
    f.connect(g).connect(master);
  }

  /** A soft sustained pad for the chord bed. */
  function pad(freq, at, dur, level = 0.22) {
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 1100;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.5);
    g.gain.setValueAtTime(level, at + dur - 0.6);
    g.gain.linearRampToValueAtTime(0, at + dur);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = freq;
    o.connect(f).connect(g).connect(master);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  /** Timpani: a pitched thud with a noise transient. */
  function drum(at, freq = 68, level = 0.34) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 1.6, at);
    o.frequency.exponentialRampToValueAtTime(freq, at + 0.1);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + 0.45);

    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer();
    const nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 220;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(level * 0.5, at);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
    n.connect(nf).connect(ng).connect(master);
    n.start(at);
    n.stop(at + 0.12);
  }

  function blip(freq, at, dur = 0.1, level = 0.26, type = "square") {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(level, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /* ---------------------------------------------------------- lobby loop --- */

  /* One bar per chord, scheduled a little ahead of the clock. */
  function scheduleBar(barIndex, at) {
    const chord = PROG[barIndex % PROG.length];
    const bar = BEAT * 4;

    pad(chord.root / 2, at, bar, 0.26);
    pad(chord.third, at, bar, 0.15);
    pad(chord.fifth, at, bar, 0.15);

    drum(at, 66, 0.34);
    drum(at + BEAT * 2.5, 60, 0.2);

    /* The motif enters only on the back half of the loop, so it does not nag. */
    const phrase = barIndex % PROG.length === 2 ? MOTIF_A : barIndex % PROG.length === 3 ? MOTIF_B : null;
    if (phrase) {
      for (const [deg, beat] of phrase) {
        brass(semi(chord.root * 2, deg), at + beat * BEAT, BEAT * 0.62, 0.3);
      }
    }
  }

  function pump() {
    if (!loopOn || !ctx) return;
    const bar = BEAT * 4;
    while (nextTime < ctx.currentTime + 0.4) {
      scheduleBar(step, nextTime);
      step++;
      nextTime += bar;
    }
    timer = setTimeout(pump, 120);
  }

  function lobbyStart() {
    if (!enabled || loopOn) return;
    if (!ensure()) return;
    /* Nothing is audible until a gesture has unlocked the context; the arm()
       listeners will call back here once one arrives. */
    if (ctx.state !== "running") { ctx.resume().catch(() => {}); return; }
    loopOn = true;
    step = 0;
    nextTime = ctx.currentTime + 0.12;
    pump();
  }

  function lobbyStop() {
    loopOn = false;
    clearTimeout(timer);
  }

  /* ------------------------------------------------------------ stingers --- */

  function at0() {
    if (!enabled || !ensure()) return null;
    if (ctx.state === "suspended") ctx.resume();
    return ctx.currentTime + 0.01;
  }

  /** Rising pips for 3, 2, 1. */
  function tick(n) {
    const t = at0();
    if (t === null) return;
    const map = { 3: 523.25, 2: 587.33, 1: 659.25 };
    blip(map[n] || 523.25, t, 0.14, 0.34, "square");
  }

  /** The go: a short rising brass hit over a drum. */
  function go() {
    const t = at0();
    if (t === null) return;
    lobbyStop();
    drum(t, 72, 0.34);
    brass(A2 * 2, t, 0.3, 0.34);
    brass(A2 * 3, t + 0.1, 0.34, 0.3);
    brass(A2 * 4, t + 0.2, 0.5, 0.28);
  }

  /** Solved: an ascending figure, brighter the fewer guesses it took. */
  function solve(tries = 3) {
    const t = at0();
    if (t === null) return;
    const notes = tries <= 2 ? [0, 4, 7, 12] : tries <= 4 ? [0, 4, 7] : [0, 3, 7];
    notes.forEach((n, i) => blip(semi(440, n), t + i * 0.08, 0.18, 0.32, "triangle"));
    drum(t, 80, 0.14);
  }

  /** Missed, or timed out: two descending thuds. */
  function fail() {
    const t = at0();
    if (t === null) return;
    blip(196, t, 0.24, 0.3, "sawtooth");
    blip(146.83, t + 0.14, 0.36, 0.27, "sawtooth");
  }

  /** A quiet click when a letter lands. */
  function key() {
    const t = at0();
    if (t === null) return;
    blip(1200, t, 0.035, 0.1, "square");
  }

  /* --------------------------------------------------------------- toggle --- */

  /** Play a few bars on demand, so the host can confirm sound without a lobby. */
  function demo() {
    if (!enabled || !ensure()) return false;
    if (ctx.state !== "running") { ctx.resume().catch(() => {}); return false; }
    const at = ctx.currentTime + 0.05;
    const bar = BEAT * 4;
    for (let i = 0; i < 2; i++) scheduleBar(i + 2, at + i * bar);
    return true;
  }

  function isOn() { return enabled; }

  function setOn(on) {
    enabled = !!on;
    try { localStorage.setItem(LS_KEY, enabled ? "1" : "0"); } catch (e) { /* private mode */ }
    if (!enabled) {
      lobbyStop();
      if (ctx) master.gain.value = 0;
    } else {
      if (ensure()) {
        if (ctx.state === "suspended") ctx.resume();
        master.gain.value = BUS;
      }
    }
    return enabled;
  }

  /** A short rising confirmation, so switching it on is audibly obvious. */
  function confirmOn() {
    const t = at0();
    if (t === null) return;
    [0, 5, 12].forEach((n, i) => blip(semi(523.25, n), t + i * 0.07, 0.16, 0.34, "triangle"));
  }

  /**
   * The header control. `wantsLobby` says whether the bed should be playing right
   * now -- checked on every press, not only at render, so switching sound on
   * while the lobby is already up starts the music rather than waiting for the
   * next repaint.
   */
  function button(el, wantsLobby) {
    if (!el) return;
    wantsLobbyFn = wantsLobby || null;
    const paint = () => {
      el.setAttribute("aria-pressed", String(enabled));
      el.textContent = !enabled ? "Sound off" : running() ? "Sound on" : "Sound on - tap";
      el.classList.toggle("locked", enabled && !running());
    };
    repaint = paint;

    el.onclick = () => {
      ensure();
      /* On but locked: this press is the gesture, so unlock rather than mute. */
      if (enabled && ctx && ctx.state !== "running") {
        ctx.resume().then(() => {
          paint();
          confirmOn();
          if (wantsLobbyFn && wantsLobbyFn()) lobbyStart();
        }).catch(paint);
        return;
      }
      setOn(!enabled);
      paint();
      if (enabled) {
        confirmOn();
        if (wantsLobbyFn && wantsLobbyFn()) lobbyStart();
      }
    };

    paint();
    arm(wantsLobby);
  }

  window.Sfx = { isOn, running, arm, setOn, button, confirmOn, demo, state: () => (ctx ? ctx.state : "none"), lobbyStart, lobbyStop, tick, go, solve, fail, key };
})();

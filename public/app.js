/*
 * Player client. It holds no answers and keeps no authority: every guess goes to
 * the server, which marks it, runs the clock and decides when a word is over.
 * This file only draws whatever the server last said.
 */
(() => {
  "use strict";

  const KB = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "DEL"],
  ];
  const LS_NAME = "marvelQuiz.name";

  let state = null;      // last payload from the server
  let typed = "";        // letters in the row being typed
  let clockSkew = 0;     // serverNow - Date.now(), so countdowns match the server
  let shake = false;
  let busy = false;
  let toastTimer = 0;
  let hadJoined = false;   // a reset deletes the server-side player, so remember
  let lastTick = null;     // last countdown second announced, so each pips once
  let lastPhase = null;    // to fire the go sting exactly once
  let lastOutcome = -1;    // puzzle index whose result has already been celebrated
  let wasEjected = false;  // the host reset while we were in, so say so
  let autoNextFor = -1;    // index already queued to advance, so it fires once
  let autoNextTimer = 0;
  let finalSeen = false;   // the last word's answer has had its moment on screen
  let stageSeen = null;    // which level of the session this page is showing

  const $ = (id) => document.getElementById(id);
  const view = $("view");
  const now = () => Date.now() + clockSkew;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function fmt(ms) {
    if (!ms || ms < 0) return "0:00";
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ----------------------------------------------------------------- art --- */

  /* The themed backdrop runs only on the waiting screens, where there is
     nothing to read and it has the stage to itself. */
  function setArt(on) {
    window.Theme?.setBackdrop(!!on);
  }

  /* ----------------------------------------------------------------- api --- */

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) throw Object.assign(new Error(data?.message || "Request failed"), { data, status: res.status });
    return data;
  }

  function adopt(payload) {
    if (!payload) return;
    if (typeof payload.serverNow === "number") clockSkew = payload.serverNow - Date.now();
    if (payload.joined !== false) hadJoined = true;
    /* The host moved everyone up a level. Without this the results screen from
       the level just played stays latched, and the new level's last word gets
       skipped straight past its answer. */
    if (typeof payload.stage === "number" && stageSeen !== null && payload.stage !== stageSeen) {
      clearTimeout(autoNextTimer);
      autoNextFor = -1;
      finalSeen = false;
      typed = "";
      lastOutcome = -1;
    }
    if (typeof payload.stage === "number") stageSeen = payload.stage;
    state = payload;
    /* Taking a letter shrinks the number of blanks, so trim anything already
       typed past the new count -- otherwise the row is full and unsubmittable. */
    if (state.current && state.current.status === "open" && state.current.length) {
      const room = freeSlots().length;
      if (typed.length > room) typed = typed.slice(0, room);
    }
    render();
  }

  /*
   * A host reset ejects everyone. The page drops back to the join screen and the
   * player has to opt in again deliberately -- it does not slip them back into
   * the lobby under their old name.
   */
  function onEjected() {
    clearTimeout(autoNextTimer);
    autoNextFor = -1;
    finalSeen = false;
    stageSeen = null;
    hadJoined = false;
    wasEjected = true;
    typed = "";
    lastTick = null;
    lastPhase = null;
    lastOutcome = -1;
  }

  /* ---------------------------------------------------------------- clock --- */

  function msLeft() {
    if (!state || !state.limitMs) return null;
    const c = state.current;
    if (!c || c.status !== "open" || !c.startedAt) return null;
    return Math.max(0, state.limitMs - (now() - c.startedAt));
  }
  function liveTotal() {
    if (!state) return 0;
    const c = state.current;
    if (!c || c.status !== "open" || !c.startedAt) return state.totalMs;
    /* totalMs already counted this word up to the server's snapshot. */
    const counted = c.ms || 0;
    const live = Math.max(0, now() - c.startedAt);
    const capped = state.limitMs ? Math.min(live, state.limitMs) : live;
    return state.totalMs - counted + capped;
  }
  function barPct() {
    const left = msLeft();
    if (left === null || !state.limitMs) return 100;
    return Math.max(0, Math.min(100, (left / state.limitMs) * 100));
  }
  function barClass() {
    const left = msLeft();
    if (left === null) return "";
    if (left <= 10000) return "crit";
    if (left <= 25000) return "warn";
    return "";
  }

  /* --------------------------------------------------------------- status --- */

  let connected = false;
  function setStatus() {
    const pill = $("statusPill"), txt = $("statusText");
    if (!pill) return;
    pill.className = "pill" + (connected ? " live" : " warn");
    pill.querySelector(".dot").className = "dot" + (connected ? " pulse" : "");
    txt.textContent = connected ? "Scoring live" : "Reconnecting";
  }

  /* --------------------------------------------------------------- render --- */

  function render() {
    if (!state) {
      view.innerHTML = `<div class="wrap-narrow"><div class="panel panel-pad"><p class="meta" style="margin:0">Loading…</p></div></div>`;
      return;
    }
    if (state.removed) return renderRemoved();
    if (state.joined === false || !state.name) return renderJoin();
    if (state.waiting) return renderLobby();
    if (state.counting) return renderCountdown();
    /* The last word still gets to show its answer and trivia before the results
       screen takes over -- it used to be skipped straight past. */
    if (state.done && finalSeen) return renderFinish();
    renderPlay();
  }

  function renderJoin() {
    setArt(true);
    const limit = state.limitMs;
    view.innerHTML = `
      <div class="wrap-narrow">
        ${wasEjected ? `<div class="ejected">
          <b>The host reset the quiz.</b> Everyone is out and the board is clear. Join again below when you're ready for the next run.
        </div>` : ""}
        <div class="panel panel-pad halftone">
          <h1 class="joinh1 letter" style="font-size:clamp(30px,9vw,40px);margin-bottom:12px">${state.puzzleCount} Marvel words.<br>Six guesses each.</h1>
          <p class="caption">Wordle rules &middot; every word has a clue${limit ? ` &middot; ${Math.round(limit / 1000)}s each` : ""} &middot; fastest breaks a tie</p>
          <label class="fieldlabel" for="nameInput">Your name for the scoreboard</label>
          <input type="text" id="nameInput" maxlength="28" autocomplete="nickname" spellcheck="false" placeholder="Your name or callsign" value="${esc(store(LS_NAME) || "")}">
          <div class="row"><button class="btn" id="joinBtn" type="button">Join the lobby</button></div>
          <p class="toast" id="toast"></p>
        </div>
      </div>`;
    const input = $("nameInput");
    const go = async () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return toast("Name first"); }
      store(LS_NAME, name);
      try {
        wasEjected = false;
        finalSeen = false;
        autoNextFor = -1;
        adopt(await api("/api/join", { name }));
        focusFirstKey();
      } catch (e) { toast(e.message); }
    };
    $("joinBtn").onclick = go;
    input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } };
    input.focus();
  }

  function renderLobby() {
    const limit = state.limitMs;
    setArt(true);
    view.innerHTML = `
      <div class="wrap-narrow">
        <div class="panel panel-pad halftone lobbyart" style="text-align:center">
          <div class="emblem-big">${window.ComicArt?.emblem(64) || ""}</div>
          <div class="lobbydots"><i></i><i></i><i></i></div>
          <h1 class="joinh1 letter" style="font-size:clamp(28px,8.5vw,38px);margin:14px 0 8px">${(state.stage || 1) > 1 ? `Level up, ${esc(state.name)}` : `You're in, ${esc(state.name)}`}</h1>
          ${state.levelName ? `<p class="cat" style="margin:0 0 4px">${esc(state.levelLabel || `Level ${state.level}`)} &middot; ${esc(state.levelName)}</p>` : ""}
          <p class="caption" style="display:inline-block">${(state.stage || 1) > 1
            ? `${state.overall ? state.overall.score : 0} points banked &mdash; this level adds to them`
            : "Waiting for the host &middot; no clock is running yet"}</p>
          <div class="hr"></div>
          <div class="statrow" style="justify-content:center">
            <div class="stat"><b class="mono-num">${state.puzzleCount}</b><span>Words</span></div>
            <div class="stat"><b class="mono-num">${state.maxTries}</b><span>Guesses each</span></div>
            <div class="stat"><b class="mono-num">${limit ? Math.round(limit / 1000) + "s" : "&infin;"}</b><span>Per word</span></div>
          </div>
          <p class="meta" style="margin:16px auto 0;max-width:34em">Green: right letter, right spot. Amber: right letter, wrong spot.</p>
        </div>
      </div>`;
  }

  function renderCountdown() {
    const left = Math.max(0, state.startsAt - now());
    const secs = Math.ceil(left / 1000);
    setArt(true);
    view.innerHTML = `
      <div class="wrap-narrow">
        <div class="panel panel-pad halftone lobbyart" style="text-align:center">
          <div class="cat" style="color:var(--red)">Get ready</div>
          <div class="burstwrap">
            ${window.ComicArt?.starburst({ spikes: 18, opacity: 0.2 }) || ""}
            <div class="bignum letter" id="bignum">${secs}</div>
          </div>
          <p class="meta" style="margin:0">First word in a moment. Six guesses, ${state.limitMs ? Math.round(state.limitMs / 1000) + " seconds" : "no limit"} on each.</p>
        </div>
      </div>`;
  }

  function renderPlay() {
    setArt(false);
    const c = state.current;
    const closed = c.status !== "open";
    const left = msLeft();
    view.innerHTML = `
      <div class="wrap-narrow">
        <div class="panel panel-pad">
          <div class="puzhead">
            <div class="counter mono-num">${c.index + 1}<small>of ${state.puzzleCount}</small></div>
            <div class="hintcol" style="min-width:0;flex:1 1 auto">
              <div class="cat">${c.tier ? `<span class="tier t${esc(c.tier.replace(/\s+/g, ""))}">${esc(c.tier)}</span>` : ""}${esc(c.category)} &middot; ${c.length} letters</div>
              <div class="hint">${esc(c.hint)}</div>
            </div>
            <div class="clockcol" style="text-align:right;flex:0 0 auto">
              ${state.limitMs ? `
                <div class="timebig cd ${barClass()}" id="cdClock">${fmt(left === null ? state.limitMs : left)}</div>
                <div class="cat" style="color:var(--muted)">Left on this word</div>
                <div class="mono-num" style="font-weight:900;font-size:14px;margin-top:5px" id="selfClock">${fmt(liveTotal())}</div>
                <div class="cat" style="color:var(--muted)">Total</div>`
              : `
                <div class="timebig" id="selfClock">${fmt(liveTotal())}</div>
                <div class="cat" style="color:var(--muted)">Your clock</div>`}
            </div>
          </div>
          ${state.limitMs && !closed ? `<div class="tbar ${barClass()}" id="tbar"><i style="width:${barPct()}%"></i></div>` : ""}
          ${!closed && c.bigHint ? `<p class="bighint">${esc(c.bigHint)}</p>` : ""}

          <div class="grid" id="grid" style="--len:${c.length}">${gridRows()}</div>
          ${!closed && freeSlots().length === 0
            ? `<p class="bighint">Every letter is placed &mdash; press Enter to send it.</p>` : ""}
          <p class="toast" id="toast"></p>
          ${closed ? outcome() : keyboard() + lifelines()}
        </div>
        <p class="meta" style="margin-top:12px">Greens stay put on your next guess &mdash; you only type the blanks.</p>
      </div>`;
    if (closed && c.index !== lastOutcome) {
      lastOutcome = c.index;
      const card = view.querySelector(".outcome");
      if (c.status === "win") {
        window.Sfx?.solve(c.tries);
        window.ComicArt?.pop(card, { text: c.tries <= 2 ? "Nailed it" : "Solved", fill: "var(--green)" });
      } else {
        window.Sfx?.fail();
        window.ComicArt?.pop(card, { text: c.timedOut ? "Time!" : "Missed", fill: "var(--red)" });
      }
    }
    if (closed) {
      $("nextBtn").onclick = goNext;
      /*
       * Every word carries on by itself, the last one included -- that one hands
       * over to the results screen. A miss gets longer, because the answer you
       * got wrong is the one worth reading.
       */
      if (autoNextFor !== c.index) {
        autoNextFor = c.index;
        clearTimeout(autoNextTimer);
        autoNextTimer = setTimeout(goNext, c.status === "win" ? 2600 : 4200);
      }
    } else {
      view.querySelectorAll(".key").forEach((b) => { b.onclick = () => press(b.dataset.key); });

      const rv = $("revealBtn");
      if (rv) rv.onclick = async () => {
        if (busy) return;
        busy = true; rv.disabled = true;
        try { adopt(await api("/api/reveal", {})); window.Sfx?.key(); }
        catch (e) { toast(e.message); }
        finally { busy = false; }
      };

      const hb = $("hintBtn");
      if (hb) hb.onclick = async () => {
        if (busy) return;
        busy = true; hb.disabled = true;
        try { adopt(await api("/api/bighint", {})); }
        catch (e) { toast(e.message); }
        finally { busy = false; }
      };

      const sk = $("skipBtn");
      if (sk) {
        let armed = false, timer = 0;
        sk.onclick = async () => {
          if (busy) return;
          if (!armed) {
            armed = true;
            sk.classList.add("armed");
            sk.innerHTML = "Tap again to give up";
            clearTimeout(timer);
            timer = setTimeout(() => { armed = false; render(); }, 5000);
            return;
          }
          clearTimeout(timer);
          busy = true; sk.disabled = true;
          try { typed = ""; adopt(await api("/api/skip", {})); window.Sfx?.fail(); }
          catch (e) { toast(e.message); }
          finally { busy = false; }
        };
      }
    }
  }

  /*
   * Every position whose letter is already settled, so `typed` holds only the
   * blanks and the guess is assembled from both when it is submitted.
   *
   * Two ways a position gets settled: a letter you were given or bought, and a
   * letter you landed green yourself. Both are known-correct for this word, so
   * neither is yours to type again -- a green used to vanish when the row
   * advanced and had to be retyped every single guess.
   */
  function knownAt() {
    const m = new Map();
    for (const r of state.current.rows || []) {
      for (let i = 0; i < r.marks.length; i++) if (r.marks[i] === "hit") m.set(i, r.guess[i]);
    }
    for (const r of state.current.revealed || []) m.set(r.i, r.ch);
    return m;
  }
  /** Which of those were handed over rather than earned, for the grid's benefit. */
  function givenAt() {
    return new Set((state.current.revealed || []).map((r) => r.i));
  }
  function freeSlots() {
    const known = knownAt();
    return Array.from({ length: state.current.length }, (_, i) => i).filter((i) => !known.has(i));
  }
  /** The word as it would be submitted right now, or null if still incomplete. */
  function assembled() {
    const known = knownAt();
    const slots = freeSlots();
    if (typed.length !== slots.length) return null;
    const out = new Array(state.current.length);
    for (const [i, ch] of known) out[i] = ch;
    slots.forEach((pos, k) => { out[pos] = typed[k]; });
    return out.join("");
  }

  function gridRows() {
    const c = state.current;
    const n = c.length;
    const known = knownAt();
    const given = givenAt();
    const slots = freeSlots();
    let html = "";
    for (let row = 0; row < state.maxTries; row++) {
      const done = c.rows[row];
      const isCur = !done && row === c.rows.length && c.status === "open";
      let cells = "";
      for (let k = 0; k < n; k++) {
        let cls = "tile", ch = "";
        if (done) {
          cls += " " + done.marks[k];
          ch = done.guess[k];
        } else if (isCur) {
          /* Settled letters sit in the row being typed only, not on every row
             below. A bought one carries the given marker; one you placed
             yourself is just green, because you earned it. */
          if (known.has(k)) {
            cls += given.has(k) ? " hit given" : " hit carried";
            ch = known.get(k);
          } else {
            const at = slots.indexOf(k);
            if (at >= 0 && typed[at]) { cls += " filled pop"; ch = typed[at]; }
          }
        }
        cells += `<div class="${cls}">${ch}</div>`;
      }
      html += `<div class="grid-row${isCur && shake ? " bad" : ""}" style="--len:${n}">${cells}</div>`;
    }
    return html;
  }

  function keyStates() {
    const st = {}, rank = { miss: 1, near: 2, hit: 3 };
    for (const [, ch] of knownAt()) st[ch] = "hit";
    for (const r of state.current.rows) {
      for (let k = 0; k < r.guess.length; k++) {
        const c = r.guess[k];
        if (!st[c] || rank[r.marks[k]] > rank[st[c]]) st[c] = r.marks[k];
      }
    }
    return st;
  }

  function keyboard() {
    const st = keyStates();
    return `<div class="kb">${KB.map((row) => `<div class="kb-row">${row.map((k) => {
      const wide = k.length > 1;
      const cls = "key" + (wide ? " wide" : st[k] ? " " + st[k] : "");
      return `<button class="${cls}" data-key="${k}" type="button" aria-label="${k === "DEL" ? "Delete" : k}">${k === "DEL" ? "⌫" : k}</button>`;
    }).join("")}</div>`).join("")}</div>`;
  }

  /*
   * Two ways out of a word you cannot get. A reveal keeps you in it and charges
   * time; a skip abandons it and spends one of a limited few. Giving up a solve
   * is the real cost of a skip, since solved count outranks time.
   */
  function lifelines() {
    const c = state.current;
    const cost = Math.round((state.revealCostMs || 0) / 1000);
    const left = state.skipsLeft ?? 0;
    const allowed = state.skipsAllowed ?? 0;
    return `<div class="lifelines">
      <button class="btn ghost sm" id="revealBtn" type="button" ${state.canReveal ? "" : "disabled"}>
        Another letter ${cost > 0 ? `<span class="cost">&minus;${cost}s</span>` : `<span class="cost">free</span>`}
      </button>
      ${!c.bigHint ? `<button class="btn ghost sm" id="hintBtn" type="button">Bigger hint <span class="cost">free</span></button>` : ""}
      ${allowed > 0 ? `<button class="btn ghost sm" id="skipBtn" type="button" ${left > 0 ? "" : "disabled"}>
        Skip it <span class="cost">${left} left</span>
      </button>` : ""}
      <p class="meta" style="flex:1 1 100%;margin:2px 0 0">A skip counts as missed.</p>
    </div>`;
  }

  async function goNext() {
    if (busy) return;
    clearTimeout(autoNextTimer);
    /* Nothing left to advance to: hand over to the results. */
    if (state && state.done) {
      finalSeen = true;
      render();
      return;
    }
    busy = true;
    try {
      typed = "";
      adopt(await api("/api/next", {}));
      focusFirstKey();
    } catch (e) {
      toast(e.message);
    } finally {
      busy = false;
    }
  }

  function outcome() {
    const c = state.current;
    const won = c.status === "win";
    return `<div class="outcome">
      <div class="cat" style="color:${won ? "var(--green)" : "var(--red)"}">
        ${won ? `Solved in ${c.tries} ${c.tries === 1 ? "guess" : "guesses"} &middot; ${fmt(c.ms)}`
              : c.skipped ? "Skipped" : c.timedOut ? "Time ran out" : "Out of guesses"}
      </div>
      <div class="answer-shout letter">${esc(c.answer || "")}</div>
      ${c.fact ? `<div class="fact">${esc(c.fact)}</div>` : ""}
      <div class="row">
        <button class="btn" id="nextBtn" type="button">${state.done ? "See my results" : "Go now"}</button>
        <span class="meta mono-num">${state.solved}/${state.puzzleCount} solved &middot; ${fmt(state.totalMs)} on the clock</span>
      </div>
      <p class="meta" style="margin:10px 0 0">${state.done
        ? "That was the last one. Results coming up."
        : `Carrying on by itself in ${won ? "a moment" : "a few seconds"} &mdash; no clock runs until the next word appears.`}</p>
    </div>`;
  }

  function renderFinish() {
    setArt(true);
    view.innerHTML = `
      <div class="wrap-narrow">
        <div class="panel panel-pad halftone">
          <div class="cat">${esc(state.levelLabel || "Level")} complete</div>
          <h1 class="joinh1 letter" style="font-size:clamp(30px,9vw,42px);margin:4px 0 12px">${state.solved} of ${state.puzzleCount} cracked</h1>
          <div class="statrow">
            <div class="stat"><b class="mono-num">${state.score ?? 0}</b><span>Points this level</span></div>
            <div class="stat"><b class="mono-num">${state.solved}/${state.puzzleCount}</b><span>Solved</span></div>
            <div class="stat"><b class="mono-num">${fmt(state.totalMs)}</b><span>Time this level</span></div>
            <div class="stat"><b class="mono-num">${state.guesses}</b><span>Guesses used</span></div>
          </div>
          ${(state.stage || 1) > 1 && state.overall ? `<div class="hr"></div>
          <div class="cat">Session so far &middot; ${state.stage} levels</div>
          <div class="statrow">
            <div class="stat"><b class="mono-num">${state.overall.score}</b><span>Points total</span></div>
            <div class="stat"><b class="mono-num">${state.overall.solved}/${state.overall.words}</b><span>Solved total</span></div>
            <div class="stat"><b class="mono-num">${fmt(state.overall.ms)}</b><span>Time total</span></div>
          </div>` : ""}
          <div class="recap">
            ${state.results.map((v, i) => `<div class="recap-card ${v > 0 ? "ok" : "no"}">
              <div class="w">#${i + 1}</div>
              <div class="t">${v > 0 ? v + "/" + state.maxTries : "missed"}</div>
            </div>`).join("")}
          </div>
          <div class="hr"></div>
          <p class="meta" style="margin:0">That's this level in. Standings are on the host's screen &mdash; keep this tab open: if the host moves everyone up a level, your points carry over and the next one starts here.</p>
      <p class="meta" style="margin:8px 0 0;opacity:.6;font-size:11px">build ${esc((state.build && state.build.sha) || "dev")}</p>
        </div>
      </div>`;
  }

  function renderRemoved() {
    view.innerHTML = `<div class="wrap-narrow"><div class="removedcard">
      <div class="cat" style="color:var(--red)">Out of the game</div>
      <h2 style="margin:4px 0 10px">The host removed you from this round</h2>
      <p class="meta" style="margin:0">Your score is off the leaderboard and nothing you do here counts. Have a word with whoever is running the quiz — if they let you back in, this page picks up where you left off.</p>
    </div></div>`;
  }

  /* ---------------------------------------------------------------- input --- */

  function toast(msg) {
    const t = $("toast");
    if (t) t.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { const n = $("toast"); if (n) n.textContent = ""; }, 1800);
  }

  function repaintGrid() {
    const g = $("grid");
    if (g) g.innerHTML = gridRows();
  }

  function focusFirstKey() {
    setTimeout(() => { const k = view.querySelector(".key"); if (k) k.focus(); }, 0);
  }

  function press(k) {
    if (!state || busy) return;
    const c = state.current;
    if (!c || c.status !== "open") return;
    if (k === "DEL") { typed = typed.slice(0, -1); return repaintGrid(); }
    if (k === "ENTER") return submit();
    /* Only the blank positions are yours to fill. */
    if (!/^[A-Z]$/.test(k) || typed.length >= freeSlots().length) return;
    typed += k;
    window.Sfx?.key();
    repaintGrid();
  }

  async function submit() {
    const c = state.current;
    const guess = assembled();
    if (guess === null) {
      const left = freeSlots().length - typed.length;
      shake = true; repaintGrid();
      setTimeout(() => { shake = false; repaintGrid(); }, 340);
      return toast(left === 1 ? "One more letter" : `${left} more letters`);
    }
    busy = true;
    try {
      const next = await api("/api/guess", { guess });
      typed = "";
      adopt(next);
      if (next.rejected === "closed") toast("Time was up on that one");
      if (state.current.status === "open") focusFirstKey();
    } catch (e) {
      toast(e.message);
      if (e.data?.error === "not_started" || e.data?.error === "counting_down") refresh();
    } finally {
      busy = false;
    }
  }

  document.addEventListener("keydown", (e) => {
    if (!state || state.removed || state.done) return;
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter") { e.preventDefault(); return press("ENTER"); }
    if (e.key === "Backspace") { e.preventDefault(); return press("DEL"); }
    const c = e.key.toUpperCase();
    if (/^[A-Z]$/.test(c)) { e.preventDefault(); press(c); }
  });

  /* ------------------------------------------------------- ticking clocks --- */

  /* The countdown runs on its own fast tick and hands over the instant it ends. */
  setInterval(() => {
    if (!state || !state.counting) return;
    const left = Math.max(0, state.startsAt - now());
    const el = $("bignum");
    if (el) {
      const secs = Math.ceil(left / 1000);
      const shown = Number(el.textContent);
      if (secs !== shown) {
        el.textContent = secs;
        el.classList.remove("kick");
        void el.offsetWidth;
        el.classList.add("kick");
      }
    }
    const secs = Math.ceil(left / 1000);
    if (secs !== lastTick && secs > 0 && secs <= 3) {
      lastTick = secs;
      window.Sfx?.tick(secs);
    }
    if (left <= 0) {
      if (lastPhase !== "go") { lastPhase = "go"; window.Sfx?.go(); }
      state.counting = false;
      refresh();
    }
  }, 120);

  setInterval(() => {
    /* Derived from the puzzle in hand rather than a flag, so a payload missing a
       field can never freeze the clocks again. */
    if (!state || state.removed || state.waiting || state.counting) return;
    const c = state.current;
    if (!c || c.status !== "open" || !c.startedAt) return;

    const self = $("selfClock");
    if (self) self.textContent = fmt(liveTotal());

    const left = msLeft();
    const cd = $("cdClock");
    if (cd && left !== null) { cd.textContent = fmt(left); cd.className = "timebig cd " + barClass(); }
    const bar = $("tbar");
    if (bar) {
      bar.className = "tbar " + barClass();
      if (bar.firstElementChild) bar.firstElementChild.style.width = barPct() + "%";
    }
    /* The server owns the timeout; ask it to settle the word the moment we
       believe the time is up, rather than guessing the outcome locally. */
    if (left === 0) refresh();
  }, 1000);

  /* --------------------------------------------------------------- refresh --- */

  let refreshing = false;
  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const next = await api("/api/state");
      if (next.joined === false && hadJoined) onEjected();
      adopt(next);
    } catch (e) {
      /* offline; the socket will nudge us when it reconnects */
    } finally {
      refreshing = false;
    }
  }

  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  window.addEventListener("focus", refresh);

  /* ------------------------------------------------------------- websocket --- */

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    let ws;
    try { ws = new WebSocket(`${proto}//${location.host}/ws`); } catch (e) { return setTimeout(connect, 4000); }
    ws.onopen = () => { connected = true; setStatus(); };
    ws.onclose = () => { connected = false; setStatus(); setTimeout(connect, 3000); };
    ws.onerror = () => { /* onclose follows */ };
    ws.onmessage = (ev) => {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === "theme") {
        window.Theme?.load();
        return;
      }
      if (msg.type === "ejected") {
        onEjected();
        refresh();
        return;
      }
      if (msg.type === "round" || msg.type === "removed" || msg.type === "reinstated") {
        typed = "";
        /* Flip to the countdown immediately rather than after a round trip. */
        if (msg.type === "round" && state && msg.phase === "running" && typeof msg.startsAt === "number") {
          clockSkew = msg.serverNow - Date.now();
          state.phase = "running";
          state.startsAt = msg.startsAt;
          state.waiting = false;
          state.counting = msg.startsAt > now();
          render();
          if (state.counting) return;   // the countdown tick fetches the first word
        }
        refresh();
      }
    };
  }

  const em = $("emblem");
  if (em) em.innerHTML = window.ComicArt?.emblem(26) || "";
  /* No lobby bed on a player's device -- a dozen handsets looping the same music
     a few milliseconds apart sounds like a fault. They get the effects. */
  window.Sfx?.button($("soundBtn"), () => false);

  setStatus();
  /* No title card on a player's device: it would cover the game they are playing.
     It belongs on the host's projected screen only. */
  window.Theme?.setIntroLoop?.(false);
  window.Theme?.load().then(() => render());
  refresh();
  connect();
})();

/*
 * Host portal. Reachable only behind the Cloudflare Access policy on /admin and
 * /api/admin, so there is no password handling here.
 *
 * Three screens: the join screen you project while people arrive, the live
 * leaderboard, and the word list for the next round.
 */
(() => {
  "use strict";

  const LIMITS = [0, 45000, 60000, 90000, 120000, 180000];
  /* Teaching example. Deliberately not one of the real answers. */
  const DEMO = { answer: "NEBULA", guesses: ["BANNER", "NEBULA"] };

  let board = null;
  let tab = "lobby";
  let clockSkew = 0;
  let connected = false;
  let words = null;
  let autoFlipped = false;   // jump to the leaderboard once, on the go
  let stopArt = null;
  let lastTick = null;
  let wentOnce = false;      // the go sting fires exactly once per round

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
  function limitLabel(ms) {
    return ms === 0 ? "Off" : ms < 60000 ? Math.round(ms / 1000) + "s" : (Math.round(ms / 6000) / 10) + " min";
  }

  /* The host screen is the one wired to the room's speakers, so this is where
     the lobby bed plays. Players' phones get effects only. */
  function setArt(on) {
    document.body.classList.toggle("art-on", !!on);
    if (on && !stopArt) stopArt = window.ComicArt?.backdrop(document.getElementById("backdrop")) || null;
    if (!on && stopArt) { stopArt(); stopArt = null; }
  }
  const inLobbyPhase = () => !!board && board.phase !== "running";

  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) throw Object.assign(new Error(data?.message || `Request failed (${res.status})`), { data });
    return data;
  }

  /* --------------------------------------------------------- client clock --- */

  function liveMs(p) {
    if (p.done || !p.curStartedAt) return p.totalMs;
    /* totalMs already includes this word up to the server snapshot. */
    const snapshot = board.serverNow - p.curStartedAt;
    const live = now() - p.curStartedAt;
    const cap = board.limitMs || Infinity;
    return p.totalMs - Math.min(Math.max(0, snapshot), cap) + Math.min(Math.max(0, live), cap);
  }

  function setStatus() {
    const pill = $("statusPill"), txt = $("statusText");
    pill.className = "pill" + (connected ? " live" : " warn");
    pill.querySelector(".dot").className = "dot" + (connected ? " pulse" : "");
    txt.textContent = connected ? "Live" : "Reconnecting";
  }

  /* -------------------------------------------------------------- shared  --- */

  function hostMsg(text, kind) {
    const el = $("hostMsg");
    if (el) { el.textContent = text || ""; el.className = kind || ""; }
  }

  /* Two-tap confirmation: no native dialogs, and nothing destructive on one click. */
  function wireDanger(btn, armedLabel, run) {
    const original = btn.textContent;
    let armed = false, timer = 0;
    const disarm = () => { armed = false; btn.textContent = original; btn.classList.remove("armed"); };
    btn.onclick = async () => {
      if (!armed) {
        armed = true;
        btn.textContent = armedLabel;
        btn.classList.add("armed");
        clearTimeout(timer);
        timer = setTimeout(disarm, 6000);
        return;
      }
      clearTimeout(timer);
      disarm();
      btn.disabled = true;
      btn.textContent = "Working";
      hostMsg("");
      try { await run(); }
      catch (e) { btn.disabled = false; btn.textContent = original; hostMsg(e.message, "err"); }
    };
  }

  function countdownLabel(ms) { return ms >= 60000 ? Math.round(ms / 60000) + " min" : Math.round(ms / 1000) + "s"; }

  function goStripMarkup() {
    const inLobby = board.phase !== "running";
    const counting = !inLobby && board.startsAt > now();
    const n = board.players.length;

    if (inLobby) {
      return `<div class="gostrip lobbyart">
        <span class="phasepill lobby">Lobby</span>
        <span class="gobadge">${window.ComicArt?.emblem(40) || ""}</span>
        <div class="grow">
          <h3>${n ? `${n} ${n === 1 ? "player" : "players"} waiting` : "Nobody has joined yet"}</h3>
          <p class="meta" style="margin:4px 0 0">No clocks are running. Everyone gets their first word at the same instant when you start.</p>
        </div>
        <div class="seg" style="margin:0" role="group" aria-label="Countdown length">
          ${board.countdownChoices.map((ms) => `<button data-cd="${ms}" aria-pressed="${ms === board.countdownMs}" type="button">${countdownLabel(ms)}</button>`).join("")}
        </div>
        <button class="btn" id="goBtn" type="button" ${n ? "" : "disabled"}>${n ? "Start the quiz" : "Waiting for players"}</button>
      </div>`;
    }

    if (counting) {
      return `<div class="gostrip">
        <span class="phasepill running">Counting in</span>
        <div class="grow burstwrap">
          ${window.ComicArt?.starburst({ spikes: 14, opacity: 0.14 }) || ""}
          <h3>Starting in <span class="mono-num" id="goCount">${Math.ceil((board.startsAt - now()) / 1000)}</span></h3>
          <p class="meta" style="margin:4px 0 0">Every player sees the same countdown. First word lands for all of them together.</p>
        </div>
      </div>`;
    }

    return `<div class="gostrip">
      <span class="phasepill running">Under way</span>
      <div class="grow">
        <h3>Running for <span class="mono-num" id="goElapsed">${fmt(now() - board.startsAt)}</span></h3>
        <p class="meta" style="margin:4px 0 0">Time since the go. Reset when you want to gather everyone in the lobby again.</p>
      </div>
    </div>`;
  }

  function settingsMarkup() {
    return `<div class="settings">
      <h4>Time limit per word</h4>
      <p class="meta" style="margin:0">Applies to everyone straight away. Run out on a word and it counts as missed — the full limit lands on that player's clock and they move on.</p>
      <div class="seg" style="margin:10px 0 0" role="group" aria-label="Time limit per word">
        ${LIMITS.map((ms) => `<button data-limit="${ms}" aria-pressed="${ms === board.limitMs}" type="button">${limitLabel(ms)}</button>`).join("")}
      </div>
    </div>`;
  }

  function blockedMarkup() {
    if (!board.blocked.length) return "";
    return `<div class="blocked-strip">
      <h4>${board.blocked.length} removed</h4>
      <div class="chips">${board.blocked.map((b) => `<span class="chip blocked">
        <span>${esc(b.name || "Unknown")}</span>
        <button class="kick" data-unkick="${esc(b.id)}" type="button">Let back in</button>
      </span>`).join("")}</div>
      <p class="meta" style="margin:10px 0 0">They see a "removed by the host" screen and stop scoring. A reset does not let them back in &mdash; only this button does.</p>
    </div>`;
  }

  function hostbarMarkup() {
    return `<div class="hostbar">
      <button class="btn ghost sm" id="resetBtn" type="button">Reset and kick everyone</button>
      <span class="meta">Clears the board and throws everyone out to the join screen &mdash; they each have to join again. Anyone you removed <b>stays removed</b>. Tap twice to confirm.</span>
      <p class="meta" id="hostMsg"></p>
    </div>`;
  }

  function wireControls(root) {
    root.querySelectorAll("[data-limit]").forEach((b) => {
      b.onclick = async () => {
        const ms = Number(b.dataset.limit);
        if (ms === board.limitMs) return;
        root.querySelectorAll("[data-limit]").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.limit) === ms)));
        try {
          await api("/api/admin/limit", { method: "POST", body: { limitMs: ms } });
          board.limitMs = ms;
          const est = $("estimate");
          if (est) est.innerHTML = estimate();
          hostMsg(ms ? `Time limit is now ${limitLabel(ms)} per word.` : "Time limit off.", "ok");
        }
        catch (e) { hostMsg(e.message, "err"); }
      };
    });

    root.querySelectorAll("[data-cd]").forEach((b) => {
      b.onclick = async () => {
        const ms = Number(b.dataset.cd);
        root.querySelectorAll("[data-cd]").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.cd) === ms)));
        board.countdownMs = ms;
        hostMsg(`Countdown set to ${countdownLabel(ms)}.`, "ok");
      };
    });

    const go = root.querySelector("#goBtn");
    if (go) go.onclick = async () => {
      go.disabled = true;
      go.textContent = "Starting";
      hostMsg("");
      try {
        await api("/api/admin/start", { method: "POST", body: { countdownMs: board.countdownMs } });
        autoFlipped = false;
      } catch (e) {
        go.disabled = false;
        go.textContent = "Start the quiz";
        hostMsg(e.message, "err");
      }
    };

    const rb = root.querySelector("#resetBtn");
    if (rb) wireDanger(rb, "Tap again to wipe the board", async () => {
      await api("/api/admin/reset", { method: "POST" });
      autoFlipped = false;
      hostMsg("Everyone is out and the board is clear. They need to join again.", "ok");
    });

    root.querySelectorAll("[data-kick]").forEach((b) => {
      const id = b.dataset.kick;
      wireDanger(b, "Tap again", async () => {
        await api("/api/admin/kick", { method: "POST", body: { playerId: id } });
        hostMsg("Removed. They can be let back in below.", "ok");
      });
    });

    root.querySelectorAll("[data-unkick]").forEach((b) => {
      b.onclick = async () => {
        b.disabled = true;
        try { await api("/api/admin/unkick", { method: "POST", body: { playerId: b.dataset.unkick } }); hostMsg("Back in. Their run picks up where it stopped.", "ok"); }
        catch (e) { b.disabled = false; hostMsg(e.message, "err"); }
      };
    });
  }

  /* --------------------------------------------------------------- lobby --- */

  function markDemo(guess) {
    const a = DEMO.answer, n = a.length, out = new Array(n).fill("miss"), pool = {};
    for (let i = 0; i < n; i++) {
      if (guess[i] === a[i]) out[i] = "hit";
      else pool[a[i]] = (pool[a[i]] || 0) + 1;
    }
    for (let i = 0; i < n; i++) {
      if (out[i] === "hit") continue;
      if (pool[guess[i]] > 0) { out[i] = "near"; pool[guess[i]]--; }
    }
    return out;
  }
  function exampleRow(i) {
    const g = DEMO.guesses[i], m = markDemo(g);
    return `<div class="exgrid">${g.split("").map((c, k) => `<div class="tile ${m[k]}">${c}</div>`).join("")}</div>`;
  }

  function renderLobby() {
    const url = board.publicUrl;
    const joined = board.players;
    setArt(inLobbyPhase());
    if (inLobbyPhase()) window.Sfx?.lobbyStart();
    view.innerHTML = `
      <div class="lobby">
        <div class="qrcard">
          <h3>Scan to play</h3>
          <p class="meta" style="margin:0 0 12px">Point your phone camera at this</p>
          <div class="qrwhite"><div id="qrbox"><img alt="QR code that opens the quiz" src="/api/admin/qr.svg?url=${encodeURIComponent(url)}"></div></div>
          <p class="qrurl">${esc(url)}</p>
          <div class="row" style="margin-top:10px">
            <a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener">Open it</a>
            <button class="btn ghost sm" id="copyLink" type="button">Copy link</button>
          </div>
          <p class="meta" style="margin:12px 0 0;text-align:left">No sign-in, no account. Any phone on any network can scan this and play.</p>
        </div>

        <div class="howto">
          <h3>How it works</h3>
          <ul class="steps">
            <li>${board.puzzleCount} Marvel words, four to eight letters. Each comes with a clue, so you don't need to have seen every film.</li>
            <li>Six guesses per word. Type a full-length word and press Enter.</li>
            <li><b>You're racing the clock.</b> Most words solved wins — if that ties, the fastest total time takes it.</li>
            <li>${board.limitMs
              ? `Each word is capped at <b>${Math.round(board.limitMs / 1000)} seconds</b>. A bar drains under the clue; when it empties that word is gone and the full ${Math.round(board.limitMs / 1000)}s lands on the total.`
              : `No cap per word — the only pressure is the running total.`}</li>
          </ul>

          <div class="exwrap">
            <div class="cat" style="margin-bottom:10px">Worked example &middot; the answer here was ${DEMO.answer}</div>
            <div class="exrow">
              ${exampleRow(0)}
              <div class="excap">First guess. <b>Amber</b> letters are in the word but in the wrong place. <b>Grey</b> isn't in the word at all — the second N is grey because there's only one N.</div>
            </div>
            <div class="exrow">
              ${exampleRow(1)}
              <div class="excap"><b>Green</b> is the right letter in the right place. Solved in two — and two guesses is quicker than six, so keep moving.</div>
            </div>
          </div>

          <div class="joined">
            <h4>${joined.length ? `${joined.length} ${joined.length === 1 ? "player in" : "players in"}` : "Waiting for the first player"}</h4>
            ${joined.length
              ? `<div class="chips">${joined.map((p) => `<span class="chip ${p.online ? "" : "off"}"><span>${esc(p.name)}</span></span>`).join("")}</div>
                 <p class="meta" style="margin:12px 0 0">Flip to the leaderboard when everyone's in. Nothing starts or stops — each person's clock runs from the moment they join.</p>`
              : `<p class="meta" style="margin:0">Names appear here as people scan and start their run.</p>`}
          </div>
        </div>
      </div>
      ${goStripMarkup()}
      ${settingsMarkup()}
      ${blockedMarkup()}
      ${hostbarMarkup()}`;

    const cp = $("copyLink");
    cp.onclick = async () => {
      try { await navigator.clipboard.writeText(url); cp.textContent = "Copied"; }
      catch (e) { cp.textContent = "Copy failed"; }
      setTimeout(() => { cp.textContent = "Copy link"; }, 2000);
    };
    wireControls(view);
  }

  /* --------------------------------------------------------- leaderboard --- */

  function pipClass(v, i, cur, done) {
    if (v > 0) return v <= 2 ? "pip w1" : v <= 4 ? "pip w2" : "pip w3";
    if (v === -1) return "pip lost";
    if (!done && i === cur) return "pip now";
    return "pip";
  }

  function renderBoard() {
    setArt(false);
    const list = board.players;
    const finished = list.filter((p) => p.done).length;
    const cracked = list.reduce((a, p) => a + p.solved, 0);
    const top3 = list.slice(0, 3);

    view.innerHTML = `
      ${goStripMarkup()}
      <div class="board-head">
        <h2>Live standings</h2>
        <span class="spacer"></span>
        <div class="statrow">
          <div class="stat"><b class="mono-num">${list.length}</b><span>Playing</span></div>
          <div class="stat"><b class="mono-num">${finished}</b><span>Finished</span></div>
          <div class="stat"><b class="mono-num">${cracked}</b><span>Words cracked</span></div>
        </div>
      </div>

      ${top3.length ? `<div class="podium">${top3.map((p, n) => `
        <div class="pod p${n + 1}">
          <div class="pos">${["1st", "2nd", "3rd"][n]}${p.done ? " &middot; finished" : ""}</div>
          <div class="nm">${esc(p.name)}</div>
          <div class="ln"><span>Solved <b>${p.solved}/${board.puzzleCount}</b></span><span>Time <b data-pid="${esc(p.id)}">${fmt(liveMs(p))}</b></span></div>
        </div>`).join("")}</div>` : ""}

      <div class="table-scroll">
        ${list.length ? `<table class="board">
          <thead><tr><th></th><th>Player</th><th>${board.puzzleCount} puzzles</th><th>Solved</th><th>Time</th><th>Guesses</th><th></th></tr></thead>
          <tbody>${list.map((p, n) => `<tr>
            <td class="rank mono-num ${n === 0 ? "top" : ""}">${n + 1}</td>
            <td><div class="who-name">${esc(p.name)}</div><div class="who-sub">${board.phase !== "running" ? "In the lobby" : (p.done ? "Finished" : (p.online ? "On puzzle " + (p.idx + 1) : "Away &middot; puzzle " + (p.idx + 1)))}${p.late ? `<span class="golate" title="Joined after the go, so their clock started later">late</span>` : ""}</div></td>
            <td><div class="pips">${p.results.map((v, i) => `<div class="${pipClass(v, i, p.idx, p.done)}" title="Puzzle ${i + 1}"></div>`).join("")}</div></td>
            <td class="score mono-num">${p.solved}</td>
            <td class="t-cell ${p.done ? "done" : ""}" data-pid="${esc(p.id)}">${fmt(liveMs(p))}</td>
            <td class="mono-num" style="color:var(--muted)">${p.guesses}</td>
            <td style="text-align:right"><button class="kick" data-kick="${esc(p.id)}" type="button">Remove</button></td>
          </tr>`).join("")}</tbody>
        </table>` : `<div class="empty-board"><strong>Nobody has joined yet</strong>Switch to the join screen and put the QR code up.</div>`}
      </div>

      <div class="legend">
        <span><i style="background:var(--green)"></i>1&ndash;2 guesses</span>
        <span><i style="background:color-mix(in srgb,var(--green) 72%,var(--surface))"></i>3&ndash;4</span>
        <span><i style="background:var(--gold)"></i>5&ndash;6</span>
        <span><i style="background:var(--red)"></i>missed</span>
        <span><i style="border:2px solid var(--ink)"></i>in progress</span>
      </div>

      ${settingsMarkup()}
      ${blockedMarkup()}
      ${hostbarMarkup()}
      <div class="notice">Ranking: most words solved, then fastest total time, then fewest guesses. Times are measured and enforced on the server, and tick live while someone is mid-word.</div>`;
    wireControls(view);
  }

  /* --------------------------------------------------------------- words --- */

  async function renderWords() {
    view.innerHTML = `<div class="panel panel-pad"><p class="meta" style="margin:0">Loading the word list…</p></div>`;
    try { words = (await api("/api/admin/words")).puzzles; }
    catch (e) {
      view.innerHTML = `<div class="panel panel-pad"><p class="meta" style="margin:0;color:var(--red)">${esc(e.message)}</p></div>`;
      return;
    }
    view.innerHTML = `
      <div class="panel panel-pad">
        <h2 style="font-size:27px">Word list</h2>
        <p class="meta" style="margin:8px 0 14px">Answers are 4 to 8 letters, A&ndash;Z only, and a clue must not contain its own answer. Saving takes effect on the <b>next reset</b>, so a round in progress is never disturbed.</p>
        <label class="fieldlabel" for="wordsBox">${words.length} puzzles, as JSON</label>
        <textarea id="wordsBox" spellcheck="false">${esc(JSON.stringify(words, null, 2))}</textarea>
        <div class="row">
          <button class="btn" id="saveWords" type="button">Save word list</button>
          <span class="meta" id="wordsMsg"></span>
        </div>
      </div>`;
    $("saveWords").onclick = async () => {
      const msg = $("wordsMsg");
      let parsed;
      try { parsed = JSON.parse($("wordsBox").value); }
      catch (e) { msg.textContent = "That isn't valid JSON: " + e.message; msg.style.color = "var(--red)"; return; }
      try {
        const out = await api("/api/admin/words", { method: "PUT", body: { puzzles: parsed } });
        msg.textContent = out.message;
        msg.style.color = "var(--green)";
      } catch (e) {
        msg.textContent = e.message;
        msg.style.color = "var(--red)";
      }
    };
  }

  /* ---------------------------------------------------------------- tabs --- */

  function paint() {
    $("tabLobby").setAttribute("aria-pressed", String(tab === "lobby"));
    $("tabBoard").setAttribute("aria-pressed", String(tab === "board"));
    $("tabWords").setAttribute("aria-pressed", String(tab === "words"));
    $("tabBoard").innerHTML = `Leaderboard${board && board.players.length ? ` <span class="countbadge">${board.players.length}</span>` : ""}`;
    if (tab === "words") return renderWords();
    if (!board) {
      view.innerHTML = `<div class="panel panel-pad"><p class="meta" style="margin:0">Connecting…</p></div>`;
      return;
    }
    if (tab === "lobby") renderLobby(); else renderBoard();
  }

  $("tabLobby").onclick = () => { tab = "lobby"; paint(); };
  $("tabBoard").onclick = () => { tab = "board"; paint(); };
  $("tabWords").onclick = () => { tab = "words"; paint(); };

  /* Patch only the time cells each second, so the QR never flickers. */
  setInterval(() => {
    if (!board || tab === "words") return;

    document.querySelectorAll("[data-pid]").forEach((el) => {
      const p = board.players.find((x) => x.id === el.dataset.pid);
      if (p) el.textContent = fmt(liveMs(p));
    });

    if (board.phase === "running" && board.startsAt) {
      const left = board.startsAt - now();
      const secs = Math.ceil(left / 1000);
      if (left > 0 && secs !== lastTick && secs <= 3) {
        lastTick = secs;
        window.Sfx?.tick(secs);
      }
      if (left <= 0 && !wentOnce) {
        wentOnce = true;
        window.Sfx?.go();
      }
      const cnt = $("goCount");
      if (cnt) {
        if (left > 0) cnt.textContent = secs;
        else paint();           // countdown finished: redraw as "under way"
      }
      const el = $("goElapsed");
      if (el && left <= 0) el.textContent = fmt(-left);
    }
  }, 500);

  function adopt(next) {
    if (!next) return;
    clockSkew = next.serverNow - Date.now();
    board = next;
    /* The host clicked Go to watch, so bring the leaderboard up once. */
    if (board.phase === "running" && !autoFlipped) {
      autoFlipped = true;
      if (tab === "lobby") tab = "board";
    }
    if (board.phase !== "running") {
      autoFlipped = false;
      wentOnce = false;
      lastTick = null;
    }
    if (tab !== "words") paint();
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    let ws;
    try { ws = new WebSocket(`${proto}//${location.host}/ws/admin`); } catch (e) { return setTimeout(connect, 4000); }
    ws.onopen = () => { connected = true; setStatus(); };
    ws.onclose = () => { connected = false; setStatus(); setTimeout(connect, 3000); };
    ws.onmessage = (ev) => {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.type === "board") adopt(msg.board);
    };
  }

  const em = $("emblem");
  if (em) em.innerHTML = window.ComicArt?.emblem(26) || "";
  window.Sfx?.button($("soundBtn"), inLobbyPhase);

  setStatus();
  paint();
  api("/api/admin/board").then(adopt).catch((e) => {
    view.innerHTML = `<div class="panel panel-pad"><h2 style="font-size:25px">Admin sealed</h2><p class="meta" style="margin:8px 0 0">${esc(e.message)}</p></div>`;
  });
  connect();
})();

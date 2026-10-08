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
  /* The worked example is served by the server, which guarantees it is not a
     word anybody could be given. */
  const FALLBACK_DEMO = { answer: "FRIGGA", guesses: ["GARAGE", "FRIGGA"] };
  const demo = () => (board && board.demo) || FALLBACK_DEMO;

  let board = null;
  let tab = "lobby";
  let clockSkew = 0;
  let connected = false;
  let words = null;
  let autoFlipped = false;   // jump to the leaderboard once, on the go
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
    window.Theme?.setBackdrop(!!on);
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

  /*
   * The server sorts too, but it only sorts when something happens. Times tick on
   * every frame here, so the order is recomputed locally as well -- otherwise
   * someone overtaking on the clock would not move until the next player action.
   */
  function ranked() {
    return (board.players || []).slice().sort((a, b) =>
      (b.score - a.score) || (liveMs(a) - liveMs(b)) || (a.guesses - b.guesses));
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

  function levelOf(id) {
    return (board.levels || []).find((l) => l.id === id) || null;
  }

  /* Where this session has got to, once it is past the first level. */
  function stageLine() {
    const l = levelOf(board.level);
    const stage = board.stage || 1;
    return `${l ? l.label : "Level"}${l ? ` &middot; ${esc(l.name)}` : ""}${stage > 1 ? ` &middot; level ${stage} of the session` : ""}`;
  }

  function advanceLabel() {
    const climbing = board.nextLevel !== board.level;
    const nx = levelOf(board.nextLevel);
    return climbing ? `Move up to ${nx ? esc(nx.label) : "the next level"}` : "Play another level";
  }

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
          <p class="cat" style="margin:4px 0 0">${stageLine()}</p>
          <p class="meta" style="margin:4px 0 0">No clocks are running. Everyone gets their first word at the same instant when you start.${(board.stage || 1) > 1 ? " Points from the levels already played are still on the board." : ""}</p>
        </div>
        <div class="seg" style="margin:0" role="group" aria-label="Countdown length">
          ${board.countdownChoices.map((ms) => `<button data-cd="${ms}" aria-pressed="${ms === board.countdownMs}" type="button">${countdownLabel(ms)}</button>`).join("")}
        </div>
        <button class="btn" id="goBtn" type="button" ${n ? "" : "disabled"}>${n ? "Start the quiz" : "Waiting for players"}</button>
        <div class="introctl">
          ${window.Theme?.hasIntro?.() ? `
            <button class="btn ghost sm" id="introPlay" type="button">Play title card</button>
            <button class="soundbtn" id="introLoop" type="button" aria-pressed="${!!window.Theme?.introLooping?.()}">Loop it</button>` : ""}
          <button class="btn ghost sm" id="testSound" type="button">Test sound</button>
          <span class="meta" id="soundState"></span>
        </div>
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

    const still = board.players.filter((p) => !p.done).length;
    return `<div class="gostrip">
      <span class="phasepill running">Under way</span>
      <div class="grow">
        <h3>Running for <span class="mono-num" id="goElapsed">${fmt(now() - board.startsAt)}</span></h3>
        <p class="cat" style="margin:4px 0 0">${stageLine()}</p>
        <p class="meta" style="margin:4px 0 0">${still
          ? `${still} ${still === 1 ? "player is" : "players are"} still going.`
          : "Everyone has finished this level."} Moving up keeps every point on the board and nobody has to rejoin &mdash; they wait in the lobby for your next go.</p>
      </div>
      <button class="btn" id="advanceBtn" type="button">${advanceLabel()}</button>
    </div>`;
  }

  function lengthMarkup() {
    const running = board.phase === "running";
    const shared = board.expectedShared || 0;
    const pct = board.puzzleCount ? Math.round((shared / board.puzzleCount) * 100) : 0;
    return `<div class="settings">
      <h4>Level</h4>
      <p class="meta" style="margin:0">Start on Level 1 and move up as people warm up. Nothing is ever removed from the word list &mdash; the level just decides which end of it a round draws on. Mid-session, use <b>${advanceLabel()}</b> on the strip above rather than these buttons: it carries the leaderboard over, where these redraw the level everyone is waiting on.</p>
      <div class="seg" style="margin:10px 0 0" role="group" aria-label="Level">
        ${(board.levels || []).map((l) => `<button data-level="${l.id}" aria-pressed="${l.id === board.level}" type="button" ${board.phase === "running" ? "disabled" : ""}>${esc(l.label)}</button>`).join("")}
      </div>
      <p class="meta" style="margin:8px 0 0">${(() => {
        const l = (board.levels || []).find((x) => x.id === board.level);
        return l ? `<b>${esc(l.name)}</b> &mdash; draws on ${esc(l.tiers.join(" and "))}, ${l.available} words to choose from.` : "";
      })()}</p>

      <h4 style="margin-top:14px">Questions per round</h4>
      <p class="meta" style="margin:0">Each player gets their own draw from the pool of ${board.poolSize}, climbing the same difficulty curve on different words &mdash; so the person beside you is not on the same question.</p>
      <div class="seg" style="margin:10px 0 0" role="group" aria-label="Questions per round">
        ${(board.countChoices || []).map((n) => `<button data-count="${n}" aria-pressed="${n === board.puzzleCount}" type="button" ${running ? "disabled" : ""}>${n}</button>`).join("")}
      </div>
      ${running
        ? `<p class="meta" style="margin:10px 0 0">Locked while a round is under way &mdash; reset to change it.</p>`
        : `<p class="meta" style="margin:10px 0 0">At ${board.puzzleCount} questions two players will have roughly <b>${shared} words in common</b> (${pct}% of the round), because some tiers are shallow. Shorter rounds overlap less; adding words to the thin tiers below helps most.</p>`}
      <h4 style="margin-top:14px">How much help</h4>
      <p class="meta" style="margin:0">One setting for the lot. Players can always take as many letters as they like; this sets how many a word opens with and what another one costs.</p>
      <div class="seg" style="margin:10px 0 0" role="group" aria-label="How much help">
        ${(board.helpLevels || []).map((h) => `<button data-help="${esc(h.id)}" aria-pressed="${h.id === board.helpLevel}" type="button">${esc(h.label)}</button>`).join("")}
      </div>
      <p class="meta" style="margin:8px 0 0">${esc((board.helpLevels || []).find((h) => h.id === board.helpLevel)?.blurb || "")} A <b>Bigger hint</b> is always free: it gives the first and last letter, the vowel count, and whether a letter repeats.</p>

      <h4 style="margin-top:14px">Skips per player</h4>
      <p class="meta" style="margin:0">A skip gives a word up for lost. It counts as missed, so it costs a solve &mdash; which outranks any time saved. Buying a letter is unlimited instead, and costs <b>${Math.round((board.revealCostMs || 15000) / 1000)}s</b> off that word's clock each time.</p>
      <div class="seg" style="margin:10px 0 0" role="group" aria-label="Skips per player">
        ${(board.skipChoices || []).map((n) => `<button data-skips="${n}" aria-pressed="${n === board.skipsAllowed}" type="button">${n === 0 ? "None" : n}</button>`).join("")}
      </div>
      <div class="tierbars">
        ${(board.poolTiers || []).map((t) => `<span class="tierbar"><b>${esc(t.tier)}</b><i>${t.have}</i></span>`).join("")}
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
      <div class="row" style="margin-top:10px">
        <button class="btn ghost sm" id="clearRemoved" type="button">Clear the list</button>
        <span class="meta">They see a "removed by the host" screen and stop scoring. A removal lasts the rest of the round; a reset clears the list entirely.</span>
      </div>
    </div>`;
  }

  function hostbarMarkup() {
    return `<div class="hostbar">
      <button class="btn ghost sm" id="resetBtn" type="button">Reset and kick everyone</button>
      <button class="btn ghost sm" id="signOut" type="button">Sign out</button>
      <span class="meta">Clears the board, the removed list and everyone's session &mdash; they each have to join again from scratch. Tap twice to confirm. You do not need this to change level: <b>${advanceLabel()}</b> on the strip above keeps everyone and their points.</span>
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

    /* Two taps, because the level just played is banked and its words cleared --
       and anyone mid-word loses it. Not destructive like a reset, but not
       something to fire by brushing past it either. */
    const adv = root.querySelector("#advanceBtn");
    if (adv) {
      const still = board.players.filter((p) => !p.done).length;
      wireDanger(adv, still ? `Tap again (${still} still going)` : "Tap again to move up", async () => {
        const out = await api("/api/admin/advance", { method: "POST" });
        autoFlipped = false;
        hostMsg(`${out.levelName ? `Level ${out.level} - ${out.levelName}. ` : ""}${out.banked} ${out.banked === 1 ? "player keeps their" : "players keep their"} points${out.unfinished ? `, ${out.unfinished} had a word unfinished` : ""}. Press Start when they are ready.`, "ok");
      });
    }

    root.querySelectorAll("[data-level]").forEach((b) => {
      b.onclick = async () => {
        const id = Number(b.dataset.level);
        if (id === board.level) return;
        try { await api("/api/admin/level", { method: "POST", body: { level: id } }); hostMsg("Level changed. Everyone waiting gets a fresh draw.", "ok"); }
        catch (e) { hostMsg(e.message, "err"); }
      };
    });

    root.querySelectorAll("[data-count]").forEach((b) => {
      b.onclick = async () => {
        const n = Number(b.dataset.count);
        if (n === board.puzzleCount) return;
        try {
          await api("/api/admin/count", { method: "POST", body: { count: n } });
          hostMsg(`Round length is now ${n} questions. Everyone waiting gets a fresh draw.`, "ok");
        } catch (e) { hostMsg(e.message, "err"); }
      };
    });

    const ts = root.querySelector("#testSound");
    const ss = root.querySelector("#soundState");
    const sayState = () => {
      if (!ss) return;
      const on = window.Sfx?.isOn?.();
      const st = window.Sfx?.state?.() || "none";
      ss.textContent = !on
        ? "Sound is off - turn it on in the header"
        : st === "running"
          ? "Audio running"
          : `Audio ${st} - click anywhere to unlock`;
      ss.style.color = on && st === "running" ? "var(--green)" : "var(--gold)";
    };
    sayState();
    if (ts) ts.onclick = () => {
      if (!window.Sfx?.isOn?.()) {
        hostMsg("Turn Sound on in the header first, then press this.", "err");
        sayState();
        return;
      }
      const played = window.Sfx.demo();
      sayState();
      hostMsg(played ? "Playing two bars. If you hear nothing, check the system volume and output device."
                     : "Audio is still locked - click anywhere on the page, then press again.", played ? "ok" : "err");
    };

    const ip = root.querySelector("#introPlay");
    if (ip) ip.onclick = () => window.Theme?.playIntro?.();
    const il = root.querySelector("#introLoop");
    if (il) il.onclick = () => {
      const on = window.Theme?.setIntroLoop?.(!window.Theme?.introLooping?.());
      il.setAttribute("aria-pressed", String(!!on));
      hostMsg(on ? "Title card will replay on a loop while the lobby is up." : "Title card plays only when you press it.", "ok");
    };

    const cr = root.querySelector("#clearRemoved");
    if (cr) wireDanger(cr, "Tap again to clear", async () => {
      const out = await api("/api/admin/clear-removed", { method: "POST" });
      hostMsg(out.cleared ? `Cleared ${out.cleared} from the removed list.` : "Nothing to clear.", "ok");
    });

    root.querySelectorAll("[data-help]").forEach((b) => {
      b.onclick = async () => {
        const lvl = b.dataset.help;
        if (lvl === board.helpLevel) return;
        try { await api("/api/admin/help", { method: "POST", body: { help: lvl } }); hostMsg("Help level changed. It applies to the next word everyone opens.", "ok"); }
        catch (e) { hostMsg(e.message, "err"); }
      };
    });

    root.querySelectorAll("[data-skips]").forEach((b) => {
      b.onclick = async () => {
        const n = Number(b.dataset.skips);
        if (n === board.skipsAllowed) return;
        root.querySelectorAll("[data-skips]").forEach((x) => x.setAttribute("aria-pressed", String(Number(x.dataset.skips) === n)));
        try { await api("/api/admin/skips", { method: "POST", body: { skips: n } }); hostMsg(n ? `Players get ${n} skip${n === 1 ? "" : "s"}.` : "Skipping is off.", "ok"); }
        catch (e) { hostMsg(e.message, "err"); }
      };
    });

    const so = root.querySelector("#signOut");
    if (so) so.onclick = async () => {
      try { await api("/api/admin/logout", { method: "POST" }); } catch (e) { /* going anyway */ }
      location.replace("/admin");
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
    const a = demo().answer, n = a.length, out = new Array(n).fill("miss"), pool = {};
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
    const g = demo().guesses[i], m = markDemo(g);
    return `<div class="exgrid" style="--len:${g.length};grid-template-columns:repeat(${g.length},34px)">${
      g.split("").map((c, k) => `<div class="tile ${m[k]}">${c}</div>`).join("")}</div>`;
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
            <button class="btn sm" id="bigQrBtn2" type="button">Show full screen</button>
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
            <div class="cat" style="margin-bottom:10px">Worked example &middot; the answer here was ${esc(demo().answer)}</div>
            <div class="exrow">
              ${exampleRow(0)}
              <div class="excap">First guess. <b>Amber</b> letters are in the word but in the wrong place. <b>Grey</b> isn't in there at all &mdash; and the second A is grey because the answer only has one.</div>
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
      ${lengthMarkup()}
      ${settingsMarkup()}
      ${blockedMarkup()}
      ${hostbarMarkup()}`;

    const qb2 = $("bigQrBtn2");
    if (qb2) qb2.onclick = () => showQR(true);
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
    if (v === -2) return "pip skip";
    if (v === -1) return "pip lost";
    if (!done && i === cur) return "pip now";
    return "pip";
  }

  function renderBoard() {
    setArt(false);
    const list = ranked();
    const finished = list.filter((p) => p.done).length;
    const cracked = list.reduce((a, p) => a + p.solved, 0);
    const top3 = list.slice(0, 3);

    view.innerHTML = `
      ${goStripMarkup()}
      <div class="board-head">
        <h2>${list.length ? `${esc(list[0].name)} leads` : "Live standings"}</h2>
        <button class="btn ghost sm" id="bigQrBtn" type="button">Show QR</button>
        <button class="btn ghost sm" id="focusBtn" type="button">Focus</button>
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
          <div class="ln"><span>Points <b>${p.score}</b></span><span>Solved <b>${p.solved}/${p.words}</b></span></div>
          <div class="ln" style="margin-top:4px"><span>Time <b data-pid="${esc(p.id)}">${fmt(liveMs(p))}</b></span>${p.reveals || p.hints ? `<span>Used <b>${(p.reveals || 0) + (p.hints || 0)}</b></span>` : ""}</div>
        </div>`).join("")}</div>` : ""}

      <div class="table-scroll">
        ${list.length ? `<table class="board">
          <thead><tr><th></th><th>Player</th><th>${board.puzzleCount} this level</th><th>Points</th><th>Solved</th><th>Time</th><th>Guesses</th><th title="Words given up">Skipped</th><th title="Letters taken beyond the free ones">Letters</th><th title="Bigger hints asked for">Hints</th><th></th></tr></thead>
          <tbody>${list.map((p, n) => `<tr>
            <td class="rank mono-num ${n === 0 ? "top" : ""}">${n + 1}</td>
            <td><div class="who-name">${esc(p.name)}</div><div class="who-sub">${board.phase !== "running" ? "In the lobby" : (p.done ? "Finished" : (p.online ? "On puzzle " + (p.idx + 1) : "Away &middot; puzzle " + (p.idx + 1)))}${p.late ? `<span class="golate" title="Joined after the go, so their clock started later">late</span>` : ""}</div></td>
            <td><div class="pips">${p.results.map((v, i) => `<div class="${pipClass(v, i, p.idx, p.done)}" title="Puzzle ${i + 1}"></div>`).join("")}</div></td>
            <td class="score mono-num">${p.score}</td>
            <td class="mono-num" style="color:var(--muted)">${p.solved}/${p.words}</td>
            <td class="t-cell ${p.done ? "done" : ""}" data-pid="${esc(p.id)}">${fmt(liveMs(p))}</td>
            <td class="mono-num" style="color:var(--muted)">${p.guesses}</td>
            <td class="mono-num"><span class="useno ${p.skips ? "used" : ""}">${p.skips || 0}</span></td>
            <td class="mono-num"><span class="useno ${p.reveals ? "used" : ""}">${p.reveals || 0}</span></td>
            <td class="mono-num"><span class="useno ${p.hints ? "used" : ""}">${p.hints || 0}</span></td>
            <td style="text-align:right"><button class="kick" data-kick="${esc(p.id)}" type="button">Remove</button></td>
          </tr>`).join("")}</tbody>
        </table>` : `<div class="empty-board"><strong>Nobody has joined yet</strong>Switch to the join screen and put the QR code up.</div>`}
      </div>

      <div class="legend">
        <span><i style="background:var(--green)"></i>1&ndash;2 guesses</span>
        <span><i style="background:color-mix(in srgb,var(--green) 72%,var(--surface))"></i>3&ndash;4</span>
        <span><i style="background:var(--gold)"></i>5&ndash;6</span>
        <span><i style="background:var(--red)"></i>missed</span>
        <span><i style="background:repeating-linear-gradient(135deg,var(--muted) 0 3px,transparent 3px 6px)"></i>skipped</span>
        <span><i style="border:2px solid var(--ink)"></i>in progress</span>
      </div>

      <div class="hideinfocus">
        ${lengthMarkup()}
        ${settingsMarkup()}
        ${blockedMarkup()}
        ${hostbarMarkup()}
        <div class="notice">Ranking: <b>points</b>, then fastest time, then fewest guesses &mdash; all of it added up across every level this session has played, so moving up a level builds on the board rather than restarting it. A solved word is worth ${(board.scoring || {}).solved || 100}, plus ${(board.scoring || {}).perSpareGuess || 10} for each guess you did not need. A letter you chose to take costs ${(board.scoring || {}).perLetter || 15} and a bigger hint ${(board.scoring || {}).perHint || 10} &mdash; the letters the level hands out are free. A solve never drops below ${(board.scoring || {}).floor || 10}, so it always beats a miss. Times are measured and enforced on the server, and tick live while someone is mid-word. <b>Focus</b> (or the F key) strips this screen back to the board alone for sharing.
        <span style="opacity:.55">Running build <b>${esc((board.build && board.build.sha) || "dev")}</b>, made ${esc((board.build && board.build.at) || "?")}. If that is not your latest commit, rebuild: <code>./scripts/local.sh</code></span></div>
      </div>`;
    const fb = $("focusBtn");
    if (fb) fb.onclick = () => setFocus(true);
    const qb = $("bigQrBtn");
    if (qb) qb.onclick = () => showQR(true);
    wireControls(view);
  }

  /*
   * The QR used to live only on the Join screen, which the host view leaves as soon
   * as a round starts -- so the one thing latecomers need was behind a tab change.
   * This puts it on the whole display from either tab.
   */
  function showQR(on) {
    let el = $("qrFull");
    if (!on) { if (el) el.remove(); return; }
    if (el) return;
    const url = (board && board.publicUrl) || location.origin;
    el = document.createElement("div");
    el.id = "qrFull";
    el.innerHTML = `
      <div class="qrfull-inner">
        <div class="qrfull-code"><img alt="QR code to join the quiz" src="/api/admin/qr.svg?url=${encodeURIComponent(url)}"></div>
        <div class="qrfull-url">${esc(url)}</div>
        <div class="qrfull-hint">Scan to play &middot; press anywhere to close</div>
      </div>`;
    el.onclick = () => showQR(false);
    document.body.appendChild(el);
  }

  /*
   * Focus mode strips everything but the board and scales it up, because this
   * screen gets shared and the controls are nobody else's business.
   */
  function setFocus(on) {
    document.body.classList.toggle("focus-board", !!on);
    try { localStorage.setItem("marvelQuiz.focus", on ? "1" : "0"); } catch (e) {}
    let exit = $("exitFocus");
    if (on && !exit) {
      exit = document.createElement("button");
      exit.id = "exitFocus";
      exit.type = "button";
      exit.textContent = "Exit focus";
      exit.onclick = () => setFocus(false);
      document.body.appendChild(exit);
    }
    if (!on && exit) exit.remove();
  }

  document.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (e.key === "Escape") { showQR(false); if (document.body.classList.contains("focus-board")) setFocus(false); }
    if (e.key.toLowerCase() === "q" && !e.metaKey && !e.ctrlKey) showQR(!$("qrFull"));
    if (e.key.toLowerCase() === "f" && tab === "board" && !e.metaKey && !e.ctrlKey
        && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      setFocus(!document.body.classList.contains("focus-board"));
    }
  });

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

  /* -------------------------------------------------------------- themes --- */

  async function renderThemes() {
    view.innerHTML = `<div class="panel panel-pad"><p class="meta" style="margin:0">Loading themes...</p></div>`;
    let data;
    try { data = await api("/api/admin/themes"); }
    catch (e) {
      view.innerHTML = `<div class="panel panel-pad"><p class="meta" style="margin:0;color:var(--red)">${esc(e.message)}</p></div>`;
      return;
    }

    view.innerHTML = `
      <div class="panel panel-pad">
        <h2 style="font-size:27px">Themes</h2>
        <p class="meta" style="margin:8px 0 0">Changes the look for everyone at once, straight away &mdash; no reload, and it does not disturb a round in progress. The backgrounds are drawn in code, so they cost nothing to ship and scale to any screen.</p>
        <div class="themegrid">
          ${data.themes.map((t) => `
            <button class="themecard" type="button" data-theme="${esc(t.id)}" aria-pressed="${t.id === data.active}">
              <h5>${esc(t.name)}${t.id === data.active ? `<span class="live">live</span>` : ""}</h5>
              <p>${esc(t.blurb || "")}</p>
              <div class="swatches">
                ${["red", "gold", "green", "azure", "surface", "ink"].map((k) =>
                  `<i style="background:${esc(t.palette[k] || "var(--" + k + ")")}"></i>`).join("")}
              </div>
            </button>`).join("")}
        </div>
        <div class="hr"></div>
        <h4 style="font-size:17px;letter-spacing:.09em">Adding your own</h4>
        <p class="meta" style="margin:8px 0 0">Drop a JSON file into the data volume at <code>themes/</code> and it appears here on the next visit to this tab &mdash; no rebuild. It takes an <code>id</code>, a <code>name</code>, a <code>scene</code> (<code>comic</code> or <code>cosmic</code>), a <code>wordmark</code>, an optional <code>intro</code>, and a <code>palette</code> of hex colours. A <code>backdropImage</code> naming a file you put in <code>assets/</code> is layered behind the scene.</p>
        <p class="meta" style="margin:8px 0 0">The shipped scenes are original drawings, not anyone's footage. If you add artwork of your own, what you are entitled to use is your call.</p>
        <p class="meta" id="themeMsg" style="margin:12px 0 0"></p>
      </div>`;

    view.querySelectorAll("[data-theme]").forEach((b) => {
      b.onclick = async () => {
        const id = b.dataset.theme;
        if (b.getAttribute("aria-pressed") === "true") return;
        view.querySelectorAll("[data-theme]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        try {
          const out = await api("/api/admin/theme", { method: "POST", body: { id } });
          window.Theme?.apply(out.theme);
          const msg = $("themeMsg");
          if (msg) { msg.textContent = `Switched to ${out.theme.name}. Every open page has changed.`; msg.style.color = "var(--green)"; }
        } catch (e) {
          const msg = $("themeMsg");
          if (msg) { msg.textContent = e.message; msg.style.color = "var(--red)"; }
        }
      };
    });
  }

  /* ---------------------------------------------------------------- tabs --- */

  function paint() {
    $("tabLobby").setAttribute("aria-pressed", String(tab === "lobby"));
    $("tabBoard").setAttribute("aria-pressed", String(tab === "board"));
    $("tabWords").setAttribute("aria-pressed", String(tab === "words"));
    $("tabThemes").setAttribute("aria-pressed", String(tab === "themes"));
    $("tabBoard").innerHTML = `Leaderboard${board && board.players.length ? ` <span class="countbadge">${board.players.length}</span>` : ""}`;
    if (tab === "words") return renderWords();
    if (tab === "themes") return renderThemes();
    if (!board) {
      view.innerHTML = `<div class="panel panel-pad"><p class="meta" style="margin:0">Connecting…</p></div>`;
      return;
    }
    if (tab === "lobby") renderLobby(); else renderBoard();
  }

  $("tabLobby").onclick = () => { tab = "lobby"; paint(); };
  $("tabBoard").onclick = () => { tab = "board"; paint(); };
  $("tabWords").onclick = () => { tab = "words"; paint(); };
  $("tabThemes").onclick = () => { tab = "themes"; paint(); };

  /* Patch only the time cells each second, so the QR never flickers. */
  let shownOrder = [];

  setInterval(() => {
    if (!board || tab === "words" || tab === "themes") return;

    document.querySelectorAll("[data-pid]").forEach((el) => {
      const p = board.players.find((x) => x.id === el.dataset.pid);
      if (p) el.textContent = fmt(liveMs(p));
    });

    /* Re-sort as the clocks move, and only redraw when the order really changed. */
    if (tab === "board") {
      const order = ranked().map((p) => p.id).join(",");
      if (order !== shownOrder.join(",")) {
        const was = shownOrder;
        shownOrder = order ? order.split(",") : [];
        renderBoard();
        shownOrder.forEach((id, i) => {
          const before = was.indexOf(id);
          if (before > i) {
            const row = view.querySelector(`tr [data-pid="${CSS.escape(id)}"]`)?.closest("tr");
            if (row) { row.classList.add("movedup"); setTimeout(() => row.classList.remove("movedup"), 1200); }
          }
        });
      }
    }

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
    shownOrder = ranked().map((p) => p.id);
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
    if (tab !== "words" && tab !== "themes") paint();
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
      if (msg.type === "theme") { window.Theme?.load(); return; }
      if (msg.type === "board") adopt(msg.board);
    };
  }

  const em = $("emblem");
  if (em) em.innerHTML = window.ComicArt?.emblem(26) || "";
  window.Sfx?.button($("soundBtn"), inLobbyPhase);

  setStatus();
  window.Theme?.load();
  try { if (localStorage.getItem("marvelQuiz.focus") === "1") setFocus(true); } catch (e) {}
  paint();
  api("/api/admin/board").then(adopt).catch((e) => {
    view.innerHTML = `<div class="panel panel-pad"><h2 style="font-size:25px">Admin sealed</h2><p class="meta" style="margin:8px 0 0">${esc(e.message)}</p></div>`;
  });
  connect();
})();

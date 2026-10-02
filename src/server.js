import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import QRCode from "qrcode";

import { MAX_TRIES, clientMeta, validatePuzzles, buildSequence, expectedOverlap, TIER_ORDER, COUNT_CHOICES, DEMO } from "./words.js";
import { mark, resultCode, rowMs, compareEntries } from "./game.js";
import {
  requireAdmin, verifyAdmin, parseCookies, authMode, sealedMessage, passwordInfo,
  passwordConfigured, accessConfigured, insecureLocal,
  passwordMatches, mintSession, ADMIN_COOKIE, sessionMs,
  lockedFor, noteFailure, noteSuccess,
} from "./auth.js";
import * as store from "./db.js";
import { loadThemes, findTheme, reloadThemes } from "./themes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_URL = process.env.PUBLIC_URL || "https://quiz.fooxy.tv";
const COOKIE_SECURE = process.env.COOKIE_SECURE !== "false";
/* Longer options exist because a brutal word plus a letter reveal needs room. */
const LIMIT_CHOICES = [0, 45000, 60000, 90000, 120000, 180000, 240000, 300000];
const SKIP_CHOICES = [0, 1, 2, 3, 5];
/** What a revealed letter costs. Scales with the limit; flat when there is none. */
const revealCost = (limitMs) => (limitMs ? Math.max(10000, Math.round(limitMs / 6)) : 15000);
const COUNTDOWN_CHOICES = [3000, 5000, 10000, 30000];
const PID_COOKIE = "mwq_pid";
const BUILD = { sha: process.env.BUILD_SHA || "dev", at: process.env.BUILD_AT || "dev" };

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "64kb" }));
app.disable("x-powered-by");

/* ----------------------------------------------------------------- theme ---- */

const THEME_KEY = "theme";

function activeTheme() {
  return findTheme(store.DATA_DIR, store.getSetting(THEME_KEY, "comic"));
}

/* ---------------------------------------------------------------- players ---- */

function readPid(req) {
  const pid = parseCookies(req.headers.cookie)[PID_COOKIE];
  return /^[a-f0-9]{32}$/.test(pid || "") ? pid : null;
}

function issuePid(res) {
  const pid = crypto.randomBytes(16).toString("hex");
  res.cookie(PID_COOKIE, pid, {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    maxAge: 1000 * 60 * 60 * 24 * 30,
    path: "/",
  });
  return pid;
}

function cleanName(v) {
  return String(v == null ? "" : v)
    .replace(/\p{Cc}|\p{Cf}|\p{Zl}|\p{Zp}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28);
}

/* --------------------------------------------------------------- sequence ---- */

/**
 * The puzzles THIS player is playing, in their order. Everyone climbs the same
 * tier curve; the words differ, so a neighbour's screen is no help.
 */
function playerPuzzles(player, round, pool) {
  let seq = [];
  try { seq = JSON.parse(player.sequence || "[]"); } catch (e) { seq = []; }
  seq = seq.filter((i) => Number.isInteger(i) && i >= 0 && i < pool.length);
  if (!seq.length) {
    seq = buildSequence(pool, round.question_count);
    store.setPlayerSequence(player.id, seq);
  }
  return seq.map((i) => pool[i]);
}

/* ------------------------------------------------------------ player state ---- */

/**
 * The whole picture a player is allowed to see: their own grid, their clock, and
 * the puzzle they are on. Answers appear only for puzzles they have finished.
 */
function playerState(player, round, pool) {
  const puzzles = playerPuzzles(player, round, pool);
  const now = Date.now();
  const waiting = round.phase !== "running";
  const counting = !waiting && round.starts_at > now;
  const rows = new Map(store.allRows(player.id).map((r) => [r.puzzle_idx, r]));
  const limitMs = round.limit_ms;

  const results = [];
  let solved = 0, guesses = 0, totalMs = 0;
  for (let i = 0; i < puzzles.length; i++) {
    const r = rows.get(i);
    results.push(resultCode(r));
    if (r) {
      if (r.status === "win") solved++;
      guesses += r.tries;
      totalMs += rowMs(r, now, limitMs);
    }
  }

  const idx = Math.min(player.idx, puzzles.length - 1);
  const row = rows.get(idx) || null;
  const closed = !!row && row.status !== "open";
  const done = results.every((v) => v !== 0);

  let revealed = [];
  if (row) { try { revealed = JSON.parse(row.revealed || "[]"); } catch (e) { revealed = []; } }
  const answer = puzzles[idx].answer;

  const current = {
    ...clientMeta(puzzles[idx], idx),
    status: row ? row.status : "open",
    timedOut: !!(row && row.timed_out),
    skipped: !!(row && row.skipped),
    /* Only the letters bought so far, never the rest of the word. */
    revealed: revealed
      .filter((i) => Number.isInteger(i) && i >= 0 && i < answer.length)
      .map((i) => ({ i, ch: answer[i] })),
    tries: row ? row.tries : 0,
    /* Guesses are re-marked server-side so a reload restores the exact grid. */
    rows: row ? JSON.parse(row.guesses).map((g) => ({ guess: g, marks: mark(g, puzzles[idx].answer) })) : [],
    startedAt: row ? row.started_at : null,
    ms: row ? rowMs(row, now, limitMs) : 0,
    /* Only ever revealed once this puzzle is over. */
    answer: closed ? puzzles[idx].answer : null,
    fact: closed ? puzzles[idx].fact : null,
  };

  /* In the lobby, or mid-countdown, the clue is not the player's to see yet. */
  if (waiting || counting) {
    current.hint = null;
    current.category = null;
    current.length = null;
    current.rows = [];
    current.startedAt = null;
    current.ms = 0;
  }

  return {
    /* Every player payload carries this. It used to be added by /api/state
       alone, so after joining or guessing the client saw `undefined`, its clock
       tick bailed out, and both timers sat frozen for the whole game. */
    joined: true,
    round: round.id,
    phase: round.phase,
    startsAt: round.starts_at,
    countdownMs: round.countdown_ms,
    waiting,
    counting,
    limitMs,
    puzzleCount: puzzles.length,
    maxTries: MAX_TRIES,
    serverNow: now,
    name: player.name,
    removed: !!player.blocked,
    skipsAllowed: round.skips_allowed,
    skipsUsed: player.skips_used || 0,
    skipsLeft: Math.max(0, round.skips_allowed - (player.skips_used || 0)),
    revealCostMs: revealCost(round.limit_ms),
    /* A reveal always leaves at least one letter unknown. */
    canReveal: !!(row && row.status === "open" && revealed.length < puzzles[idx].answer.length - 1),
    done,
    idx,
    solved,
    guesses,
    totalMs,
    results,
    current,
    isLast: idx === puzzles.length - 1,
  };
}

/* ----------------------------------------------------------------- board ----- */

function buildBoard() {
  const round = store.activeRound();
  const puzzles = store.loadPuzzles();
  if (round.phase === "running" && round.starts_at <= Date.now()) {
    store.expireRound(round.id, round.limit_ms);
  }
  const now = Date.now();

  const count = round.question_count;
  const entries = store.roundPlayers(round.id).map((p) => {
    const rows = store.allRows(p.id);
    let solved = 0, guesses = 0, totalMs = 0, closedCount = 0;
    const results = new Array(count).fill(0);
    for (const r of rows) {
      if (r.puzzle_idx >= count) continue;
      results[r.puzzle_idx] = resultCode(r);
      if (r.status === "win") solved++;
      if (r.status !== "open") closedCount++;
      guesses += r.tries;
      totalMs += rowMs(r, now, round.limit_ms);
    }
    const current = rows.find((r) => r.puzzle_idx === p.idx && r.status === "open") || null;
    return {
      id: p.id,
      name: p.name,
      idx: Math.min(p.idx, count - 1),
      solved,
      guesses,
      totalMs,
      results,
      skips: p.skips_used || 0,
      reveals: p.reveals_used || 0,
      done: closedCount >= count,
      curStartedAt: current ? current.started_at : null,
      online: now - p.last_seen < 45000,
      joinedAt: p.joined_at,
      /* Someone who arrived after the go has their own, later start. */
      late: !!(round.starts_at && p.joined_at > round.starts_at + 1500),
      /* Wall clock from the shared go to their last finished word. */
      sinceGo: round.starts_at && round.starts_at <= now ? now - round.starts_at : 0,
    };
  });

  entries.sort(compareEntries);

  return {
    round: round.id,
    phase: round.phase,
    startsAt: round.starts_at,
    countdownMs: round.countdown_ms,
    countdownChoices: COUNTDOWN_CHOICES,
    countChoices: COUNT_CHOICES.filter((n) => n <= puzzles.length),
    skipChoices: SKIP_CHOICES,
    skipsAllowed: round.skips_allowed,
    revealCostMs: revealCost(round.limit_ms),
    limitMs: round.limit_ms,
    puzzleCount: count,
    poolSize: puzzles.length,
    poolTiers: TIER_ORDER.map((tier) => ({
      tier,
      have: puzzles.filter((p) => (p.tier || "").toUpperCase() === tier).length,
    })),
    demo: DEMO,
    build: BUILD,
    /* So the host can see whether the pool is deep enough for the length chosen. */
    expectedShared: Math.round(expectedOverlap(puzzles, count) * 10) / 10,
    maxTries: MAX_TRIES,
    serverNow: now,
    startedAt: round.started_at,
    players: entries,
    blocked: store.blockedPlayers(),
    publicUrl: PUBLIC_URL,
  };
}

/* ------------------------------------------------------------- public API ---- */

app.post("/api/join", (req, res) => {
  const name = cleanName(req.body?.name);
  if (!name) return res.status(400).json({ error: "name_required", message: "Pick a name for the scoreboard." });

  const round = store.activeRound();
  const puzzles = store.loadPuzzles();
  const pid = readPid(req) || issuePid(res);

  if (store.isBlocked(pid)) {
    store.upsertPlayer({ id: pid, roundId: round.id, name });
    return res.json(playerState(store.getPlayer(pid), round, puzzles));
  }

  const player = store.upsertPlayer({ id: pid, roundId: round.id, name });
  if (round.phase === "running") {
    /* Joining after the go: this player's own clock starts now, not at the go. */
    const mine = playerPuzzles(store.getPlayer(pid), round, puzzles);
    store.openRow(player.id, Math.min(player.idx, mine.length - 1));
  }
  broadcastBoard();
  res.json(playerState(store.getPlayer(pid), round, puzzles));
});

app.get("/api/theme", (req, res) => {
  res.set("Cache-Control", "no-store").json({ theme: activeTheme() });
});

app.get("/api/state", (req, res) => {
  const pid = readPid(req);
  const round = store.activeRound();
  const puzzles = store.loadPuzzles();
  const player = pid ? store.getPlayer(pid) : null;
  if (!player) {
    return res.json({
      joined: false,
      round: round.id,
      phase: round.phase,
      limitMs: round.limit_ms,
      puzzleCount: round.question_count,
      serverNow: Date.now(),
    });
  }
  store.touchPlayer(player.id);
  if (player.round_id !== round.id) {
    store.upsertPlayer({ id: player.id, roundId: round.id, name: player.name });
  }
  const fresh = store.getPlayer(player.id);
  if (!fresh.blocked && round.phase === "running") {
    const mine = playerPuzzles(fresh, round, puzzles);
    const idx = Math.min(fresh.idx, mine.length - 1);
    store.expireRow(fresh.id, idx, round.limit_ms);
    store.openRow(fresh.id, idx);
  }
  res.json(playerState(store.getPlayer(player.id), round, puzzles));
});

app.post("/api/guess", (req, res) => {
  const pid = readPid(req);
  const round = store.activeRound();
  const puzzles = store.loadPuzzles();
  const player = pid ? store.getPlayer(pid) : null;
  if (!player) return res.status(401).json({ error: "not_joined" });
  if (player.blocked) return res.status(403).json({ error: "removed" });

  store.touchPlayer(player.id);
  if (round.phase !== "running") {
    return res.status(409).json({ error: "not_started", message: "The host hasn't started the quiz yet." });
  }
  if (round.starts_at > Date.now()) {
    return res.status(409).json({ error: "counting_down", message: "Hold on — the countdown is still running." });
  }
  const mine = playerPuzzles(player, round, puzzles);
  const idx = Math.min(player.idx, mine.length - 1);
  const puzzle = mine[idx];

  /* The clock is the server's. An expired word closes before the guess counts. */
  store.expireRow(player.id, idx, round.limit_ms);
  const row = store.openRow(player.id, idx);
  if (row.status !== "open") {
    broadcastBoard();
    return res.json({ rejected: "closed", ...playerState(store.getPlayer(player.id), round, puzzles) });
  }

  const guess = String(req.body?.guess || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (guess.length !== puzzle.answer.length) {
    return res.status(400).json({
      error: "bad_length",
      message: `That word needs ${puzzle.answer.length} letters.`,
    });
  }

  const guesses = JSON.parse(row.guesses);
  guesses.push(guess);
  const tries = guesses.length;
  const won = guess === puzzle.answer;
  const out = won || tries >= MAX_TRIES;
  const elapsed = row.started_at ? Math.max(0, Date.now() - row.started_at) : 0;

  store.recordGuess(player.id, idx, {
    guesses,
    tries,
    status: out ? (won ? "win" : "lose") : "open",
    ms: out ? (round.limit_ms ? Math.min(elapsed, round.limit_ms) : elapsed) : 0,
    timedOut: false,
  });

  broadcastBoard();
  res.json(playerState(store.getPlayer(player.id), round, puzzles));
});

/* Buy a letter, paying in time. */
app.post("/api/reveal", (req, res) => {
  const pid = readPid(req);
  const round = store.activeRound();
  const puzzles = store.loadPuzzles();
  const player = pid ? store.getPlayer(pid) : null;
  if (!player) return res.status(401).json({ error: "not_joined" });
  if (player.blocked) return res.status(403).json({ error: "removed" });
  if (round.phase !== "running" || round.starts_at > Date.now()) {
    return res.status(409).json({ error: "not_started" });
  }

  const mine = playerPuzzles(player, round, puzzles);
  const idx = Math.min(player.idx, mine.length - 1);
  store.expireRow(player.id, idx, round.limit_ms);
  const row = store.openRow(player.id, idx);
  if (row.status !== "open") {
    return res.json(playerState(store.getPlayer(player.id), round, puzzles));
  }

  const answer = mine[idx].answer;
  let seen = [];
  try { seen = JSON.parse(row.revealed || "[]"); } catch (e) { seen = []; }
  const options = [];
  for (let i = 0; i < answer.length; i++) if (!seen.includes(i)) options.push(i);
  /* Never reveal the last unknown letter: the word still has to be typed. */
  if (options.length <= 1) {
    return res.status(409).json({ error: "no_more_letters", message: "No more letters to buy on this word." });
  }

  const pick = options[Math.floor(Math.random() * options.length)];
  store.revealLetter(player.id, idx, pick, revealCost(round.limit_ms));
  /* Paying may have used up the word's time outright. */
  store.expireRow(player.id, idx, round.limit_ms);
  store.touchPlayer(player.id);
  broadcastBoard();
  res.json(playerState(store.getPlayer(player.id), round, puzzles));
});

/* Give up on this word: it counts as missed and spends one skip. */
app.post("/api/skip", (req, res) => {
  const pid = readPid(req);
  const round = store.activeRound();
  const puzzles = store.loadPuzzles();
  const player = pid ? store.getPlayer(pid) : null;
  if (!player) return res.status(401).json({ error: "not_joined" });
  if (player.blocked) return res.status(403).json({ error: "removed" });
  if (round.phase !== "running" || round.starts_at > Date.now()) {
    return res.status(409).json({ error: "not_started" });
  }
  if ((player.skips_used || 0) >= round.skips_allowed) {
    return res.status(409).json({ error: "no_skips_left", message: "You have used all your skips." });
  }

  const mine = playerPuzzles(player, round, puzzles);
  const idx = Math.min(player.idx, mine.length - 1);
  store.expireRow(player.id, idx, round.limit_ms);
  const row = store.openRow(player.id, idx);
  if (row.status !== "open") {
    return res.json(playerState(store.getPlayer(player.id), round, puzzles));
  }
  const elapsed = row.started_at ? Math.max(0, Date.now() - row.started_at) : 0;
  store.skipRow(player.id, idx, round.limit_ms ? Math.min(elapsed, round.limit_ms) : elapsed);
  store.touchPlayer(player.id);
  broadcastBoard();
  res.json(playerState(store.getPlayer(player.id), round, puzzles));
});

app.post("/api/next", (req, res) => {
  const pid = readPid(req);
  const round = store.activeRound();
  const puzzles = store.loadPuzzles();
  const player = pid ? store.getPlayer(pid) : null;
  if (!player) return res.status(401).json({ error: "not_joined" });
  if (player.blocked) return res.status(403).json({ error: "removed" });
  if (round.phase !== "running" || round.starts_at > Date.now()) {
    return res.status(409).json({ error: "not_started" });
  }

  const mine = playerPuzzles(player, round, puzzles);
  const idx = Math.min(player.idx, mine.length - 1);
  store.expireRow(player.id, idx, round.limit_ms);
  const row = store.getRow(player.id, idx);
  if (row && row.status !== "open" && idx < mine.length - 1) {
    store.setPlayerIdx(player.id, idx + 1);
    store.openRow(player.id, idx + 1);
  }
  store.touchPlayer(player.id);
  broadcastBoard();
  res.json(playerState(store.getPlayer(player.id), round, puzzles));
});

/* -------------------------------------------------------------- admin API ---- */

app.get("/api/admin/board", requireAdmin, (req, res) => res.json(buildBoard()));

app.post("/api/admin/skips", requireAdmin, (req, res) => {
  const n = Number(req.body?.skips);
  if (!SKIP_CHOICES.includes(n)) return res.status(400).json({ error: "bad_skips" });
  const round = store.activeRound();
  store.setRoundSkips(round.id, n);
  broadcastRound();
  broadcastBoard();
  res.json({ ok: true, skips: n });
});

app.post("/api/admin/limit", requireAdmin, (req, res) => {
  const ms = Number(req.body?.limitMs);
  if (!LIMIT_CHOICES.includes(ms)) return res.status(400).json({ error: "bad_limit" });
  const round = store.activeRound();
  store.setRoundLimit(round.id, ms);
  broadcastRound();
  broadcastBoard();
  res.json({ ok: true, limitMs: ms });
});

app.post("/api/admin/start", requireAdmin, (req, res) => {
  const round = store.activeRound();
  if (round.phase === "running") {
    return res.status(409).json({ error: "already_running", message: "This round is already under way." });
  }
  const ms = Number(req.body?.countdownMs);
  const countdownMs = COUNTDOWN_CHOICES.includes(ms) ? ms : round.countdown_ms;
  const pool = store.loadPuzzles();
  const fresh = store.startRound(round.id, countdownMs, () => buildSequence(pool, round.question_count));
  broadcastRound();
  broadcastBoard();
  res.json({ ok: true, startsAt: fresh.starts_at, countdownMs });
});

app.post("/api/admin/count", requireAdmin, (req, res) => {
  const round = store.activeRound();
  if (round.phase === "running") {
    return res.status(409).json({
      error: "round_running",
      message: "Round length can only change in the lobby. Reset first.",
    });
  }
  const n = Number(req.body?.count);
  const pool = store.loadPuzzles();
  if (!COUNT_CHOICES.includes(n) || n > pool.length) {
    return res.status(400).json({ error: "bad_count", message: `Pick one of ${COUNT_CHOICES.filter((c) => c <= pool.length).join(", ")}.` });
  }
  store.setRoundCount(round.id, n);
  broadcastRound();
  broadcastBoard();
  res.json({ ok: true, count: n });
});

app.post("/api/admin/reset", requireAdmin, (req, res) => {
  const old = store.activeRound();
  store.wipeRound(old.id);
  /* A reset is a clean slate: the removed list goes too, so last session's
     ejections do not haunt the next one. Removing someone still sticks for the
     rest of the round they were removed from. */
  store.clearBlocklist();
  const fresh = store.newRound(old.limit_ms, old.countdown_ms, old.question_count, old.skips_allowed);
  /* Everyone is out, not merely cleared: every page returns to the join screen
     and has to opt back in. */
  broadcastAll({ type: "ejected", round: fresh.id });
  broadcastRound();
  broadcastBoard();
  res.json({ ok: true, round: fresh.id, blocked: store.blockedPlayers().length });
});

app.post("/api/admin/kick", requireAdmin, (req, res) => {
  const id = String(req.body?.playerId || "");
  if (!/^[a-f0-9]{32}$/.test(id)) return res.status(400).json({ error: "bad_player" });
  const victim = store.getPlayer(id);
  store.blockPlayer(id, victim ? victim.name : null);
  notifyPlayer(id, { type: "removed" });
  broadcastBoard();
  res.json({ ok: true });
});

app.post("/api/admin/unkick", requireAdmin, (req, res) => {
  const id = String(req.body?.playerId || "");
  if (!/^[a-f0-9]{32}$/.test(id)) return res.status(400).json({ error: "bad_player" });
  store.unblockPlayer(id);
  notifyPlayer(id, { type: "reinstated" });
  broadcastBoard();
  res.json({ ok: true });
});

app.post("/api/admin/clear-removed", requireAdmin, (req, res) => {
  const had = store.blockedPlayers().length;
  store.clearBlocklist();
  broadcastAll({ type: "reinstated" });
  broadcastBoard();
  res.json({ ok: true, cleared: had });
});

app.get("/api/admin/themes", requireAdmin, (req, res) => {
  reloadThemes();
  res.json({ themes: loadThemes(store.DATA_DIR), active: activeTheme().id });
});

app.post("/api/admin/theme", requireAdmin, (req, res) => {
  const id = String(req.body?.id || "");
  reloadThemes();
  const found = loadThemes(store.DATA_DIR).find((t) => t.id === id);
  if (!found) return res.status(400).json({ error: "unknown_theme", message: "No theme with that id." });
  store.setSetting(THEME_KEY, found.id);
  /* Every open page re-themes itself without a reload. */
  broadcastAll({ type: "theme", id: found.id });
  for (const ws of adminSockets) send(ws, { type: "theme", id: found.id });
  res.json({ ok: true, theme: found });
});

app.get("/api/admin/words", requireAdmin, (req, res) => {
  res.json({ puzzles: store.loadPuzzles() });
});

app.put("/api/admin/words", requireAdmin, (req, res) => {
  const [ok, result] = validatePuzzles(req.body?.puzzles);
  if (!ok) return res.status(400).json({ error: "bad_words", message: result });
  store.savePuzzles(result);
  res.json({ ok: true, count: result.length, message: "Saved. It takes effect on the next reset." });
});

app.get("/api/admin/qr.svg", requireAdmin, async (req, res) => {
  const target = String(req.query.url || PUBLIC_URL);
  if (!/^https?:\/\/[\w.-]+(:\d+)?(\/\S*)?$/.test(target)) return res.status(400).send("bad url");
  try {
    const svg = await QRCode.toString(target, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
    res.type("image/svg+xml").set("Cache-Control", "public, max-age=3600").send(svg);
  } catch (e) {
    res.status(500).send("qr failed");
  }
});

/* ------------------------------------------------------------ host login ---- */

const ADMIN_PAGE = path.join(__dirname, "../public/admin.html");
const LOGIN_PAGE = path.join(__dirname, "../public/login.html");

app.post("/api/admin/login", (req, res) => {
  const wait = lockedFor(req);
  if (wait > 0) {
    return res.status(429).json({
      error: "locked",
      message: `Too many attempts. Try again in ${Math.ceil(wait / 1000)}s.`,
      retryAfterMs: wait,
    });
  }
  if (!passwordConfigured) {
    return res.status(403).json({ error: "no_password", message: sealedMessage() });
  }
  if (!passwordMatches(req.body?.password)) {
    const rec = noteFailure(req);
    const left = Math.max(0, 5 - rec.fails);
    return res.status(401).json({
      error: "bad_password",
      message: left > 0
        ? `Wrong password. ${left} ${left === 1 ? "try" : "tries"} before a timeout.`
        : "Wrong password. Locked out for a while now.",
    });
  }
  noteSuccess(req);
  res.cookie(ADMIN_COOKIE, mintSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    maxAge: sessionMs,
    path: "/",
  });
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
  res.json({ ok: true });
});

/* ---------------------------------------------------------------- pages ----- */

/* Files the operator dropped in DATA_DIR/assets. Name only: no path traversal. */
app.get("/assets/:file", (req, res) => {
  const name = String(req.params.file || "").replace(/[^A-Za-z0-9._-]/g, "");
  if (!name || name === "." || name === "..") return res.status(404).end();
  res.sendFile(path.join(store.DATA_DIR, "assets", name), { maxAge: "1h" }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

app.get("/healthz", (req, res) =>
  res.json({ ok: true, round: store.activeRound().id, build: BUILD }));

/*
 * The static middleware below would otherwise hand out admin.html and login.html
 * by their raw filenames, skipping the check entirely -- so /admin.html served the
 * whole host shell to anyone, and landing on it looked like a broken host screen
 * rather than a login prompt. Both now come only through /admin.
 */
app.get(["/admin.html", "/login.html"], (req, res) => res.redirect(302, "/admin"));

/* Unauthenticated hosts get the login form, not a JSON refusal they cannot act on. */
app.get("/admin", async (req, res) => {
  /* Never cached: a revalidated copy of the login page after a successful login
     looks exactly like the password being rejected. */
  res.set("Cache-Control", "no-store, must-revalidate");
  const who = await verifyAdmin(req);
  if (who) return res.sendFile(ADMIN_PAGE, { cacheControl: false });
  if (passwordConfigured) return res.sendFile(LOGIN_PAGE, { cacheControl: false });
  res.status(403).type("text/plain").send(sealedMessage());
});

app.use(express.static(path.join(__dirname, "../public"), { index: "index.html" }));

/* ------------------------------------------------------------ websockets ---- */

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const adminSockets = new Set();
const playerSockets = new Map(); // pid -> Set<ws>

const FORBIDDEN = "HTTP/1.1 403 Forbidden";

server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/ws/admin") {
    const who = await verifyAdmin(req);
    if (!who) {
      socket.write(FORBIDDEN + "\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      adminSockets.add(ws);
      ws.on("close", () => adminSockets.delete(ws));
      send(ws, { type: "board", board: buildBoard() });
    });
    return;
  }

  if (url.pathname === "/ws") {
    const pid = parseCookies(req.headers.cookie)[PID_COOKIE];
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (/^[a-f0-9]{32}$/.test(pid || "")) {
        if (!playerSockets.has(pid)) playerSockets.set(pid, new Set());
        playerSockets.get(pid).add(ws);
        ws.on("close", () => {
          const set = playerSockets.get(pid);
          if (set) {
            set.delete(ws);
            if (!set.size) playerSockets.delete(pid);
          }
        });
      }
      const round = store.activeRound();
      send(ws, {
        type: "round",
        round: round.id,
        phase: round.phase,
        startsAt: round.starts_at,
        limitMs: round.limit_ms,
        serverNow: Date.now(),
      });
    });
    return;
  }

  socket.destroy();
});

function send(ws, payload) {
  if (ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      /* socket went away mid-send; the close handler cleans up */
    }
  }
}

let boardTimer = null;
/** Coalesce bursts: a dozen players guessing at once becomes one board push. */
function broadcastBoard() {
  if (boardTimer || !adminSockets.size) return;
  boardTimer = setTimeout(() => {
    boardTimer = null;
    if (!adminSockets.size) return;
    const payload = { type: "board", board: buildBoard() };
    for (const ws of adminSockets) send(ws, payload);
  }, 300);
}

function broadcastRound() {
  const round = store.activeRound();
  const payload = {
    type: "round",
    round: round.id,
    phase: round.phase,
    startsAt: round.starts_at,
    limitMs: round.limit_ms,
    serverNow: Date.now(),
  };
  for (const set of playerSockets.values()) {
    for (const ws of set) send(ws, payload);
  }
}

/** Every connected player page, whoever they are. */
function broadcastAll(payload) {
  for (const set of playerSockets.values()) {
    for (const ws of set) send(ws, payload);
  }
}

function notifyPlayer(pid, payload) {
  const set = playerSockets.get(pid);
  if (set) for (const ws of set) send(ws, payload);
}

/* Close abandoned words so the board never freezes on someone who wandered off. */
setInterval(() => {
  const round = store.activeRound();
  if (round.phase !== "running" || round.starts_at > Date.now()) return;
  if (store.expireRound(round.id, round.limit_ms) > 0) broadcastBoard();
}, 5000).unref();

server.listen(PORT, () => {
  console.log(`marvel-quiz listening on :${PORT}`);
  console.log(`  build        ${BUILD.sha}  ${BUILD.at}`);
  console.log(`  public url   ${PUBLIC_URL}`);
  console.log(`  data dir     ${store.DATA_DIR}`);
  console.log(`  pool         ${store.loadPuzzles().length} words`);
  console.log(`  theme        ${activeTheme().id}  (${loadThemes(store.DATA_DIR).length} available)`);
  const pw = passwordInfo();
  console.log(`  admin auth   ${authMode()}${pw.set ? `  (password is ${pw.length} characters as received)` : ""}`);
  if (pw.set && pw.warnings.length) {
    console.log("");
    console.log("  !! The password this process received looks mangled:");
    for (const w of pw.warnings) console.log(`     - ${w}`);
    console.log("     Compare that length with what you typed into .env. If it is shorter,");
    console.log("     the value was cut; quote it or use only letters and digits.");
    console.log("");
  }
  if (!passwordConfigured && !accessConfigured && !insecureLocal) {
    console.log("");
    console.log("  ****************************************************************");
    console.log("  *  No ADMIN_PASSWORD set, so the host screen is SEALED.         *");
    console.log("  *  Players can play; you cannot open the leaderboard.           *");
    console.log("  *  Set ADMIN_PASSWORD in .env and restart.                      *");
    console.log("  ****************************************************************");
    console.log("");
  }
  if (insecureLocal) {
    console.log("");
    console.log("  ****************************************************************");
    console.log("  *  ADMIN_INSECURE_LOCAL is on: anyone who can reach this port  *");
    console.log("  *  from a private address can open the host portal.            *");
    console.log("  *  For local testing only. It is ignored when NODE_ENV is      *");
    console.log("  *  production, which the deployed image sets.                  *");
    console.log("  ****************************************************************");
    console.log("");
  }
});

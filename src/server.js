import http from "node:http";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { WebSocketServer } from "ws";
import QRCode from "qrcode";

import { MAX_TRIES, clientMeta, validatePuzzles } from "./words.js";
import { mark, resultCode, rowMs, compareEntries } from "./game.js";
import { requireAdmin, verifyAdmin, parseCookies, accessConfigured } from "./auth.js";
import * as store from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_URL = process.env.PUBLIC_URL || "https://quiz.fooxy.tv";
const COOKIE_SECURE = process.env.COOKIE_SECURE !== "false";
const LIMIT_CHOICES = [0, 45000, 60000, 90000, 120000, 180000];
const COUNTDOWN_CHOICES = [3000, 5000, 10000, 30000];
const PID_COOKIE = "mwq_pid";

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "64kb" }));
app.disable("x-powered-by");

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

/* ------------------------------------------------------------ player state ---- */

/**
 * The whole picture a player is allowed to see: their own grid, their clock, and
 * the puzzle they are on. Answers appear only for puzzles they have finished.
 */
function playerState(player, round, puzzles) {
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

  const current = {
    ...clientMeta(puzzles[idx], idx),
    status: row ? row.status : "open",
    timedOut: !!(row && row.timed_out),
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

  const entries = store.roundPlayers(round.id).map((p) => {
    const rows = store.allRows(p.id);
    let solved = 0, guesses = 0, totalMs = 0, closedCount = 0;
    const results = new Array(puzzles.length).fill(0);
    for (const r of rows) {
      if (r.puzzle_idx >= puzzles.length) continue;
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
      idx: Math.min(p.idx, puzzles.length - 1),
      solved,
      guesses,
      totalMs,
      results,
      done: closedCount >= puzzles.length,
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
    limitMs: round.limit_ms,
    puzzleCount: puzzles.length,
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
    store.openRow(player.id, Math.min(player.idx, puzzles.length - 1));
  }
  broadcastBoard();
  res.json(playerState(store.getPlayer(pid), round, puzzles));
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
      limitMs: round.limit_ms,
      puzzleCount: puzzles.length,
      serverNow: Date.now(),
    });
  }
  store.touchPlayer(player.id);
  if (player.round_id !== round.id) {
    store.upsertPlayer({ id: player.id, roundId: round.id, name: player.name });
  }
  const fresh = store.getPlayer(player.id);
  if (!fresh.blocked && round.phase === "running") {
    const idx = Math.min(fresh.idx, puzzles.length - 1);
    store.expireRow(fresh.id, idx, round.limit_ms);
    store.openRow(fresh.id, idx);
  }
  res.json({ joined: true, ...playerState(store.getPlayer(player.id), round, puzzles) });
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
  const idx = Math.min(player.idx, puzzles.length - 1);
  const puzzle = puzzles[idx];

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

  const idx = Math.min(player.idx, puzzles.length - 1);
  store.expireRow(player.id, idx, round.limit_ms);
  const row = store.getRow(player.id, idx);
  if (row && row.status !== "open" && idx < puzzles.length - 1) {
    store.setPlayerIdx(player.id, idx + 1);
    store.openRow(player.id, idx + 1);
  }
  store.touchPlayer(player.id);
  broadcastBoard();
  res.json(playerState(store.getPlayer(player.id), round, puzzles));
});

/* -------------------------------------------------------------- admin API ---- */

app.get("/api/admin/board", requireAdmin, (req, res) => res.json(buildBoard()));

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
  const fresh = store.startRound(round.id, countdownMs);
  broadcastRound();
  broadcastBoard();
  res.json({ ok: true, startsAt: fresh.starts_at, countdownMs });
});

app.post("/api/admin/reset", requireAdmin, (req, res) => {
  const old = store.activeRound();
  store.wipeRound(old.id);
  const fresh = store.newRound(old.limit_ms, old.countdown_ms);
  broadcastRound();
  broadcastBoard();
  res.json({ ok: true, round: fresh.id });
});

app.post("/api/admin/kick", requireAdmin, (req, res) => {
  const id = String(req.body?.playerId || "");
  if (!/^[a-f0-9]{32}$/.test(id)) return res.status(400).json({ error: "bad_player" });
  store.blockPlayer(id);
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

/* ---------------------------------------------------------------- pages ----- */

app.get("/healthz", (req, res) => res.json({ ok: true, round: store.activeRound().id }));

app.get("/admin", requireAdmin, (req, res) => res.sendFile(path.join(__dirname, "../public/admin.html")));

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
  const authMode = accessConfigured
    ? "Cloudflare Access"
    : process.env.ADMIN_DEV_BYPASS === "1"
      ? "DEV BYPASS (loopback only)"
      : "SEALED - set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD";
  console.log(`marvel-quiz listening on :${PORT}`);
  console.log(`  public url   ${PUBLIC_URL}`);
  console.log(`  data dir     ${store.DATA_DIR}`);
  console.log(`  puzzles      ${store.loadPuzzles().length}`);
  console.log(`  admin auth   ${authMode}`);
});

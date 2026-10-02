import fs from "node:fs";
import path from "node:path";
import { BUILTIN_PUZZLES, validatePuzzles } from "./words.js";

/*
 * SQLite comes from Node itself (node:sqlite), so there is no native module to
 * compile. Present without a flag from Node 22.5; the image ships 24, which is
 * what gets tested. Resolved dynamically so an unsupported runtime produces an
 * instruction rather than a bare ERR_UNKNOWN_BUILTIN_MODULE stack.
 */
let DatabaseSync;
try {
  ({ DatabaseSync } = await import("node:sqlite"));
  if (typeof DatabaseSync !== "function") throw new Error("node:sqlite has no DatabaseSync");
} catch (cause) {
  console.error("");
  console.error("  Cannot start: this app stores data with Node's built-in SQLite (node:sqlite).");
  console.error(`  Running on Node ${process.version}. That module arrived in Node 22.5, and the`);
  console.error("  image ships Node 24, so a runtime this old means the image was not built");
  console.error("  from the Dockerfile in this repo.");
  console.error("");
  console.error("  On an early Node 22 it may need a flag:  node --experimental-sqlite src/server.js");
  console.error("");
  console.error("  In Docker this means the image was built on an old base. Rebuild pulling");
  console.error("  a fresh base image:");
  console.error("      ./scripts/local.sh        (local, already passes --pull)");
  console.error("      docker compose build --pull && docker compose up -d");
  console.error("");
  console.error(`  Underlying error: ${cause && cause.message}`);
  console.error("");
  process.exit(1);
}

export const DATA_DIR = process.env.DATA_DIR || "/data";
const DB_PATH = path.join(DATA_DIR, "quiz.sqlite");
const WORDS_PATH = path.join(DATA_DIR, "words.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA busy_timeout = 4000");

/* node:sqlite has no transaction() wrapper, so this is the explicit form. */
function tx(fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch (_) { /* already unwound */ }
    throw e;
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS rounds (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at   INTEGER NOT NULL,
    limit_ms     INTEGER NOT NULL,
    puzzle_count INTEGER NOT NULL,
    phase        TEXT NOT NULL DEFAULT 'lobby',
    starts_at    INTEGER,
    countdown_ms INTEGER NOT NULL DEFAULT 5000,
    question_count INTEGER NOT NULL DEFAULT 10,
    skips_allowed  INTEGER NOT NULL DEFAULT 3,
    help_level     TEXT NOT NULL DEFAULT 'helpful',
    level          INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS players (
    id        TEXT PRIMARY KEY,
    round_id  INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    idx       INTEGER NOT NULL DEFAULT 0,
    blocked   INTEGER NOT NULL DEFAULT 0,
    sequence  TEXT,
    skips_used INTEGER NOT NULL DEFAULT 0,
    reveals_used INTEGER NOT NULL DEFAULT 0,
    hints_used   INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS players_round ON players(round_id);
  CREATE TABLE IF NOT EXISTS progress (
    player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    puzzle_idx INTEGER NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open',
    timed_out  INTEGER NOT NULL DEFAULT 0,
    skipped    INTEGER NOT NULL DEFAULT 0,
    revealed   TEXT NOT NULL DEFAULT '[]',
    big_hint   INTEGER NOT NULL DEFAULT 0,
    free_letters INTEGER NOT NULL DEFAULT 0,
    tries      INTEGER NOT NULL DEFAULT 0,
    guesses    TEXT NOT NULL DEFAULT '[]',
    started_at INTEGER,
    ms         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, puzzle_idx)
  );
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS blocklist (
    player_id  TEXT PRIMARY KEY,
    blocked_at INTEGER NOT NULL,
    name       TEXT
  );
`);

/* Databases created before the lobby existed get the new columns added. */
function ensureColumn(table, name, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn("rounds", "phase", "phase TEXT NOT NULL DEFAULT 'lobby'");
ensureColumn("rounds", "starts_at", "starts_at INTEGER");
ensureColumn("rounds", "countdown_ms", "countdown_ms INTEGER NOT NULL DEFAULT 5000");
ensureColumn("blocklist", "name", "name TEXT");
ensureColumn("rounds", "question_count", "question_count INTEGER NOT NULL DEFAULT 20");
ensureColumn("players", "sequence", "sequence TEXT");
ensureColumn("rounds", "skips_allowed", "skips_allowed INTEGER NOT NULL DEFAULT 3");
ensureColumn("players", "skips_used", "skips_used INTEGER NOT NULL DEFAULT 0");
ensureColumn("progress", "skipped", "skipped INTEGER NOT NULL DEFAULT 0");
ensureColumn("progress", "revealed", "revealed TEXT NOT NULL DEFAULT '[]'");
ensureColumn("players", "reveals_used", "reveals_used INTEGER NOT NULL DEFAULT 0");
ensureColumn("rounds", "help_level", "help_level TEXT NOT NULL DEFAULT 'helpful'");
ensureColumn("rounds", "level", "level INTEGER NOT NULL DEFAULT 1");
ensureColumn("players", "hints_used", "hints_used INTEGER NOT NULL DEFAULT 0");
ensureColumn("progress", "big_hint", "big_hint INTEGER NOT NULL DEFAULT 0");
ensureColumn("progress", "free_letters", "free_letters INTEGER NOT NULL DEFAULT 0");

/* ---------- word list ---------- */

let puzzleCache = null;

export function loadPuzzles() {
  if (puzzleCache) return puzzleCache;
  try {
    const raw = fs.readFileSync(WORDS_PATH, "utf8");
    const [ok, result] = validatePuzzles(JSON.parse(raw));
    if (ok) {
      puzzleCache = result;
      return puzzleCache;
    }
    console.warn(`[words] ${WORDS_PATH} rejected: ${result}. Falling back to the built-in list.`);
  } catch (e) {
    if (e.code !== "ENOENT") console.warn(`[words] could not read ${WORDS_PATH}: ${e.message}`);
  }
  puzzleCache = BUILTIN_PUZZLES;
  return puzzleCache;
}

export function savePuzzles(list) {
  fs.writeFileSync(WORDS_PATH, JSON.stringify(list, null, 2));
  puzzleCache = list;
}

/* ---------- settings: small key/value state that outlives a round ---------- */

export function getSetting(key, fallback = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, String(value));
}

/* ---------- rounds ---------- */

const DEFAULT_LIMIT_MS = Number(process.env.DEFAULT_LIMIT_MS || 90000);

export function activeRound() {
  const row = db.prepare("SELECT * FROM rounds ORDER BY id DESC LIMIT 1").get();
  if (row) return row;
  return newRound(DEFAULT_LIMIT_MS);
}

export function newRound(limitMs, countdownMs = 5000, questionCount = 10, skipsAllowed = 3, helpLevel = "helpful", level = 1) {
  const puzzles = loadPuzzles();
  const count = Math.max(1, Math.min(questionCount, puzzles.length));
  const info = db.prepare(
    "INSERT INTO rounds (started_at, limit_ms, puzzle_count, phase, starts_at, countdown_ms, question_count, skips_allowed, help_level, level) VALUES (?, ?, ?, 'lobby', NULL, ?, ?, ?, ?, ?)"
  ).run(Date.now(), limitMs, puzzles.length, countdownMs, count, skipsAllowed, helpLevel, level);
  return db.prepare("SELECT * FROM rounds WHERE id = ?").get(Number(info.lastInsertRowid));
}

export function setRoundLimit(roundId, limitMs) {
  db.prepare("UPDATE rounds SET limit_ms = ? WHERE id = ?").run(limitMs, roundId);
}

/* Lobby only: changing length mid-round would scramble runs in progress. */
export function setRoundCount(roundId, count) {
  tx(() => {
    db.prepare("UPDATE rounds SET question_count = ? WHERE id = ?").run(count, roundId);
    /* Every waiting player needs a fresh draw at the new length. */
    db.prepare("UPDATE players SET sequence = NULL, idx = 0, skips_used = 0, reveals_used = 0, hints_used = 0 WHERE round_id = ?").run(roundId);
    db.prepare("DELETE FROM progress WHERE player_id IN (SELECT id FROM players WHERE round_id = ?)").run(roundId);
  });
}

export function setRoundSkips(roundId, n) {
  db.prepare("UPDATE rounds SET skips_allowed = ? WHERE id = ?").run(n, roundId);
}

/** Give up on the current word: it counts as missed and spends one skip. */
export function skipRow(playerId, idx, ms) {
  tx(() => {
    db.prepare(`
      UPDATE progress SET status = 'lose', skipped = 1, ms = ?
       WHERE player_id = ? AND puzzle_idx = ? AND status = 'open'
    `).run(ms, playerId, idx);
    db.prepare("UPDATE players SET skips_used = skips_used + 1 WHERE id = ?").run(playerId);
  });
  return getRow(playerId, idx);
}

/**
 * Buy a letter. The cost is taken by moving the word's start time BACKWARDS,
 * which is one mechanism doing both halves of the trade: the time left on this
 * word shrinks, and the elapsed time written to the clock grows.
 */
export function revealLetter(playerId, idx, index, penaltyMs) {
  const row = getRow(playerId, idx);
  if (!row || row.status !== "open") return row;
  let seen = [];
  try { seen = JSON.parse(row.revealed); } catch (e) { seen = []; }
  if (!seen.includes(index)) seen.push(index);
  tx(() => {
    db.prepare(`
      UPDATE progress SET revealed = ?, started_at = ?
       WHERE player_id = ? AND puzzle_idx = ?
    `).run(JSON.stringify(seen), (row.started_at || Date.now()) - penaltyMs, playerId, idx);
    db.prepare("UPDATE players SET reveals_used = reveals_used + 1 WHERE id = ?").run(playerId);
  });
  return getRow(playerId, idx);
}

/* Lobby only, like the round length: changing the band mid-round would mean
   redrawing sequences people are already partway through. */
export function setRoundLevel(roundId, level) {
  tx(() => {
    db.prepare("UPDATE rounds SET level = ? WHERE id = ?").run(level, roundId);
    db.prepare("UPDATE players SET sequence = NULL, idx = 0, skips_used = 0, reveals_used = 0, hints_used = 0 WHERE round_id = ?").run(roundId);
    db.prepare("DELETE FROM progress WHERE player_id IN (SELECT id FROM players WHERE round_id = ?)").run(roundId);
  });
}

export function setRoundHelp(roundId, level) {
  db.prepare("UPDATE rounds SET help_level = ? WHERE id = ?").run(level, roundId);
}

/** Letters the round hands over for nothing, at no time cost. */
export function giveFreeLetters(playerId, idx, positions) {
  db.prepare("UPDATE progress SET revealed = ?, free_letters = ? WHERE player_id = ? AND puzzle_idx = ?")
    .run(JSON.stringify(positions), positions.length, playerId, idx);
  return getRow(playerId, idx);
}

export function markBigHint(playerId, idx) {
  tx(() => {
    db.prepare("UPDATE progress SET big_hint = 1 WHERE player_id = ? AND puzzle_idx = ?").run(playerId, idx);
    db.prepare("UPDATE players SET hints_used = hints_used + 1 WHERE id = ?").run(playerId);
  });
  return getRow(playerId, idx);
}

export function setPlayerSequence(id, seq) {
  db.prepare("UPDATE players SET sequence = ? WHERE id = ?").run(JSON.stringify(seq), id);
}

/**
 * Leave the lobby. Everyone already waiting gets puzzle 1 stamped with the SAME
 * start instant, so the countdown lands identically for all of them and network
 * jitter cannot hand anyone a head start.
 */
export function startRound(roundId, countdownMs, drawSequence) {
  const startsAt = Date.now() + countdownMs;
  tx(() => {
    db.prepare("UPDATE rounds SET phase = 'running', starts_at = ?, countdown_ms = ? WHERE id = ?")
      .run(startsAt, countdownMs, roundId);
    const waiting = db.prepare("SELECT id, sequence FROM players WHERE round_id = ? AND blocked = 0").all(roundId);
    const seqStmt = db.prepare("UPDATE players SET sequence = ? WHERE id = ?");
    const ins = db.prepare(
      "INSERT OR REPLACE INTO progress (player_id, puzzle_idx, status, started_at) VALUES (?, 0, 'open', ?)"
    );
    for (const p of waiting) {
      /* Each player gets their own draw, so neighbours cannot copy. */
      if (!p.sequence && drawSequence) seqStmt.run(JSON.stringify(drawSequence()), p.id);
      ins.run(p.id, startsAt);
    }
  });
  return db.prepare("SELECT * FROM rounds WHERE id = ?").get(roundId);
}

/* ---------- players ---------- */

export function getPlayer(id) {
  if (!id) return null;
  return db.prepare("SELECT * FROM players WHERE id = ?").get(id) ?? null;
}

export function upsertPlayer({ id, roundId, name }) {
  const now = Date.now();
  const existing = getPlayer(id);
  if (existing) {
    /* A reset moves everyone to the new round, keeping the name they chose. */
    if (existing.round_id !== roundId) {
      tx(() => {
        db.prepare("DELETE FROM progress WHERE player_id = ?").run(id);
        db.prepare("UPDATE players SET round_id = ?, idx = 0, sequence = NULL, skips_used = 0, reveals_used = 0, hints_used = 0, name = ?, last_seen = ? WHERE id = ?")
          .run(roundId, name || existing.name, now, id);
      });
    } else if (name && name !== existing.name) {
      db.prepare("UPDATE players SET name = ?, last_seen = ? WHERE id = ?").run(name, now, id);
    } else {
      db.prepare("UPDATE players SET last_seen = ? WHERE id = ?").run(now, id);
    }
    return getPlayer(id);
  }
  db.prepare(
    "INSERT INTO players (id, round_id, name, joined_at, last_seen, idx, blocked) VALUES (?, ?, ?, ?, ?, 0, ?)"
  ).run(id, roundId, name, now, now, isBlocked(id) ? 1 : 0);
  return getPlayer(id);
}

export function touchPlayer(id) {
  db.prepare("UPDATE players SET last_seen = ? WHERE id = ?").run(Date.now(), id);
}

export function setPlayerIdx(id, idx) {
  db.prepare("UPDATE players SET idx = ? WHERE id = ?").run(idx, id);
}

export function roundPlayers(roundId) {
  return db.prepare("SELECT * FROM players WHERE round_id = ? AND blocked = 0").all(roundId);
}

/* ---------- blocklist ---------- */

export function isBlocked(id) {
  return !!db.prepare("SELECT 1 FROM blocklist WHERE player_id = ?").get(id);
}

/* The name is copied onto the blocklist row: a reset deletes the player record,
   and the host still needs to know who they removed. */
export function blockPlayer(id, name) {
  tx(() => {
    db.prepare("INSERT OR REPLACE INTO blocklist (player_id, blocked_at, name) VALUES (?, ?, ?)")
      .run(id, Date.now(), name || null);
    db.prepare("UPDATE players SET blocked = 1 WHERE id = ?").run(id);
  });
}

export function unblockPlayer(id) {
  tx(() => {
    db.prepare("DELETE FROM blocklist WHERE player_id = ?").run(id);
    db.prepare("UPDATE players SET blocked = 0 WHERE id = ?").run(id);
  });
}

export function clearBlocklist() {
  tx(() => {
    db.prepare("DELETE FROM blocklist").run();
    db.prepare("UPDATE players SET blocked = 0").run();
  });
}

export function blockedPlayers() {
  return db.prepare(`
    SELECT b.player_id AS id, b.blocked_at, COALESCE(b.name, p.name) AS name
    FROM blocklist b LEFT JOIN players p ON p.id = b.player_id
    ORDER BY b.blocked_at DESC
  `).all();
}

/* ---------- progress ---------- */

export function getRow(playerId, idx) {
  return db.prepare("SELECT * FROM progress WHERE player_id = ? AND puzzle_idx = ?").get(playerId, idx) ?? null;
}

export function allRows(playerId) {
  return db.prepare("SELECT * FROM progress WHERE player_id = ? ORDER BY puzzle_idx").all(playerId);
}

/**
 * Serve a puzzle: creates the row and stamps its start time, once.
 * `startedAt` lets the caller pin a shared instant (the synchronised go) instead
 * of whenever this particular request happened to arrive.
 */
export function openRow(playerId, idx, startedAt) {
  const at = typeof startedAt === "number" ? startedAt : Date.now();
  const existing = getRow(playerId, idx);
  if (existing) {
    if (existing.status === "open" && !existing.started_at) {
      db.prepare("UPDATE progress SET started_at = ? WHERE player_id = ? AND puzzle_idx = ?")
        .run(at, playerId, idx);
      return getRow(playerId, idx);
    }
    return existing;
  }
  db.prepare(
    "INSERT INTO progress (player_id, puzzle_idx, status, started_at) VALUES (?, ?, 'open', ?)"
  ).run(playerId, idx, at);
  return getRow(playerId, idx);
}

export function recordGuess(playerId, idx, { guesses, tries, status, ms, timedOut }) {
  db.prepare(`
    UPDATE progress
       SET guesses = ?, tries = ?, status = ?, ms = ?, timed_out = ?
     WHERE player_id = ? AND puzzle_idx = ?
  `).run(JSON.stringify(guesses), tries, status, ms, timedOut ? 1 : 0, playerId, idx);
  return getRow(playerId, idx);
}

/** Close an abandoned puzzle whose limit has passed. Returns true if it changed. */
export function expireRow(playerId, idx, limitMs) {
  const row = getRow(playerId, idx);
  if (!row || row.status !== "open" || !row.started_at || !limitMs) return false;
  if (Date.now() - row.started_at < limitMs) return false;
  db.prepare(`
    UPDATE progress SET status = 'lose', timed_out = 1, ms = ?
     WHERE player_id = ? AND puzzle_idx = ?
  `).run(limitMs, playerId, idx);
  return true;
}

/** Sweep every open puzzle in the round whose time is up. Returns how many closed. */
export function expireRound(roundId, limitMs) {
  if (!limitMs) return 0;
  const cutoff = Date.now() - limitMs;
  const info = db.prepare(`
    UPDATE progress SET status = 'lose', timed_out = 1, ms = ?
     WHERE status = 'open'
       AND started_at IS NOT NULL
       AND started_at <= ?
       AND player_id IN (SELECT id FROM players WHERE round_id = ?)
  `).run(limitMs, cutoff, roundId);
  return info.changes;
}

export function wipeRound(roundId) {
  tx(() => {
    db.prepare("DELETE FROM progress WHERE player_id IN (SELECT id FROM players WHERE round_id = ?)").run(roundId);
    db.prepare("DELETE FROM players WHERE round_id = ?").run(roundId);
  });
}

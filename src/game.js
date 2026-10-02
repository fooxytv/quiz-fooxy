import { MAX_TRIES } from "./words.js";

/** Standard Wordle marking, with correct duplicate-letter handling. */
export function mark(guess, answer) {
  const n = answer.length;
  const out = new Array(n).fill("miss");
  const pool = Object.create(null);
  for (let i = 0; i < n; i++) {
    if (guess[i] === answer[i]) out[i] = "hit";
    else pool[answer[i]] = (pool[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < n; i++) {
    if (out[i] === "hit") continue;
    const c = guess[i];
    if (pool[c] > 0) { out[i] = "near"; pool[c]--; }
  }
  return out;
}

/** -2 skipped, -1 missed, 0 not reached, 1..MAX_TRIES solved in that many guesses. */
export function resultCode(row) {
  if (!row || row.status === "open") return 0;
  if (row.status === "win") return Math.max(1, Math.min(MAX_TRIES, row.tries));
  return row.skipped ? -2 : -1;
}

/**
 * Elapsed time for one puzzle. A puzzle still in play counts the time since it
 * was served, so the board ticks while someone is mid-word.
 */
export function rowMs(row, now, limitMs) {
  if (!row) return 0;
  if (row.status !== "open") return row.ms;
  if (!row.started_at) return 0;
  const live = Math.max(0, now - row.started_at);
  return limitMs ? Math.min(live, limitMs) : live;
}

/*
 * Points for a solved word, so leaning on the aids costs something and two people
 * on the same number of words are not equal. Letters the ROUND handed out are
 * free -- everyone at that level got them -- and only the ones a player chose to
 * take are charged. A solved word is always worth more than a missed one, however
 * much help it needed.
 */
export const SCORING = { solved: 100, perSpareGuess: 10, perLetter: 15, perHint: 10, floor: 10 };

export function scoreRow(row) {
  if (!row || row.status !== "win") return 0;
  let revealed = 0;
  try { revealed = JSON.parse(row.revealed || "[]").length; } catch (e) { revealed = 0; }
  const chosen = Math.max(0, revealed - (row.free_letters || 0));
  const base = SCORING.solved + Math.max(0, MAX_TRIES - row.tries) * SCORING.perSpareGuess;
  const cost = chosen * SCORING.perLetter + (row.big_hint ? SCORING.perHint : 0);
  return Math.max(SCORING.floor, base - cost);
}

/** Points first, then the clock, then fewest guesses. */
export function compareEntries(a, b) {
  return (b.score - a.score) || (a.totalMs - b.totalMs) || (a.guesses - b.guesses);
}

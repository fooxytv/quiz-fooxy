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

/** -1 missed, 0 not reached, 1..MAX_TRIES solved in that many guesses. */
export function resultCode(row) {
  if (!row || row.status === "open") return 0;
  return row.status === "win" ? Math.max(1, Math.min(MAX_TRIES, row.tries)) : -1;
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

/** Most words solved, then fastest total time, then fewest guesses. */
export function compareEntries(a, b) {
  return (b.solved - a.solved) || (a.totalMs - b.totalMs) || (a.guesses - b.guesses);
}

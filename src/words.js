/*
 * The answers live here, on the server, and never travel to a browser until the
 * player has finished that puzzle. `clientMeta` is the only shape the client sees.
 *
 * A round can override this list from DATA_DIR/words.json (edited in the admin
 * portal). Keep answers A-Z only, 4-8 letters.
 */
export const BUILTIN_PUZZLES = [
  { answer: "THOR",     hint: "Hammer-swinging Asgardian prince",    category: "HERO",     fact: "Chris Hemsworth's brother Liam also auditioned for the role." },
  { answer: "LOKI",     hint: "God of mischief, adopted brother",    category: "VILLAIN",  fact: "Tom Hiddleston originally auditioned for the hero, not the villain." },
  { answer: "HULK",     hint: "Big green rage monster",              category: "HERO",     fact: "Lou Ferrigno, TV's original, voices him in the MCU films." },
  { answer: "GROOT",    hint: "Talking tree with a tiny vocabulary", category: "HERO",     fact: "Vin Diesel recorded his three words in several languages." },
  { answer: "HYDRA",    hint: "Cut off one head, two more grow",     category: "ORG",      fact: "The name comes from the many-headed serpent of Greek myth." },
  { answer: "STARK",    hint: "Iron Man's surname",                  category: "ALIAS",    fact: "Robert Downey Jr. improvised the line that launched the whole MCU." },
  { answer: "THANOS",   hint: "Purple warlord obsessed with balance",category: "VILLAIN",  fact: "Josh Brolin played him in a motion-capture suit, face dots and all." },
  { answer: "ASGARD",   hint: "Realm of the golden rainbow bridge",  category: "PLACE",    fact: "In Norse myth it sits in the sky, not floating out in space." },
  { answer: "SHIELD",   hint: "Nick Fury's spy agency",              category: "ORG",      fact: "Its mouthful of a full name was rewritten once in the comics." },
  { answer: "ROGERS",   hint: "The First Avenger's real surname",    category: "ALIAS",    fact: "Skinny Steve was a digitally shrunk Chris Evans plus a body double." },
  { answer: "WAKANDA",  hint: "Hidden high-tech African kingdom",    category: "PLACE",    fact: "Its on-screen language is Xhosa, coached to the cast by John Kani." },
  { answer: "GAUNTLET", hint: "Golden glove that holds six gems",    category: "ARTIFACT", fact: "A replica is hiding in Odin's weapons vault in the first Thor film." },
];

export const MAX_TRIES = 6;

/** Validate a candidate word list from the admin portal. Returns [ok, errorOrList]. */
export function validatePuzzles(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 30) {
    return [false, "Give between 1 and 30 puzzles."];
  }
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const p = list[i] || {};
    const answer = String(p.answer || "").toUpperCase().trim();
    if (!/^[A-Z]{4,8}$/.test(answer)) {
      return [false, `Puzzle ${i + 1}: the answer must be 4-8 letters, A-Z only (got "${answer}").`];
    }
    if (seen.has(answer)) return [false, `Puzzle ${i + 1}: "${answer}" appears twice.`];
    seen.add(answer);
    const hint = String(p.hint || "").trim().slice(0, 80);
    if (!hint) return [false, `Puzzle ${i + 1}: every answer needs a clue.`];
    if (hint.toUpperCase().includes(answer)) {
      return [false, `Puzzle ${i + 1}: the clue gives the answer away.`];
    }
    out.push({
      answer,
      hint,
      category: String(p.category || "MARVEL").toUpperCase().trim().slice(0, 12),
      fact: String(p.fact || "").trim().slice(0, 140),
    });
  }
  return [true, out];
}

/** Everything about a puzzle that a player is allowed to know before solving it. */
export function clientMeta(p, index) {
  return { index, hint: p.hint, category: p.category, length: p.answer.length };
}

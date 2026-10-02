/*
 * The answers live here, on the server, and never travel to a browser until the
 * player has finished that puzzle. `clientMeta` is the only shape the client sees.
 *
 * A round can override this list from DATA_DIR/words.json (edited in the admin
 * portal). Keep answers A-Z only, 4-8 letters.
 */
export const BUILTIN_PUZZLES = [
  /* WARM UP -- short, famous, the clue says it outright. Nobody should bounce. */
  { answer: "LOKI",     tier: "WARM UP", hint: "God of mischief, adopted brother",   category: "VILLAIN",  fact: "Tom Hiddleston originally auditioned for the hero, not the villain." },
  { answer: "THOR",     tier: "WARM UP", hint: "Hammer-swinging thunder god",        category: "HERO",     fact: "Chris Hemsworth's brother Liam also auditioned for the role." },
  { answer: "HULK",     tier: "WARM UP", hint: "Big green rage monster",             category: "HERO",     fact: "Lou Ferrigno, TV's original, voices him in the MCU films." },

  /* EASY -- five letters, clue still direct. */
  { answer: "STARK",    tier: "EASY",    hint: "Iron Man's surname",                 category: "ALIAS",    fact: "Robert Downey Jr. improvised the line that launched the whole MCU." },
  { answer: "GROOT",    tier: "EASY",    hint: "Talking tree, three-word vocabulary",category: "HERO",     fact: "Vin Diesel recorded his three words in several languages." },
  { answer: "HYDRA",    tier: "EASY",    hint: "Cut off one head, two more grow",    category: "ORG",      fact: "The name comes from the many-headed serpent of Greek myth." },
  { answer: "WANDA",    tier: "EASY",    hint: "Scarlet Witch's first name",         category: "ALIAS",    fact: "She and her brother arrived in a post-credits scene, years early." },

  /* STEADY -- six letters, the clue describes rather than names. */
  { answer: "THANOS",   tier: "STEADY",  hint: "Warlord obsessed with balance",      category: "VILLAIN",  fact: "Josh Brolin played him in a motion-capture suit, face dots and all." },
  { answer: "ASGARD",   tier: "STEADY",  hint: "Realm at the end of the bridge",     category: "PLACE",    fact: "In Norse myth it sits in the sky, not floating out in space." },
  { answer: "SHIELD",   tier: "STEADY",  hint: "Nick Fury's spy agency",             category: "ORG",      fact: "Its mouthful of a full name was rewritten once in the comics." },
  { answer: "VISION",   tier: "STEADY",  hint: "Android born of the Mind Stone",     category: "HERO",     fact: "Paul Bettany voiced the suit's computer for years before playing him." },
  { answer: "ULTRON",   tier: "STEADY",  hint: "Peacekeeping AI that chose war",     category: "VILLAIN",  fact: "James Spader performed it in motion capture, not just voice." },

  /* TRICKY -- the clue stops helping and starts hinting. */
  { answer: "WAKANDA",  tier: "TRICKY",  hint: "Kingdom hidden behind a veil",       category: "PLACE",    fact: "Its on-screen language is Xhosa, coached to the cast by John Kani." },
  { answer: "QUINJET",  tier: "TRICKY",  hint: "Five engines, one team's ride",      category: "ARTIFACT", fact: "The name is just quin- for five, bolted onto jet." },
  { answer: "SOKOVIA",  tier: "TRICKY",  hint: "The Accords are named after it",     category: "PLACE",    fact: "An invented country, filmed mostly in Italy and South Africa." },
  { answer: "VORMIR",   tier: "TRICKY",  hint: "A soul for a stone, on a cliff",     category: "PLACE",    fact: "The keeper of the stone is a villain from an entirely different film." },

  /* HARD -- you need to have been paying attention. */
  { answer: "HEIMDALL", tier: "HARD",    hint: "All-seeing gatekeeper of a realm",   category: "HERO",     fact: "He can see and hear everything happening across all nine realms." },
  { answer: "VALKYRIE", tier: "HARD",    hint: "Last of a band of winged warriors",  category: "HERO",     fact: "In Norse myth, valkyries choose who lives and who dies in battle." },
  { answer: "ROMANOFF", tier: "HARD",    hint: "Black Widow, on her passport",       category: "ALIAS",    fact: "She began in the comics as a Soviet spy, not a hero." },
  { answer: "KNOWHERE", tier: "HARD",    hint: "Mining colony in a dead skull",      category: "PLACE",    fact: "It is built inside the severed head of an ancient celestial being." },
];

export const MAX_TRIES = 6;

/** Validate a candidate word list from the admin portal. Returns [ok, errorOrList]. */
export function validatePuzzles(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 40) {
    return [false, "Give between 1 and 40 puzzles."];
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
      tier: String(p.tier || "").toUpperCase().trim().slice(0, 10),
      category: String(p.category || "MARVEL").toUpperCase().trim().slice(0, 12),
      fact: String(p.fact || "").trim().slice(0, 140),
    });
  }
  return [true, out];
}

/** Everything about a puzzle that a player is allowed to know before solving it. */
export function clientMeta(p, index) {
  return { index, hint: p.hint, tier: p.tier || "", category: p.category, length: p.answer.length };
}

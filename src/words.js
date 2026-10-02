/*
 * The answers live here, on the server, and never travel to a browser until the
 * player has finished that puzzle. `clientMeta` is the only shape the client sees.
 *
 * A round can override this list from DATA_DIR/words.json (edited in the admin
 * portal). Keep answers A-Z only, 4-8 letters.
 */
export const BUILTIN_PUZZLES = [
  { answer: "LOKI",        tier: "WARM UP",  hint: "God of mischief, adopted brother",           category: "VILLAIN",    fact: "Tom Hiddleston originally auditioned for the hero, not the villain." },
  { answer: "THOR",        tier: "WARM UP",  hint: "Hammer-swinging thunder god",                category: "HERO",       fact: "Chris Hemsworth's brother Liam also auditioned for the role." },
  { answer: "HULK",        tier: "WARM UP",  hint: "Big green rage monster",                     category: "HERO",       fact: "Lou Ferrigno, TV's original, voices him in the MCU films." },
  { answer: "STARK",       tier: "EASY",     hint: "Iron Man's surname",                         category: "ALIAS",      fact: "Robert Downey Jr. improvised the line that launched the whole MCU." },
  { answer: "GROOT",       tier: "EASY",     hint: "Talking tree, three-word vocabulary",        category: "HERO",       fact: "Vin Diesel recorded his three words in several languages." },
  { answer: "HYDRA",       tier: "EASY",     hint: "Cut off one head, two more grow",            category: "ORG",        fact: "The name comes from the many-headed serpent of Greek myth." },
  { answer: "WANDA",       tier: "EASY",     hint: "Scarlet Witch's first name",                 category: "ALIAS",      fact: "She and her brother arrived in a post-credits scene, years early." },
  { answer: "BUCKY",       tier: "EASY",     hint: "The Captain's oldest friend",                category: "HERO",       fact: "Believed dead for decades before returning as the Winter Soldier." },
  { answer: "FURY",        tier: "EASY",     hint: "One-eyed architect of the Avengers",         category: "ALIAS",      fact: "Samuel L. Jackson's likeness inspired the comics version before he was ever cast." },
  { answer: "ROCKET",      tier: "EASY",     hint: "Armed, angry, and not a raccoon",            category: "HERO",       fact: "Bradley Cooper voices him; Sean Gunn performed the on-set reference." },
  { answer: "VENOM",       tier: "EASY",     hint: "Alien symbiote with a taste for trouble",    category: "ANTI-HERO",  fact: "The symbiote appeared in the comics years before the character fans know today." },
  { answer: "THANOS",      tier: "STEADY",   hint: "Warlord obsessed with balance",              category: "VILLAIN",    fact: "Josh Brolin played him in a motion-capture suit, face dots and all." },
  { answer: "ASGARD",      tier: "STEADY",   hint: "Realm at the end of the bridge",             category: "PLACE",      fact: "In Norse myth it sits in the sky, not floating out in space." },
  { answer: "SHIELD",      tier: "STEADY",   hint: "Spy agency with a forced acronym",           category: "ORG",        fact: "Its mouthful of a full name was rewritten once in the comics." },
  { answer: "VISION",      tier: "STEADY",   hint: "Android born of the Mind Stone",             category: "HERO",       fact: "Paul Bettany voiced the suit's computer for years before playing him." },
  { answer: "ULTRON",      tier: "STEADY",   hint: "Peacekeeping AI that chose war",             category: "VILLAIN",    fact: "James Spader performed it in motion capture, not just voice." },
  { answer: "GAMORA",      tier: "STEADY",   hint: "Adopted daughter who changed sides",         category: "HERO",       fact: "Known in the comics as one of the deadliest women in the galaxy." },
  { answer: "HAWKEYE",     tier: "STEADY",   hint: "Avenger who rarely misses",                  category: "HERO",       fact: "Clint Barton began his comic-book career as an antagonist to Iron Man." },
  { answer: "MYSTERIO",    tier: "STEADY",   hint: "Master of illusions in a fishbowl helmet",   category: "VILLAIN",    fact: "In the comics, Quentin Beck was a Hollywood special-effects artist." },
  { answer: "KILLMONGER",  tier: "STEADY",   hint: "Challenger for a hidden throne",             category: "VILLAIN",    fact: "His scars each represent a kill he claims from his military career." },
  { answer: "MJOLNIR",     tier: "STEADY",   hint: "Only the worthy may lift it",                category: "ARTIFACT",   fact: "The name comes straight from Norse mythology." },
  { answer: "TESSERACT",   tier: "STEADY",   hint: "Glowing blue cube, dangerous contents",      category: "ARTIFACT",   fact: "The cube holds the Space Stone." },
  { answer: "WAKANDA",     tier: "TRICKY",   hint: "Kingdom hidden behind a veil",               category: "PLACE",      fact: "Its on-screen language is Xhosa, coached to the cast by John Kani." },
  { answer: "QUINJET",     tier: "TRICKY",   hint: "Five engines, one team's ride",              category: "ARTIFACT",   fact: "The name is just quin- for five, bolted onto jet." },
  { answer: "SOKOVIA",     tier: "TRICKY",   hint: "The Accords are named after it",             category: "PLACE",      fact: "An invented country, filmed mostly in Italy and South Africa." },
  { answer: "VORMIR",      tier: "TRICKY",   hint: "A soul for a stone, on a cliff",             category: "PLACE",      fact: "The keeper of the stone is a villain from an entirely different film." },
  { answer: "KAMARTAJ",    tier: "TRICKY",   hint: "Where Strange learned the mystic arts",      category: "PLACE",      fact: "Placed in Kathmandu, Nepal. Written Kamar-Taj on screen." },
  { answer: "EGO",         tier: "TRICKY",   hint: "Peter Quill's very complicated father",      category: "VILLAIN",    fact: "In the comics he is literally a living planet." },
  { answer: "DORMAMMU",    tier: "TRICKY",   hint: "Strange came to bargain",                    category: "VILLAIN",    fact: "Benedict Cumberbatch performed the motion capture for him too." },
  { answer: "RAVAGERS",    tier: "TRICKY",   hint: "Colourful band of space outlaws",            category: "ORG",        fact: "They are split into many factions across the galaxy." },
  { answer: "XANDAR",      tier: "TRICKY",   hint: "Home world of the Nova Corps",               category: "PLACE",      fact: "The Guardians saved it from Ronan the Accuser." },
  { answer: "TITAN",       tier: "TRICKY",   hint: "Dusty ruined world, home to a warlord",      category: "PLACE",      fact: "Iron Man, Spider-Man, Strange and the Guardians fought there." },
  { answer: "RONAN",       tier: "TRICKY",   hint: "Kree zealot with a very large hammer",       category: "VILLAIN",    fact: "The Accuser first appeared in the comics in 1967." },
  { answer: "ZEMO",        tier: "TRICKY",   hint: "He broke the Avengers without powers",       category: "VILLAIN",    fact: "His plan relied on manipulation, not superhuman ability." },
  { answer: "NEBULA",      tier: "TRICKY",   hint: "Cybernetic daughter, rebuilt repeatedly",    category: "HERO",       fact: "Karen Gillan endured hours of makeup for every appearance." },
  { answer: "YONDU",       tier: "TRICKY",   hint: "Blue outlaw with a deadly whistle",          category: "ANTI-HERO",  fact: "The fin on his head steers his Yaka Arrow." },
  { answer: "HEIMDALL",    tier: "HARD",     hint: "All-seeing gatekeeper of a realm",           category: "HERO",       fact: "He can see and hear everything happening across all nine realms." },
  { answer: "VALKYRIE",    tier: "HARD",     hint: "Last of a band of winged warriors",          category: "HERO",       fact: "In Norse myth, valkyries choose who lives and who dies in battle." },
  { answer: "ROMANOFF",    tier: "HARD",     hint: "Black Widow, on her passport",               category: "ALIAS",      fact: "She began in the comics as a Soviet spy, not a hero." },
  { answer: "KNOWHERE",    tier: "HARD",     hint: "Mining colony in a dead skull",              category: "PLACE",      fact: "It is built inside the severed head of an ancient celestial being." },
  { answer: "EBONYMAW",    tier: "HARD",     hint: "Unnervingly calm telekinetic herald",        category: "VILLAIN",    fact: "One of the Children who attack Earth in Infinity War. Two words on screen." },
  { answer: "CORVUS",      tier: "HARD",     hint: "Glaive-wielding lieutenant",                 category: "VILLAIN",    fact: "His full comic-book name is Corvus Glaive." },
  { answer: "NIDAVELLIR",  tier: "HARD",     hint: "Forge where a god needed a new weapon",      category: "PLACE",      fact: "Eitri and the dwarves forged Asgard's greatest weapons there." },
  { answer: "STORMBREAKER", tier: "HARD",     hint: "Axe forged to end a warlord",                category: "ARTIFACT",   fact: "Thor restarted a dying forge to have it made." },
  { answer: "DARKHOLD",    tier: "HARD",     hint: "Book of dangerously powerful magic",         category: "ARTIFACT",   fact: "Sometimes called the Book of the Damned." },
  { answer: "ARISHEM",     tier: "HARD",     hint: "Celestial judge towering over worlds",       category: "VILLAIN",    fact: "One of Marvel's enormous ancient Celestials." },
  { answer: "AETHER",      tier: "HARD",     hint: "A Stone that did not look like one",         category: "ARTIFACT",   fact: "Revealed much later to be the Reality Stone." },
  { answer: "JOTUNHEIM",   tier: "HARD",     hint: "Frozen realm of the Frost Giants",           category: "PLACE",      fact: "One of the Nine Realms of Asgardian cosmology." },
  { answer: "SVARTALFHEIM", tier: "BRUTAL",   hint: "Ancient realm of the Dark Elves",            category: "PLACE",      fact: "Malekith and the Dark Elves come from this realm." },
  { answer: "PROXIMA",     tier: "BRUTAL",   hint: "Spear-wielding child of a warlord",          category: "VILLAIN",    fact: "Her full name is Proxima Midnight." },
];

export const MAX_TRIES = 6;

/** Ascending difficulty. A sequence is always built in this order. */
export const TIER_ORDER = ["WARM UP", "EASY", "STEADY", "TRICKY", "HARD", "BRUTAL"];

/** How a round of N is spread across the tiers. Sums to 1. */
const TIER_SHAPE = [0.10, 0.18, 0.24, 0.22, 0.16, 0.10];

/** Round lengths the host can choose. */
export const COUNT_CHOICES = [5, 10, 15, 20, 25, 30];

/*
 * The worked example on the join screen. Deliberately a word the pool does not
 * contain, so showing it never hands anybody an answer, and chosen because
 * GARAGE against FRIGGA demonstrates the rule people argue about: two As
 * guessed, one in the answer, so the second one goes grey.
 */
export const DEMO = { answer: "FRIGGA", guesses: ["GARAGE", "FRIGGA"] };

/** Validate a candidate word list from the admin portal. Returns [ok, errorOrList]. */
export function validatePuzzles(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 300) {
    return [false, "Give between 1 and 300 puzzles."];
  }
  const out = [];
  const seen = new Set();
  for (let i = 0; i < list.length; i++) {
    const p = list[i] || {};
    const answer = String(p.answer || "").toUpperCase().trim();
    if (!/^[A-Z]{3,12}$/.test(answer)) {
      return [false, `Puzzle ${i + 1}: the answer must be 3-12 letters, A-Z only (got "${answer}").`];
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
/**
 * Build one player's round: `count` puzzles drawn from the pool, spread across
 * the tiers so everybody climbs the same difficulty curve on DIFFERENT words.
 * Two people side by side cannot copy each other, and nobody can shout an answer
 * across the room usefully.
 *
 * Returns indices into `pool`. Short tiers borrow from their neighbours rather
 * than leaving the round under-length.
 */
/** How many questions each tier contributes, and how many it has to offer. */
export function tierTargets(pool, count) {
  const want = Math.max(1, Math.min(count, pool.length));
  const have = TIER_ORDER.map((tier) =>
    pool.filter((p) => (p.tier || "").toUpperCase() === tier).length);
  const untiered = pool.length - have.reduce((a, b) => a + b, 0);
  have[2] += untiered;

  const target = TIER_SHAPE.map((f) => Math.floor(want * f));
  let short = want - target.reduce((a, b) => a + b, 0);
  const spareOrder = [2, 3, 1, 4, 0, 5];
  for (let k = 0; short > 0; k++, short--) target[spareOrder[k % spareOrder.length]]++;
  return TIER_ORDER.map((tier, i) => ({ tier, want: Math.min(target[i], have[i]), have: have[i] }));
}

/**
 * Roughly how many of a round's words two players will have in common. With k
 * drawn from a tier of m, the expected shared count is k*k/m. Shallow tiers
 * dominate: a pool with three warm-ups cannot avoid repeating them.
 */
export function expectedOverlap(pool, count) {
  return tierTargets(pool, count)
    .reduce((sum, t) => sum + (t.have ? (t.want * t.want) / t.have : 0), 0);
}

export function buildSequence(pool, count, rand = Math.random) {
  const want = Math.max(1, Math.min(count, pool.length));

  const byTier = TIER_ORDER.map((tier) => {
    const idx = [];
    pool.forEach((p, i) => { if ((p.tier || "").toUpperCase() === tier) idx.push(i); });
    /* Fisher-Yates, so the words differ per player while the curve does not. */
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  });

  /* Untiered entries are treated as the middle of the road. */
  const known = new Set(byTier.flat());
  pool.forEach((p, i) => { if (!known.has(i)) byTier[2].push(i); });

  const target = tierTargets(pool, want).map((t) => t.want);
  const taken = TIER_ORDER.map((t, i) => byTier[i].slice(0, Math.min(target[i], byTier[i].length)));
  const leftovers = TIER_ORDER.flatMap((_, t) => byTier[t].slice(taken[t].length));

  /* Make the length up from whatever is spare, nearest tiers first. */
  let deficit = want - taken.flat().length;
  let cursor = 0;
  while (deficit > 0 && cursor < leftovers.length) {
    const i = leftovers[cursor++];
    const tier = TIER_ORDER.indexOf((pool[i].tier || "").toUpperCase());
    taken[tier < 0 ? 2 : tier].push(i);
    deficit--;
  }

  return taken.flat();
}

export function clientMeta(p, index) {
  return { index, hint: p.hint, tier: p.tier || "", category: p.category, length: p.answer.length };
}

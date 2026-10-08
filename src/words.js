/*
 * The answers live here, on the server, and never travel to a browser until the
 * player has finished that puzzle. `clientMeta` is the only shape the client sees.
 *
 * A round can override this list from DATA_DIR/words.json (edited in the admin
 * portal). Keep answers A-Z only, 4-8 letters.
 */
/*
 * Scope: the Infinity Saga only -- Iron Man (2008) through Endgame (2019).
 * Nothing from Phase 4 onward, no X-Men, no comics-only deep cuts. A quiz
 * nobody can answer is not fun, and the point of this one is that everybody
 * has seen the films it asks about.
 *
 * Real surnames are deliberately included -- Stark, Rogers, Banner, Parker,
 * Barton, Romanoff -- because they are easy to recognise and satisfying to get.
 */
export const BUILTIN_PUZZLES = [
  { answer: "LOKI",          tier: "WARM UP",  hint: "God of mischief, adopted brother",              category: "VILLAIN",    fact: "Tom Hiddleston originally auditioned for the hero, not the villain." },
  { answer: "THOR",          tier: "WARM UP",  hint: "Hammer-swinging thunder god",                   category: "HERO",       fact: "Chris Hemsworth's brother Liam also auditioned for the role." },
  { answer: "HULK",          tier: "WARM UP",  hint: "Big green rage monster",                        category: "HERO",       fact: "Lou Ferrigno, TV's original, voices him in the MCU films." },
  { answer: "ANTMAN",        tier: "WARM UP",  hint: "Hero who shrinks to insect size",               category: "HERO",       fact: "Hank Pym created the identity in the comics in 1962." },
  { answer: "ODIN",          tier: "WARM UP",  hint: "All-Father on the golden throne",               category: "HERO",       fact: "Anthony Hopkins played him across three films." },
  { answer: "DRAX",          tier: "WARM UP",  hint: "The Destroyer, takes everything literally",     category: "HERO",       fact: "Dave Bautista wrestled professionally before taking the role." },
  { answer: "WONG",          tier: "WARM UP",  hint: "Keeper of the mystic library",                  category: "HERO",       fact: "His role grew considerably from a minor comics servant." },
  { answer: "WIDOW",         tier: "WARM UP",  hint: "Black ... , the red-haired spy",                category: "ALIAS",      fact: "Her solo film arrived more than a decade after her debut." },
  { answer: "STRANGE",       tier: "WARM UP",  hint: "Surgeon who became a sorcerer",                 category: "HERO",       fact: "The character debuted in the comics in 1963." },
  { answer: "SPIDERMAN",     tier: "WARM UP",  hint: "Wall-crawler bitten by an arachnid",            category: "HERO",       fact: "Three actors have played him together in a single film. Two words on screen." },
  { answer: "WOLVERINE",     tier: "WARM UP",  hint: "Clawed loner with a healing factor",            category: "HERO",       fact: "He debuted as a minor antagonist in a Hulk comic in 1974." },
  { answer: "STORM",         tier: "WARM UP",  hint: "Mutant who commands the weather",               category: "HERO",       fact: "She was one of the first black women to lead a major team." },
  { answer: "GROOT",         tier: "WARM UP",  hint: "Talking tree, three-word vocabulary",           category: "HERO",       fact: "Vin Diesel recorded his three words in several languages." },
  { answer: "WANDA",         tier: "WARM UP",  hint: "Scarlet Witch's first name",                    category: "ALIAS",      fact: "She and her brother arrived in a post-credits scene, years early." },
  { answer: "FURY",          tier: "WARM UP",  hint: "One-eyed architect of the Avengers",            category: "ALIAS",      fact: "Samuel L. Jackson's likeness inspired the comics version before he was ever cast." },
  { answer: "ROCKET",        tier: "WARM UP",  hint: "Armed, angry, and not a raccoon",               category: "HERO",       fact: "Bradley Cooper voices him; Sean Gunn performed the on-set reference." },
  { answer: "THANOS",        tier: "WARM UP",  hint: "Warlord obsessed with balance",                 category: "VILLAIN",    fact: "Josh Brolin played him in a motion-capture suit, face dots and all." },
  { answer: "VISION",        tier: "WARM UP",  hint: "Android born of the Mind Stone",                category: "HERO",       fact: "Paul Bettany voiced the suit's computer for years before playing him." },
  { answer: "STARK",         tier: "EASY",     hint: "Iron Man's surname",                            category: "ALIAS",      fact: "Robert Downey Jr. improvised the line that launched the whole MCU." },
  { answer: "HYDRA",         tier: "EASY",     hint: "Cut off one head, two more grow",               category: "ORG",        fact: "The name comes from the many-headed serpent of Greek myth." },
  { answer: "BUCKY",         tier: "EASY",     hint: "The Captain's oldest friend",                   category: "HERO",       fact: "Believed dead for decades before returning as the Winter Soldier." },
  { answer: "VENOM",         tier: "EASY",     hint: "Alien symbiote with a taste for trouble",       category: "ANTI-HERO",  fact: "The symbiote appeared in the comics years before the character fans know today." },
  { answer: "FALCON",        tier: "EASY",     hint: "Avenger with mechanical wings",                 category: "HERO",       fact: "Widely cited as mainstream comics' first African-American superhero." },
  { answer: "MANTIS",        tier: "EASY",     hint: "Empath with antennae",                          category: "HERO",       fact: "An empath in the comics long before she reached the screen." },
  { answer: "SHURI",         tier: "EASY",     hint: "Teenage genius of a hidden lab",                category: "HERO",       fact: "She briefly takes on her brother's mantle in the comics." },
  { answer: "OKOYE",         tier: "EASY",     hint: "Bald general with a spear",                     category: "HERO",       fact: "The all-female guard she leads is called the Dora Milaje." },
  { answer: "PEPPER",        tier: "EASY",     hint: "The boss who became Rescue",                    category: "ALIAS",      fact: "She wears her own armour in the comics too." },
  { answer: "JARVIS",        tier: "EASY",     hint: "The helpful voice in the earpiece",             category: "ALIAS",      fact: "Named after a butler from the comics, Edwin." },
  { answer: "GOOSE",         tier: "EASY",     hint: "The cat that is not a cat",                     category: "ALIAS",      fact: "Several different cats played the part." },
  { answer: "QUILL",         tier: "EASY",     hint: "Star-Lord's surname",                           category: "ALIAS",      fact: "His mixtape soundtrack reached the top of the album charts." },
  { answer: "CYCLOPS",       tier: "EASY",     hint: "Team leader with a ruby visor",                 category: "HERO",       fact: "His visor exists because he cannot switch the beams off." },
  { answer: "MAGNETO",       tier: "EASY",     hint: "Master of magnetism in a crimson helm",         category: "VILLAIN",    fact: "His helmet exists purely to block telepathy." },
  { answer: "ROGUE",         tier: "EASY",     hint: "She absorbs whatever she touches",              category: "HERO",       fact: "For years she carried a flying brick's powers permanently." },
  { answer: "DEADPOOL",      tier: "EASY",     hint: "Merc with a mouth, breaks the fourth wall",     category: "ANTI-HERO",  fact: "He was created as a deliberate parody of another publisher's assassin." },
  { answer: "ASGARD",        tier: "EASY",     hint: "Realm at the end of the bridge",                category: "PLACE",      fact: "In Norse myth it sits in the sky, not floating out in space." },
  { answer: "SHIELD",        tier: "EASY",     hint: "Spy agency with a forced acronym",              category: "ORG",        fact: "Its mouthful of a full name was rewritten once in the comics." },
  { answer: "GAMORA",        tier: "EASY",     hint: "Adopted daughter who changed sides",            category: "HERO",       fact: "Known in the comics as one of the deadliest women in the galaxy." },
  { answer: "WAKANDA",       tier: "EASY",     hint: "Kingdom hidden behind a veil",                  category: "PLACE",      fact: "Its on-screen language is Xhosa, coached to the cast by John Kani." },
  { answer: "NEBULA",        tier: "EASY",     hint: "Cybernetic daughter, rebuilt repeatedly",       category: "HERO",       fact: "Karen Gillan endured hours of makeup for every appearance." },
  { answer: "ROGERS",        tier: "EASY",     hint: "The First Avenger's surname",                   category: "ALIAS",      fact: "Skinny Steve was a digitally shrunk Chris Evans." },
  { answer: "BANNER",        tier: "EASY",     hint: "Surname of a scientist with anger issues",      category: "ALIAS",      fact: "Three actors have played him on screen." },
  { answer: "PARKER",        tier: "EASY",     hint: "Surname of a web-slinging teenager",            category: "ALIAS",      fact: "Tom Holland was a gymnast before he was cast." },
  { answer: "ULTRON",        tier: "STEADY",   hint: "Peacekeeping AI that chose war",                category: "VILLAIN",    fact: "James Spader performed it in motion capture, not just voice." },
  { answer: "HAWKEYE",       tier: "STEADY",   hint: "Avenger who rarely misses",                     category: "HERO",       fact: "Clint Barton began his comic-book career as an antagonist to Iron Man." },
  { answer: "MYSTERIO",      tier: "STEADY",   hint: "Master of illusions in a fishbowl helmet",      category: "VILLAIN",    fact: "In the comics, Quentin Beck was a Hollywood special-effects artist." },
  { answer: "KILLMONGER",    tier: "STEADY",   hint: "Challenger for a hidden throne",                category: "VILLAIN",    fact: "His scars each represent a kill he claims from his military career." },
  { answer: "MJOLNIR",       tier: "STEADY",   hint: "Only the worthy may lift it",                   category: "ARTIFACT",   fact: "The name comes straight from Norse mythology." },
  { answer: "TESSERACT",     tier: "STEADY",   hint: "Glowing blue cube, dangerous contents",         category: "ARTIFACT",   fact: "The cube holds the Space Stone." },
  { answer: "RHODEY",        tier: "STEADY",   hint: "The colonel in the grey armour",                category: "ALIAS",      fact: "Two different actors have played him in the films." },
  { answer: "SAKAAR",        tier: "STEADY",   hint: "Junk planet of the gladiator pits",             category: "PLACE",      fact: "In the comics it hosts a very different gladiator story." },
  { answer: "MALEKITH",      tier: "STEADY",   hint: "Dark elf who wanted eternal night",             category: "VILLAIN",    fact: "Christopher Eccleston has been openly unenthusiastic about the role." },
  { answer: "SURTUR",        tier: "STEADY",   hint: "Fire demon of prophecy",                        category: "VILLAIN",    fact: "Prophecy says he will burn a whole realm to ash." },
  { answer: "BIFROST",       tier: "STEADY",   hint: "The rainbow bridge between realms",             category: "ARTIFACT",   fact: "In Norse myth the bridge is said to burn with rainbow fire." },
  { answer: "MIDGARD",       tier: "STEADY",   hint: "What the gods call our realm",                  category: "PLACE",      fact: "The name simply means middle enclosure in old Norse." },
  { answer: "KREE",          tier: "STEADY",   hint: "Blue-blooded warrior empire",                   category: "ORG",        fact: "Their empire has been at war for centuries." },
  { answer: "SKRULL",        tier: "STEADY",   hint: "Shape-shifting green-skinned species",          category: "ORG",        fact: "They first appeared in Fantastic Four in 1961." },
  { answer: "SANCTUM",       tier: "STEADY",   hint: "Fortified home of the mystic arts",             category: "PLACE",      fact: "Three such buildings protect the world." },
  { answer: "GAMBIT",        tier: "STEADY",   hint: "Cajun thief who throws charged cards",          category: "HERO",       fact: "He kinetically charges any object, not only playing cards." },
  { answer: "XAVIER",        tier: "STEADY",   hint: "Bald telepath who founded a school",            category: "HERO",       fact: "Two knighted actors have played him on film." },
  { answer: "MYSTIQUE",      tier: "STEADY",   hint: "Blue shape-shifter with yellow eyes",           category: "VILLAIN",    fact: "Her full-body makeup famously took hours per day to apply." },
  { answer: "COLOSSUS",      tier: "STEADY",   hint: "He turns to organic steel",                     category: "HERO",       fact: "A Russian farm boy before the team found him." },
  { answer: "QUINJET",       tier: "STEADY",   hint: "Five engines, one team's ride",                 category: "ARTIFACT",   fact: "The name is just quin- for five, bolted onto jet." },
  { answer: "SOKOVIA",       tier: "STEADY",   hint: "The Accords are named after it",                category: "PLACE",      fact: "An invented country, filmed mostly in Italy and South Africa." },
  { answer: "ZEMO",          tier: "STEADY",   hint: "He broke the Avengers without powers",          category: "VILLAIN",    fact: "His plan relied on manipulation, not superhuman ability." },
  { answer: "YONDU",         tier: "STEADY",   hint: "Blue outlaw with a deadly whistle",             category: "ANTI-HERO",  fact: "The fin on his head steers his Yaka Arrow." },
  { answer: "CHITAURI",      tier: "STEADY",   hint: "Alien army that fell on a city",                category: "ORG",        fact: "Created for the Ultimate comics line, not the original." },
  { answer: "GAUNTLET",      tier: "STEADY",   hint: "Golden glove that holds six gems",              category: "ARTIFACT",   fact: "A replica hides in Odin's vault in the first Thor film." },
  { answer: "BARTON",        tier: "STEADY",   hint: "Surname of the archer",                         category: "ALIAS",      fact: "He began in the comics as an enemy of Iron Man." },
  { answer: "VORMIR",        tier: "TRICKY",   hint: "A soul for a stone, on a cliff",                category: "PLACE",      fact: "The keeper of the stone is a villain from an entirely different film." },
  { answer: "KAMARTAJ",      tier: "TRICKY",   hint: "Where a surgeon learned the mystic arts",       category: "PLACE",      fact: "Placed in Kathmandu, Nepal. Written Kamar-Taj on screen." },
  { answer: "EGO",           tier: "TRICKY",   hint: "A hero's very complicated father",              category: "VILLAIN",    fact: "In the comics he is literally a living planet." },
  { answer: "DORMAMMU",      tier: "TRICKY",   hint: "A sorcerer came to bargain",                    category: "VILLAIN",    fact: "Benedict Cumberbatch performed the motion capture for him too." },
  { answer: "RAVAGERS",      tier: "TRICKY",   hint: "Colourful band of space outlaws",               category: "ORG",        fact: "They are split into many factions across the galaxy." },
  { answer: "XANDAR",        tier: "TRICKY",   hint: "Home world of the Nova Corps",                  category: "PLACE",      fact: "The Guardians saved it from Ronan the Accuser." },
  { answer: "TITAN",         tier: "TRICKY",   hint: "Dusty ruined world, home to a warlord",         category: "PLACE",      fact: "Iron Man, Spider-Man, Strange and the Guardians fought there." },
  { answer: "RONAN",         tier: "TRICKY",   hint: "Zealot with a very large hammer",               category: "VILLAIN",    fact: "The Accuser first appeared in the comics in 1967." },
  { answer: "GRANDMASTER",   tier: "TRICKY",   hint: "Showman who runs the arena",                    category: "VILLAIN",    fact: "Jeff Goldblum improvised much of his dialogue." },
  { answer: "TALOKAN",       tier: "TRICKY",   hint: "Undersea kingdom of a winged king",             category: "PLACE",      fact: "Its design draws on Mesoamerican rather than Atlantean myth." },
  { answer: "MORAG",         tier: "TRICKY",   hint: "Abandoned world, flooded every few hours",      category: "PLACE",      fact: "An orb lay hidden in a temple there for centuries." },
  { answer: "ANCIENTONE",    tier: "TRICKY",   hint: "Her pupil became a sorcerer",                   category: "HERO",       fact: "Tilda Swinton's casting was widely debated. Two words on screen." },
  { answer: "WHIPLASH",      tier: "TRICKY",   hint: "Rival in an electrified harness",               category: "VILLAIN",    fact: "Mickey Rourke reportedly visited a Russian prison to prepare." },
  { answer: "VULTURE",       tier: "TRICKY",   hint: "Scavenger with a winged rig",                   category: "VILLAIN",    fact: "Michael Keaton had already played two other comic-book characters." },
  { answer: "OSBORN",        tier: "TRICKY",   hint: "Surname of two generations of villains",        category: "ALIAS",      fact: "In the comics the family torments a certain wall-crawler for decades." },
  { answer: "JUGGERNAUT",    tier: "TRICKY",   hint: "Unstoppable once he starts moving",             category: "VILLAIN",    fact: "His power comes from a mystical gem, not a mutation." },
  { answer: "NIGHTCRAWLER",  tier: "TRICKY",   hint: "Teleporter who leaves brimstone behind",        category: "HERO",       fact: "He was originally designed for an entirely different team." },
  { answer: "SENTINELS",     tier: "TRICKY",   hint: "Giant purple mutant-hunting robots",            category: "ORG",        fact: "Built by a scientist who lost control of them immediately." },
  { answer: "DOOM",          tier: "TRICKY",   hint: "Armoured monarch, scientist and sorcerer",      category: "VILLAIN",    fact: "He has ruled a small European country since 1962." },
  { answer: "GALACTUS",      tier: "TRICKY",   hint: "He eats planets",                               category: "VILLAIN",    fact: "Introduced in 1966 with a herald on a surfboard." },
  { answer: "HEIMDALL",      tier: "TRICKY",   hint: "All-seeing gatekeeper of a realm",              category: "HERO",       fact: "He can see and hear everything happening across all nine realms." },
  { answer: "VALKYRIE",      tier: "TRICKY",   hint: "Last of a band of winged warriors",             category: "HERO",       fact: "In Norse myth, valkyries choose who lives and who dies in battle." },
  { answer: "ROMANOFF",      tier: "TRICKY",   hint: "The spy's surname, not her codename",           category: "ALIAS",      fact: "She began in the comics as a Soviet spy, not a hero." },
  { answer: "MORDO",         tier: "TRICKY",   hint: "Fellow pupil who turned on magic",              category: "VILLAIN",    fact: "In the comics he is a far greater threat than on screen." },
  { answer: "TCHALLA",       tier: "TRICKY",   hint: "The king's own name",                           category: "ALIAS",      fact: "Written with an apostrophe on screen." },
  { answer: "HELA",          tier: "TRICKY",   hint: "Goddess of death in a black headdress",         category: "VILLAIN",    fact: "Cate Blanchett's first comic-book role." },
  { answer: "KORG",          tier: "TRICKY",   hint: "Polite warrior made of rock",                   category: "HERO",       fact: "The director of the film plays him himself." },
  { answer: "KNOWHERE",      tier: "HARD",     hint: "Mining colony in a dead skull",                 category: "PLACE",      fact: "It is built inside the severed head of an ancient celestial being." },
  { answer: "EBONYMAW",      tier: "HARD",     hint: "Unnervingly calm telekinetic herald",           category: "VILLAIN",    fact: "One of the Children who attack Earth in Infinity War. Two words on screen." },
  { answer: "CORVUS",        tier: "HARD",     hint: "Glaive-wielding lieutenant",                    category: "VILLAIN",    fact: "His full comic-book name is Corvus Glaive." },
  { answer: "NIDAVELLIR",    tier: "HARD",     hint: "Forge where a god needed a new weapon",         category: "PLACE",      fact: "Eitri and the dwarves forged Asgard's greatest weapons there." },
  { answer: "STORMBREAKER",  tier: "HARD",     hint: "Axe forged to end a warlord",                   category: "ARTIFACT",   fact: "Thor restarted a dying forge to have it made." },
  { answer: "DARKHOLD",      tier: "HARD",     hint: "Book of dangerously powerful magic",            category: "ARTIFACT",   fact: "Sometimes called the Book of the Damned." },
  { answer: "ARISHEM",       tier: "HARD",     hint: "Celestial judge towering over worlds",          category: "VILLAIN",    fact: "One of Marvel's enormous ancient Celestials." },
  { answer: "AETHER",        tier: "HARD",     hint: "A Stone that did not look like one",            category: "ARTIFACT",   fact: "Revealed much later to be the Reality Stone." },
  { answer: "JOTUNHEIM",     tier: "HARD",     hint: "Frozen realm of the Frost Giants",              category: "PLACE",      fact: "One of the Nine Realms of Asgardian cosmology." },
  { answer: "NAMOR",         tier: "HARD",     hint: "Feathered-serpent king of the deep",            category: "ANTI-HERO",  fact: "One of Marvel's oldest characters, created in 1939." },
  { answer: "SYLVIE",        tier: "HARD",     hint: "A variant who wanted the throne",               category: "ANTI-HERO",  fact: "Her character is an original creation for the screen." },
  { answer: "MOBIUS",        tier: "HARD",     hint: "Analyst with a fondness for jet skis",          category: "HERO",       fact: "Owen Wilson plays him with a deliberately unhurried calm." },
  { answer: "WENWU",         tier: "HARD",     hint: "Father who wore ten rings",                     category: "VILLAIN",    fact: "The character replaced a crude racial caricature from the comics." },
  { answer: "XIALING",       tier: "HARD",     hint: "Sister who built her own fighting ring",        category: "ANTI-HERO",  fact: "She ends her film running her father's organisation." },
  { answer: "EITRI",         tier: "HARD",     hint: "Dwarf king of a dying forge",                   category: "HERO",       fact: "Peter Dinklage played him at enormous scale." },
  { answer: "ETERNALS",      tier: "HARD",     hint: "Ancient guardians who never interfered",        category: "ORG",        fact: "Jack Kirby created them in the mid-1970s." },
  { answer: "APOCALYPSE",    tier: "HARD",     hint: "Ancient mutant with four horsemen",             category: "VILLAIN",    fact: "He was born in Egypt thousands of years ago." },
  { answer: "GENOSHA",       tier: "HARD",     hint: "Island that became a mutant homeland",          category: "PLACE",      fact: "It began as an allegory for apartheid-era oppression." },
  { answer: "LATVERIA",      tier: "HARD",     hint: "Small European country, one famous ruler",      category: "PLACE",      fact: "Its monarch holds a seat at the United Nations in the comics." },
  { answer: "SINISTER",      tier: "HARD",     hint: "Geneticist obsessed with bloodlines",           category: "VILLAIN",    fact: "He has been manipulating mutant lineages for over a century." },
  { answer: "MAESTRO",       tier: "HARD",     hint: "A future green brute, gone bad",                category: "VILLAIN",    fact: "He rules a ruined future city with no one left to stop him." },
  { answer: "BATTLEWORLD",   tier: "HARD",     hint: "Planet stitched from fragments of others",      category: "PLACE",      fact: "Each patch keeps its own rules, ruler and reality." },
  { answer: "COULSON",       tier: "HARD",     hint: "The agent in the suit, from the start",         category: "ALIAS",      fact: "He got his own television series afterwards." },
  { answer: "SVARTALFHEIM",  tier: "BRUTAL",   hint: "Ancient realm of the Dark Elves",               category: "PLACE",      fact: "Malekith and the Dark Elves come from this realm." },
  { answer: "PROXIMA",       tier: "BRUTAL",   hint: "Spear-wielding child of a warlord",             category: "VILLAIN",    fact: "Her full name is Proxima Midnight." },
  { answer: "RAVONNA",       tier: "BRUTAL",   hint: "Judge of a time bureaucracy",                   category: "VILLAIN",    fact: "In the comics she is a love interest turned adversary." },
  { answer: "TIAMUT",        tier: "BRUTAL",   hint: "The one emerging from the ocean",               category: "VILLAIN",    fact: "Its emergence would have destroyed the planet." },
  { answer: "KAECILIUS",     tier: "BRUTAL",   hint: "Zealot who stole pages from a book",            category: "VILLAIN",    fact: "Mads Mikkelsen's eye makeup took hours to apply." },
  { answer: "JABARI",        tier: "BRUTAL",   hint: "Mountain tribe that rejects technology",        category: "ORG",        fact: "Their leader rules from the highlands in open defiance." },
  { answer: "MUSPELHEIM",    tier: "BRUTAL",   hint: "Realm made entirely of fire",                   category: "PLACE",      fact: "One of the nine realms of Norse cosmology." },
  { answer: "VANAHEIM",      tier: "BRUTAL",   hint: "Home of a second tribe of gods",                category: "PLACE",      fact: "The Vanir live there in Norse myth." },
  { answer: "ATTUMA",        tier: "BRUTAL",   hint: "Tusked warlord of the depths",                  category: "VILLAIN",    fact: "A long-standing undersea antagonist in the comics." },
  { answer: "ALIOTH",        tier: "BRUTAL",   hint: "Living cloud at the end of time",               category: "VILLAIN",    fact: "It consumes anything that strays into its path." },
  { answer: "DRUIG",         tier: "BRUTAL",   hint: "He can bend minds with a word",                 category: "VILLAIN",    fact: "Barry Keoghan plays him as quietly unsettling." },
  { answer: "LAUFEY",        tier: "BRUTAL",   hint: "Frost giant king, and a true father",           category: "VILLAIN",    fact: "In Norse myth the name belongs to a mother, not a father." },
  { answer: "BEYONDER",      tier: "BRUTAL",   hint: "He staged a war to study heroes",               category: "VILLAIN",    fact: "The 1984 crossover happened entirely at his whim." },
  { answer: "MOLECULEMAN",   tier: "BRUTAL",   hint: "He can rearrange matter itself",                category: "VILLAIN",    fact: "The 2015 crossover turns on him more than on anyone else. Two words on screen." },
  { answer: "DOOMSTADT",     tier: "BRUTAL",   hint: "Capital of a tyrant's small country",           category: "PLACE",      fact: "Named, with no modesty whatsoever, after its ruler." },
  { answer: "INCURSION",     tier: "BRUTAL",   hint: "Two realities colliding, both destroyed",       category: "ARTIFACT",   fact: "The slow-motion catastrophe that set up the 2015 crossover." },
  { answer: "THORCORPS",     tier: "BRUTAL",   hint: "A whole police force of hammer-wielders",       category: "ORG",        fact: "They kept order across a patchwork planet. Two words on screen." },
];

export const MAX_TRIES = 6;

/** Ascending difficulty. A sequence is always built in this order. */
export const TIER_ORDER = ["WARM UP", "EASY", "STEADY", "TRICKY", "HARD", "BRUTAL"];

/*
 * Difficulty bands the host chooses between, so a session can open gentle and only
 * get harder if people are enjoying it. Each level draws from two neighbouring
 * tiers and still ramps within the round.
 */
export const LEVELS = [
  { id: 1, label: "Level 1", name: "Nice and easy",  tiers: ["WARM UP", "EASY"] },
  { id: 2, label: "Level 2", name: "Warming up",     tiers: ["EASY", "STEADY"] },
  { id: 3, label: "Level 3", name: "Getting tricky", tiers: ["STEADY", "TRICKY"] },
  { id: 4, label: "Level 4", name: "Hard",           tiers: ["TRICKY", "HARD"] },
  { id: 5, label: "Level 5", name: "Brutal",         tiers: ["HARD", "BRUTAL"] },
  { id: 0, label: "Mixed",   name: "All six tiers",  tiers: TIER_ORDER },
];
export const levelById = (id) => LEVELS.find((l) => l.id === Number(id)) || LEVELS[0];

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
    /* An optional picture, named only -- it is served from DATA_DIR/assets/words
       and never reaches a player until their word is closed, because the
       filename alone would give the answer away. Usually left out: the folder
       is scanned by answer name, so dropping GROOT.jpg in is enough. */
    const image = String(p.image || "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80);
    out.push({
      answer,
      hint,
      tier: String(p.tier || "").toUpperCase().trim().slice(0, 10),
      category: String(p.category || "MARVEL").toUpperCase().trim().slice(0, 12),
      fact: String(p.fact || "").trim().slice(0, 140),
      ...(image && image !== "." && image !== ".." ? { image } : {}),
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
/**
 * How many questions each of a level's tiers contributes, and how deep each is.
 * Spread as evenly as the tiers allow, lower tiers first so the round still ramps.
 */
export function tierTargets(pool, count, levelId = 1) {
  const level = levelById(levelId);
  const tiers = level.tiers;
  const have = tiers.map((t) => pool.filter((p) => (p.tier || "").toUpperCase() === t).length);
  const total = have.reduce((a, b) => a + b, 0);
  const want = Math.max(1, Math.min(count, total));

  const target = tiers.map(() => Math.floor(want / tiers.length));
  let short = want - target.reduce((a, b) => a + b, 0);
  for (let k = 0; short > 0; k++, short--) target[k % tiers.length]++;

  /* A shallow tier hands its surplus to its neighbours rather than shrinking the round. */
  let deficit = 0;
  const out = tiers.map((tier, i) => {
    const take = Math.min(target[i], have[i]);
    deficit += target[i] - take;
    return { tier, want: take, have: have[i] };
  });
  for (let i = 0; i < out.length && deficit > 0; i++) {
    const room = out[i].have - out[i].want;
    const add = Math.min(room, deficit);
    out[i].want += add;
    deficit -= add;
  }
  return out;
}

/**
 * Roughly how many of a round's words two players will have in common. With k
 * drawn from a tier of m, the expected shared count is k*k/m. Shallow tiers
 * dominate: a pool with three warm-ups cannot avoid repeating them.
 */
export function expectedOverlap(pool, count, levelId = 1) {
  return tierTargets(pool, count, levelId)
    .reduce((sum, t) => sum + (t.have ? (t.want * t.want) / t.have : 0), 0);
}

/**
 * `exclude` holds pool indices this player has already been served earlier in the
 * session. Levels share tiers -- level 1 is WARM UP+EASY and level 2 is
 * EASY+STEADY -- so without this, climbing a level hands back a word they just
 * solved. Excluded words are not removed, only pushed to the back of their tier:
 * a thin tier still fills the round rather than cutting it short.
 */
export function buildSequence(pool, count, rand = Math.random, levelId = 1, exclude = []) {
  const level = levelById(levelId);
  const targets = tierTargets(pool, count, levelId);
  const used = exclude instanceof Set ? exclude : new Set(exclude);

  /* Fisher-Yates, so the words differ per player while the curve does not. */
  const shuffle = (idx) => {
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  };

  const byTier = level.tiers.map((tier) => {
    const fresh = [], repeats = [];
    pool.forEach((p, i) => {
      if ((p.tier || "").toUpperCase() !== tier) return;
      (used.has(i) ? repeats : fresh).push(i);
    });
    return [...shuffle(fresh), ...shuffle(repeats)];
  });

  const taken = byTier.map((idx, i) => idx.slice(0, targets[i].want));

  /* Short of the asked-for length only when the level itself has run dry. */
  const leftovers = byTier.flatMap((idx, i) => idx.slice(taken[i].length));
  let deficit = Math.min(count, byTier.flat().length) - taken.flat().length;
  let cursor = 0;
  while (deficit > 0 && cursor < leftovers.length) {
    const i = leftovers[cursor++];
    const at = Math.max(0, level.tiers.indexOf((pool[i].tier || "").toUpperCase()));
    taken[at].push(i);
    deficit--;
  }

  return taken.flat();
}

export function clientMeta(p, index) {
  return { index, hint: p.hint, tier: p.tier || "", category: p.category, length: p.answer.length };
}

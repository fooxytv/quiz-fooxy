/* Drives the real server over HTTP: join, guess, timeout, kick, reset. */
const BASE = process.env.BASE || "http://127.0.0.1:3111";
const jars = { me: "", other: "" };
let who = "me";
const as = (k) => { who = k; };
async function call(path, method = "GET", body) {
  const cookie = jars[who];
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const c of res.headers.getSetCookie?.() || []) {
    if (c.startsWith("mwq_pid=")) jars[who] = c.split(";")[0];
  }
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (label, cond, extra = "") => console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  " + extra : ""}`);
let failures = 0;
const check = (l, c, e) => { if (!c) failures++; ok(l, c, e); };

let r;
try {

// health
r = await call("/healthz");
check("healthz responds", r.status === 200 && r.data.ok);
check("healthz reports which build is running", !!r.data.build && !!r.data.build.sha,
  `build=${r.data.build && r.data.build.sha}`);

/* The suite assumes a clean lobby, so it makes one. This also means it can be
   re-run against a long-lived container without tripping over its own leftovers. */
r = await call("/api/admin/reset", "POST");
check("suite starts from a clean lobby", r.status === 200 && r.data.ok === true);
for (const k of ["me", "other"]) {
  as(k);
  const b = await call("/api/admin/board");
  for (const blocked of b.data?.blocked || []) {
    await call("/api/admin/unkick", "POST", { playerId: blocked.id });
  }
}
as("me");

// anonymous state
r = await call("/api/state");
check("anonymous state is not joined", r.data.joined === false, `puzzles=${r.data.puzzleCount}`);

// ---- lobby ----------------------------------------------------------------
r = await call("/api/join", "POST", { name: "  Tester  " });
check("join lands in the lobby", r.status === 200 && r.data.waiting === true && r.data.phase === "lobby");
check("name trimmed", r.data.name === "Tester");
check("no clue dealt in the lobby", r.data.current.hint === null && r.data.current.length === null);
check("no clock in the lobby", r.data.current.startedAt === null);
r = await call("/api/guess", "POST", { guess: "THOR" });
check("cannot guess before the go", r.status === 409 && r.data.error === "not_started");

// a second player joins the same lobby
as("other");
r = await call("/api/join", "POST", { name: "Rival" });
check("second player joins the lobby", r.data.waiting === true);
as("me");

// host starts with a short countdown
r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
check("start accepted", r.data.ok === true && typeof r.data.startsAt === "number");
const goAt = r.data.startsAt;
r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
check("cannot start twice", r.status === 409 && r.data.error === "already_running");

r = await call("/api/state");
check("counting down after the go is pressed", r.data.counting === true && r.data.phase === "running");
check("clue still withheld mid-countdown", r.data.current.hint === null);
r = await call("/api/guess", "POST", { guess: "THOR" });
check("cannot guess mid-countdown", r.status === 409 && r.data.error === "counting_down");

await sleep(Math.max(0, goAt - Date.now()) + 250);

r = await call("/api/state");
const s0 = r.data;
check("first word appears after the countdown", s0.counting === false && !!s0.current.hint);
check("both players share one start instant", s0.current.startedAt === goAt, `startedAt=${s0.current.startedAt} goAt=${goAt}`);
as("other");
const rival = (await call("/api/state")).data;
check("rival got the identical start instant", rival.current.startedAt === goAt);
as("me");
check("join succeeds", s0.name === "Tester");
check("cookie issued", /^mwq_pid=[a-f0-9]{32}$/.test(jars.me));
check("first puzzle served with a clue", !!s0.current.hint && s0.current.length >= 4);
check("ANSWER WITHHELD while open", s0.current.answer === null, `answer=${JSON.stringify(s0.current.answer)}`);
check("clock started", typeof s0.current.startedAt === "number");

// wrong length rejected
r = await call("/api/guess", "POST", { guess: "XY" });
check("wrong length rejected", r.status === 400 && r.data.error === "bad_length");

// a wrong guess of the right length
const len = s0.current.length;
const wrong = "Z".repeat(len);   // answers run to 12 letters, so never hardcode this
r = await call("/api/guess", "POST", { guess: wrong });
check("wrong guess accepted and marked", r.status === 200 && r.data.current.rows.length === 1
  && r.data.current.rows[0].marks.length === len);
check("still no answer leaked after 1 guess", r.data.current.answer === null);
check("tries counted", r.data.current.tries === 1);

// burn the remaining guesses to close the word
for (let i = 2; i <= 6; i++) r = await call("/api/guess", "POST", { guess: wrong });
check("word closes after 6 guesses", r.data.current.status === "lose", `status=${r.data.current.status}`);
check("answer revealed only once closed", typeof r.data.current.answer === "string" && r.data.current.answer.length === len,
  `answer=${r.data.current.answer}`);
check("loss recorded in results", r.data.results[0] === -1);

// marking is correct against the now-known answer
const answer = r.data.current.answer;
r = await call("/api/next", "POST");
check("advanced to puzzle 2", r.data.current.index === 1 && r.data.current.status === "open");
check("puzzle 2 answer withheld", r.data.current.answer === null);

// solve puzzle 2 first try, using the answer we can only know by cheating the test
// (read it straight from the module, which is exactly what a browser cannot do)
/* The player's own second word, which only the server knows until it closes. */
const seqProbe = (await call("/api/state")).data;
const { BUILTIN_PUZZLES } = await import("../src/words.js");
const p2 = BUILTIN_PUZZLES.find((p) => p.hint === seqProbe.current.hint).answer;
r = await call("/api/guess", "POST", { guess: p2 });
check("correct guess wins", r.data.current.status === "win", `status=${r.data.current.status}`);
check("all marks green on a win", r.data.current.rows.at(-1).marks.every((m) => m === "hit"));
check("solved count is 1", r.data.solved === 1);
check("trivia returned on solve", typeof r.data.current.fact === "string");
check("time recorded for the solve", r.data.current.ms >= 0 && r.data.totalMs > 0);

// duplicate-letter marking sanity, against the server's own algorithm
const { mark } = await import("../src/game.js");
check("duplicate letters marked correctly",
  mark("BANNER", "NEBULA").join(",") === "near,near,near,miss,near,miss",
  mark("BANNER", "NEBULA").join(","));

// admin is sealed without Cloudflare Access (dev bypass is loopback-only and ON here)
r = await call("/api/admin/board");
check("admin board reachable via loopback dev bypass", r.status === 200 && Array.isArray(r.data.players));
const me = r.data.players.find((p) => p.name === "Tester");
check("player appears on the board", !!me, `players=${r.data.players.length}`);
check("board carries no answers", !r.text.includes(answer), "leak check on full board payload");

// time limit + server-enforced timeout
r = await call("/api/admin/limit", "POST", { limitMs: 45000 });
check("limit change accepted", r.data.ok === true && r.data.limitMs === 45000);
r = await call("/api/admin/limit", "POST", { limitMs: 7777 });
check("bogus limit refused", r.status === 400);

// kick / unkick
r = await call("/api/admin/kick", "POST", { playerId: me.id });
check("kick accepted", r.data.ok === true);
r = await call("/api/state");
check("kicked player sees removed", r.data.removed === true);
r = await call("/api/guess", "POST", { guess: p2 });
check("kicked player cannot guess", r.status === 403);
r = await call("/api/admin/board");
check("kicked player off the board", !r.data.players.some((p) => p.id === me.id));
check("kicked player listed as blocked", r.data.blocked.some((b) => b.id === me.id));
r = await call("/api/admin/unkick", "POST", { playerId: me.id });
check("unkick accepted", r.data.ok === true);
r = await call("/api/state");
check("reinstated player resumes with progress", r.data.removed === false && r.data.solved === 1,
  `solved=${r.data.solved}`);

// ---- late joiner --------------------------------------------------------
as("other");
r = await call("/api/admin/board");
const rivalRow = r.data.players.find((p) => p.name === "Rival");
check("on-time player is not flagged late", rivalRow && rivalRow.late === false);
as("me");

// ---- the clocks -----------------------------------------------------------
/* Every player payload must carry `joined`. It was once set by /api/state alone,
   so after joining or guessing the client's tick guard bailed and both the
   per-word countdown and the running total sat frozen for the whole game. */
check("state payload says joined", (await call("/api/state")).data.joined === true);
r = await call("/api/guess", "POST", { guess: "Q".repeat(seqProbe.current.length) });
check("guess payload says joined", r.data.joined === true);
r = await call("/api/next", "POST");
check("next payload says joined", r.data.joined === true);

/* And the countdown must actually move. */
const t1 = (await call("/api/state")).data;
if (t1.limitMs && t1.current.startedAt) {
  const left1 = t1.limitMs - (t1.serverNow - t1.current.startedAt);
  await sleep(2100);
  const t2 = (await call("/api/state")).data;
  const left2 = t2.limitMs - (t2.serverNow - t2.current.startedAt);
  check("the per-word clock counts down", left2 < left1 - 1500,
    `${Math.round(left1 / 1000)}s then ${Math.round(left2 / 1000)}s`);
  check("the running total counts up", t2.totalMs > t1.totalMs,
    `${t1.totalMs}ms then ${t2.totalMs}ms`);
} else {
  check("a limit was in force to measure", false, `limitMs=${t1.limitMs}`);
}

// ---- round length and per-player draws ------------------------------------
r = await call("/api/admin/board");
check("board reports the pool and the round length",
  r.data.poolSize >= 20 && r.data.puzzleCount >= 1,
  `pool=${r.data.poolSize} count=${r.data.puzzleCount}`);
check("board reports tier depth", Array.isArray(r.data.poolTiers) && r.data.poolTiers.length === 6);
check("board carries a worked example", !!r.data.demo && !!r.data.demo.answer);
check("the worked example is NOT a word anyone could be dealt",
  !BUILTIN_PUZZLES.some((p) => p.answer === r.data.demo.answer), `demo=${r.data.demo.answer}`);

r = await call("/api/admin/count", "POST", { count: 10 });
check("length change refused mid-round", r.status === 409 && r.data.error === "round_running");
r = await call("/api/admin/reset", "POST");
r = await call("/api/admin/count", "POST", { count: 10 });
check("length change accepted in the lobby", r.data.ok === true && r.data.count === 10);
r = await call("/api/admin/count", "POST", { count: 7 });
check("bogus length refused", r.status === 400 && r.data.error === "bad_count");

/* Four players, one start: same curve, different words. */
/* Eight, not four: with only three warm-up words, four players landing on the
   same opening happens by chance about 4% of the time, and a test that fails one
   run in twenty is worse than no test. At eight it is under 0.02%. */
const crowd = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
for (const n of crowd) { as(n); await call("/api/join", "POST", { name: n }); }
as("me");
r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
const go2 = r.data.startsAt;
await sleep(Math.max(0, go2 - Date.now()) + 250);

const seen = [];
for (const n of crowd) {
  as(n);
  const st = (await call("/api/state")).data;
  seen.push(st);
}
as("me");
check("everyone has the same round length", new Set(seen.map((s) => s.puzzleCount)).size === 1 && seen[0].puzzleCount === 10);
check("everyone starts on the same instant", new Set(seen.map((s) => s.current.startedAt)).size === 1);
check("everyone opens on the same tier", new Set(seen.map((s) => s.current.tier)).size === 1,
  `tiers=${seen.map((s) => s.current.tier).join("/")}`);
check("players do not all get the same first word",
  new Set(seen.map((s) => s.current.hint)).size > 1,
  `${new Set(seen.map((s) => s.current.hint)).size} distinct openings across ${crowd.length} players`);

/* And deterministically, at the algorithm level, independent of luck. */
const { buildSequence } = await import("../src/words.js");
const draws = Array.from({ length: 40 }, () => buildSequence(BUILTIN_PUZZLES, 10).join(","));
check("draws differ between players", new Set(draws).size > 30,
  `${new Set(draws).size} distinct sequences in 40 draws`);
const ascends = buildSequence(BUILTIN_PUZZLES, 20)
  .map((i) => ["WARM UP", "EASY", "STEADY", "TRICKY", "HARD", "BRUTAL"].indexOf(BUILTIN_PUZZLES[i].tier));
check("a draw always ascends in difficulty", ascends.every((v, k) => k === 0 || v >= ascends[k - 1]),
  ascends.join(""));
check("a draw never repeats a word", new Set(buildSequence(BUILTIN_PUZZLES, 30)).size === 30);
check("no answer is leaked to any of them", seen.every((s) => s.current.answer === null));

/* A long answer must still be playable: the pool has 12-letter words. */
const longest = Math.max(...BUILTIN_PUZZLES.map((p) => p.answer.length));
check("pool includes long answers for the grid to cope with", longest >= 10, `longest=${longest}`);
check("every answer is 3-12 letters A-Z", BUILTIN_PUZZLES.every((p) => /^[A-Z]{3,12}$/.test(p.answer)));

// ---- lifelines: buy a letter, or give the word up ------------------------
/* Its own round. The section before this one reset and only the crowd rejoined,
   so "me" was not in a game at all -- which is how this first threw. */
await call("/api/admin/reset", "POST");
r = await call("/api/admin/skips", "POST", { skips: 2 });
check("skip allowance accepted", r.data.ok === true && r.data.skips === 2);
r = await call("/api/admin/skips", "POST", { skips: 99 });
check("bogus skip allowance refused", r.status === 400);

await call("/api/admin/count", "POST", { count: 5 });
await call("/api/admin/limit", "POST", { limitMs: 120000 });
await call("/api/join", "POST", { name: "Buyer" });
r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
await sleep(Math.max(0, r.data.startsAt - Date.now()) + 250);

let st = (await call("/api/state")).data;
/* canReveal lives at the TOP LEVEL of the payload. The client once read it as
   state.current.canReveal, which is always undefined, so Buy a letter was
   permanently greyed out. Assert both halves of that contract. */
check("canReveal is a top-level boolean on the payload",
  typeof st.canReveal === "boolean", `canReveal=${st.canReveal} (current.canReveal=${st.current?.canReveal})`);
check("an open word can have a letter bought", st.canReveal === true,
  `status=${st.current?.status} len=${st.current?.length}`);

check("a word is in hand to buy letters on",
  !!st.current && st.current.status === "open" && !!st.current.startedAt,
  `status=${st.current && st.current.status}`);
const remaining = (x) => x.limitMs - (x.serverNow - x.current.startedAt);
const before = remaining(st);
const wordLen = st.current.length;
/* A word may already be showing letters the round gave away, so measure the
   change rather than assuming it starts bare. */
const shownBefore = st.current.revealed.length;
r = await call("/api/reveal", "POST");
check("taking a letter adds exactly one, in position",
  r.data.current.revealed.length === shownBefore + 1
    && r.data.current.revealed.every((x) => Number.isInteger(x.i) && /^[A-Z]$/.test(x.ch)),
  `${shownBefore} -> ${r.data.current.revealed.length}: ${JSON.stringify(r.data.current.revealed)}`);
check("buying a letter costs time off that word",
  remaining(r.data) < before - (st.revealCostMs - 1500),
  `${Math.round(before / 1000)}s -> ${Math.round(remaining(r.data) / 1000)}s, cost ${st.revealCostMs / 1000}s`);
check("the rest of the word is still hidden",
  r.data.current.answer === null && r.data.current.revealed.length < wordLen);

/* It must never hand over the final unknown letter. */
for (let i = 0; i < wordLen + 2; i++) {
  const res = await call("/api/reveal", "POST");
  if (res.status === 409) break;
  if (res.data?.current?.status !== "open") break;
}
st = (await call("/api/state")).data;
if (st.current.status === "open") {
  check("at least one letter always stays unknown",
    st.current.revealed.length <= st.current.length - 1 && st.canReveal === false,
    `revealed ${st.current.revealed.length}/${st.current.length}`);
} else {
  check("word closed because the letters ate the clock", true, `status=${st.current.status}`);
}

/* Skipping. */
await call("/api/admin/reset", "POST");
await call("/api/admin/skips", "POST", { skips: 1 });
await call("/api/admin/limit", "POST", { limitMs: 90000 });
await call("/api/join", "POST", { name: "Skipper" });
r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
await sleep(Math.max(0, r.data.startsAt - Date.now()) + 250);
r = await call("/api/skip", "POST");
check("skip closes the word as missed",
  r.data.current.status === "lose" && r.data.current.skipped === true);
check("skip reveals the answer", typeof r.data.current.answer === "string");
check("skip spends the allowance", r.data.skipsLeft === 0, `left=${r.data.skipsLeft}`);
check("a skipped word is marked apart from a miss", r.data.results[0] === -2, `code=${r.data.results[0]}`);
r = await call("/api/next", "POST");
r = await call("/api/skip", "POST");
check("skipping past the allowance is refused", r.status === 409 && r.data.error === "no_skips_left");
r = await call("/api/admin/board");
const me2 = r.data.players[0];
check("the board counts skips and letters bought",
  me2.skips === 1 && me2.reveals >= 0, `skips=${me2.skips} reveals=${me2.reveals}`);
check("the board reports the skip allowance and letter cost",
  r.data.skipsAllowed === 1 && r.data.revealCostMs > 0,
  `allowed=${r.data.skipsAllowed} cost=${r.data.revealCostMs}`);

// ---- the client actually ships the features ------------------------------
/*
 * Several times now an edit has landed a function in app.js that nothing calls,
 * because a replacement matched a stale string -- the lifeline buttons shipped as
 * dead code this way. These assertions read the file the browser is served and
 * check each feature is referenced, not merely defined.
 */
/* Cloudflare puts a 4-hour browser cache on assets, so a deploy must change the
   URL or a returning browser keeps the old app.js for hours. */
const indexHtml = await (await fetch(BASE + "/")).text();
check("the player page versions its asset URLs",
  /src="\/app\.js\?v=/.test(indexHtml), (indexHtml.match(/src="\/app\.js[^"]*"/) || [])[0]);
const indexHead = await fetch(BASE + "/");
check("the player page itself is not browser-cached",
  /no-cache|no-store/i.test(indexHead.headers.get("cache-control") || ""),
  indexHead.headers.get("cache-control"));

const appJs = await (await fetch(BASE + "/app.js")).text();
for (const [what, needle] of [
  ["the lifelines are rendered", "keyboard() + lifelines()"],
  ["the buy-a-letter button is wired", 'id="revealBtn"'],
  ["buy-a-letter reads canReveal from the right place", "state.canReveal ?"],
  ["the bigger-hint button is wired", 'id="hintBtn"'],
  ["the bigger hint is rendered", 'class="bighint"'],
  ["the skip button is wired", 'id="skipBtn"'],
  ["given letters are placed in the grid, not listed under it", '" hit given" : " hit carried"'],
  ["a green you landed carries into the row you are typing", 'if (r.marks[i] === "hit") m.set(i, r.guess[i])'],
  ["typing fills only the blank positions", "typed.length >= freeSlots().length"],
  ["the guess is assembled from given and typed letters", "function assembled()"],
  ["auto-advance is scheduled", "autoNextTimer = setTimeout(goNext"],
  ["the sound control is armed", "Sfx?.button("],
  ["the last word advances to the results by itself", "state.done) {\n      finalSeen = true"],
]) {
  check(what, appJs.includes(needle), needle);
}
const soundJs = await (await fetch(BASE + "/sound.js")).text();
for (const [what, needle] of [
  ["audio unlocks on any gesture", 'addEventListener("pointerdown", go, true)'],
  ["an on-but-locked button unlocks instead of muting", "ctx.state !== \"running\""],
  ["the label admits when it is locked", "Sound on - tap"],
  ["the bed is mixed loud enough to hear", "pad(chord.root / 2, at, bar, 0.26)"],
  ["the bus has a compressor for headroom", "createDynamicsCompressor"],
  ["there is an on-demand sound test", "function demo()"],
]) {
  check(what, soundJs.includes(needle), needle);
}

const adminJs = await (await fetch(BASE + "/admin.js")).text();
for (const [what, needle] of [
  ["focus mode is wired", 'id="focusBtn"'],
  ["focus hides the controls", "hideinfocus"],
  ["the skip allowance control is wired", "data-skips"],
  ["the board shows skips and letters bought", "p.reveals"],
  ["the help control is wired", "data-help"],
  ["the level picker is wired", "data-level"],
  ["the full-screen QR is available from either tab", 'id="bigQrBtn"'],
  ["the full-screen QR has a Q shortcut", 'toLowerCase() === "q"'],
  ["the board ranks on points client-side too", "function ranked()"],
  ["rows flash when someone moves up", "movedup"],
  ["the board shows hints used", "p.hints"],
  ["the host can test sound on demand", 'id="testSound"'],
  ["the host is told the audio state", 'id="soundState"'],
]) {
  check(what, adminJs.includes(needle), needle);
}

// ---- how much help ---------------------------------------------------------
r = await call("/api/admin/help", "POST", { help: "nonsense" });
check("bogus help level refused", r.status === 400 && r.data.error === "bad_help");

const skel = (x) => (x.current.revealed || []).length;
for (const [level, freeExpected, costExpected] of [["off", 0, null], ["helpful", 1, 10000], ["generous", 2, 0]]) {
  await call("/api/admin/reset", "POST");
  await call("/api/admin/count", "POST", { count: 3 });
  await call("/api/admin/limit", "POST", { limitMs: 90000 });
  r = await call("/api/admin/help", "POST", { help: level });
  check(`help level "${level}" accepted`, r.data.ok === true && r.data.help === level);
  await call("/api/join", "POST", { name: "Helper" });
  r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
  await sleep(Math.max(0, r.data.startsAt - Date.now()) + 250);

  let st = (await call("/api/state")).data;
  /* A word can be shorter than the allowance, which caps at length - 1. */
  const cap = Math.min(freeExpected, st.current.length - 1);
  check(`"${level}" opens a word with ${cap} letter(s) showing`, skel(st) === cap,
    `showing ${skel(st)} of ${st.current.length}`);
  if (costExpected !== null) {
    check(`"${level}" charges ${costExpected / 1000}s a letter`, st.revealCostMs === costExpected,
      `${st.revealCostMs}ms`);
  }

  /* The bigger hint is free: the clock must not move because of it. */
  const before = st.limitMs - (st.serverNow - st.current.startedAt);
  st = (await call("/api/bighint", "POST")).data;
  const after = st.limitMs - (st.serverNow - st.current.startedAt);
  check(`"${level}" bigger hint returns the shape of the word`,
    typeof st.current.bigHint === "string" && /starts with [A-Z]/.test(st.current.bigHint),
    st.current.bigHint);
  check(`"${level}" bigger hint costs no time`, Math.abs(before - after) < 1500,
    `${Math.round(before / 1000)}s then ${Math.round(after / 1000)}s`);
  check(`"${level}" bigger hint never names the answer`,
    !st.current.bigHint.includes(st.current.answer || "\u0000"));

  if (costExpected === 0) {
    const t0 = st.limitMs - (st.serverNow - st.current.startedAt);
    const r2 = await call("/api/reveal", "POST");
    if (r2.status === 200 && r2.data.current.status === "open") {
      const t1 = r2.data.limitMs - (r2.data.serverNow - r2.data.current.startedAt);
      check(`"${level}" a letter really is free`, Math.abs(t0 - t1) < 1500,
        `${Math.round(t0 / 1000)}s then ${Math.round(t1 / 1000)}s`);
    }
  }
  const bd = await call("/api/admin/board");
  check(`"${level}" board counts the hint`, bd.data.players[0].hints >= 1, `hints=${bd.data.players[0].hints}`);
}
await call("/api/admin/help", "POST", { help: "helpful" });

// ---- levels and points -----------------------------------------------------
/* The level is lobby-only, so reach the validation path from the lobby. */
await call("/api/admin/reset", "POST");
r = await call("/api/admin/level", "POST", { level: 99 });
check("bogus level refused", r.status === 400 && r.data.error === "bad_level", `status=${r.status}`);

const { BUILTIN_PUZZLES: POOL, levelById } = await import("../src/words.js");
for (const lvl of [1, 3, 5]) {
  await call("/api/admin/reset", "POST");
  await call("/api/admin/count", "POST", { count: 6 });
  r = await call("/api/admin/level", "POST", { level: lvl });
  check(`level ${lvl} accepted`, r.data.ok === true && r.data.level === lvl);
  await call("/api/join", "POST", { name: "Lvl" });
  r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
  await sleep(Math.max(0, r.data.startsAt - Date.now()) + 250);
  const want = levelById(lvl).tiers;
  /* Walk the whole round and confirm every word came from this level's band. */
  const seenTiers = new Set();
  for (let i = 0; i < 6; i++) {
    let st = (await call("/api/state")).data;
    if (!st.current || !st.current.tier) break;
    seenTiers.add(st.current.tier);
    for (let g = 0; g < 6; g++) {
      const res = await call("/api/guess", "POST", { guess: "Z".repeat(st.current.length) });
      if (res.status !== 200) break;
      st = res.data;
      if (st.current.status !== "open") break;
    }
    if (i < 5) await call("/api/next", "POST");
  }
  check(`level ${lvl} only draws on ${want.join(" and ")}`,
    [...seenTiers].every((t) => want.includes(t)), [...seenTiers].join(", "));
}
r = await call("/api/admin/level", "POST", { level: 1 });

/* Points must punish taking letters you were not given. */
await call("/api/admin/reset", "POST");
await call("/api/admin/count", "POST", { count: 3 });
await call("/api/admin/help", "POST", { help: "generous" });
await call("/api/join", "POST", { name: "Scorer" });
r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
await sleep(Math.max(0, r.data.startsAt - Date.now()) + 250);
let sc = (await call("/api/state")).data;
const answer3 = POOL.find((p) => p.hint === sc.current.hint).answer;
check("score starts at zero", sc.score === 0, `score=${sc.score}`);
const freeGiven = sc.current.revealed.length;
r = await call("/api/guess", "POST", { guess: answer3 });
const unaided = r.data.score;
check("a first-guess solve scores well even with the free letters",
  unaided >= 140, `score=${unaided} after ${freeGiven} free letters`);
check("the board reports points and ranks on them",
  (await call("/api/admin/board")).data.players[0].score === unaided);
await call("/api/admin/help", "POST", { help: "helpful" });

// ---- climbing a level without losing the board -----------------------------
/* The point of /advance: a team works up from Level 1 and the standings follow
   them. A reset is the only other way to change level, and it deletes everyone. */
await call("/api/admin/reset", "POST");
await call("/api/admin/count", "POST", { count: 5 });
await call("/api/admin/level", "POST", { level: 1 });

/** Solve every word of the level as whoever is current, returning their words. */
async function playOut(n) {
  const got = [];
  for (let i = 0; i < n; i++) {
    const now = (await call("/api/state")).data;
    const puz = POOL.find((q) => q.hint === now.current.hint);
    got.push(puz.answer);
    await call("/api/guess", "POST", { guess: puz.answer });
    if (i < n - 1) await call("/api/next", "POST");
  }
  return got;
}
const rowFor = (bd, name) => bd.players.find((x) => x.name === name);

as("me");    await call("/api/join", "POST", { name: "Climber" });
as("other"); await call("/api/join", "POST", { name: "Tagalong" });
r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
await sleep(Math.max(0, r.data.startsAt - Date.now()) + 250);

as("me");
const climbWords1 = await playOut(5);
let climbBd = (await call("/api/admin/board")).data;
const climb1 = rowFor(climbBd, "Climber");
check("level 1 played out and scored", climb1.score > 0 && climb1.solved === 5,
  `score=${climb1.score} solved=${climb1.solved}/${climb1.words}`);
check("the board counts this level's words", climb1.words === 5, `words=${climb1.words}`);

r = await call("/api/admin/advance", "POST", { level: 99 });
check("advance refuses a level that does not exist", r.status === 400 && r.data.error === "bad_level",
  `status=${r.status}`);

r = await call("/api/admin/advance", "POST");
check("advance with no level climbs by one", r.data.ok === true && r.data.level === 2, `level=${r.data.level}`);
check("advance banks every player", r.data.banked === 2, `banked=${r.data.banked}`);
check("advance counts who was still mid-word", r.data.unfinished === 1, `unfinished=${r.data.unfinished}`);

climbBd = (await call("/api/admin/board")).data;
check("nobody is kicked by advancing", climbBd.players.length === 2, `players=${climbBd.players.length}`);
check("the round is back in the lobby", climbBd.phase === "lobby", `phase=${climbBd.phase}`);
check("the session is on its second level", climbBd.stage === 2 && climbBd.level === 2,
  `stage=${climbBd.stage} level=${climbBd.level}`);
const climb2 = rowFor(climbBd, "Climber");
check("points survive the climb", climb2.score === climb1.score, `${climb1.score} -> ${climb2.score}`);
check("solves survive the climb", climb2.solved === 5, `solved=${climb2.solved}`);
check("the new level's words join the denominator", climb2.words === 10, `words=${climb2.words}`);
check("this level's own score starts again at zero", climb2.stageScore === 0, `stageScore=${climb2.stageScore}`);
check("the pips are cleared for the new level", climb2.results.every((v) => v === 0), climb2.results.join(","));

as("me");
let climbSt = (await call("/api/state")).data;
check("the player is waiting, not ejected", climbSt.joined === true && climbSt.waiting === true,
  `joined=${climbSt.joined} waiting=${climbSt.waiting}`);
check("the player keeps their banked points", climbSt.overall.score === climb1.score,
  `overall=${climbSt.overall.score} banked=${climb1.score}`);
check("the player's own level score is reset", climbSt.score === 0, `score=${climbSt.score}`);
check("the player is told which level is coming",
  climbSt.stage === 2 && climbSt.level === 2 && !!climbSt.levelName,
  `stage=${climbSt.stage} level=${climbSt.level} name=${climbSt.levelName}`);

r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
await sleep(Math.max(0, r.data.startsAt - Date.now()) + 250);
as("me");
const climbWords2 = await playOut(5);
const tierOf = (w) => POOL.find((q) => q.answer === w).tier;
check("level 2 draws on its own tiers",
  climbWords2.every((w) => levelById(2).tiers.includes(tierOf(w))),
  climbWords2.map(tierOf).join(", "));
check("a climbed level never hands back a word already played",
  climbWords2.every((w) => !climbWords1.includes(w)),
  `level 1: ${climbWords1.join(",")} / level 2: ${climbWords2.join(",")}`);

climbBd = (await call("/api/admin/board")).data;
const climb3 = rowFor(climbBd, "Climber");
check("points add up across both levels", climb3.score > climb1.score,
  `${climb1.score} -> ${climb3.score}`);
check("solves add up across both levels", climb3.solved === 10, `solved=${climb3.solved}/${climb3.words}`);
check("this level alone is also reported",
  climb3.stageScore > 0 && climb3.stageScore < climb3.score,
  `thisLevel=${climb3.stageScore} total=${climb3.score}`);
check("the player sees the same running total as the board",
  (await call("/api/state")).data.overall.score === climb3.score);

/* And a reset still means a reset: the banked totals go with the players. */
await call("/api/admin/reset", "POST");
as("me"); await call("/api/join", "POST", { name: "Climber" });
climbSt = (await call("/api/state")).data;
check("a reset clears the banked points too",
  (climbSt.overall?.score ?? 0) === 0 && climbSt.stage === 1,
  `overall=${climbSt.overall?.score} stage=${climbSt.stage}`);
await call("/api/admin/reset", "POST");
as("me");

// ---- themes ---------------------------------------------------------------
r = await call("/api/theme");
check("active theme is public", r.status === 200 && !!r.data.theme && !!r.data.theme.id);
const firstTheme = r.data.theme.id;
check("theme carries a scene and a wordmark",
  !!r.data.theme.scene && !!r.data.theme.wordmark.lead, `scene=${r.data.theme.scene}`);
check("theme palette is hex only",
  Object.values(r.data.theme.palette || {}).every((v) => /^#[0-9a-f]{3,8}$/i.test(v)));

r = await call("/api/admin/themes");
check("theme list for the host", r.status === 200 && r.data.themes.length >= 2,
  `themes=${(r.data.themes || []).map((t) => t.id).join(",")}`);
const other = r.data.themes.map((t) => t.id).find((id) => id !== firstTheme);
r = await call("/api/admin/theme", "POST", { id: other });
check("theme switch accepted", r.data.ok === true && r.data.theme.id === other);
r = await call("/api/theme");
check("switch is visible to players", r.data.theme.id === other);
r = await call("/api/admin/theme", "POST", { id: "no-such-theme" });
check("unknown theme refused", r.status === 400 && r.data.error === "unknown_theme");
r = await call("/api/admin/theme", "POST", { id: firstTheme });
check("theme switched back", r.data.ok === true);
r = await call("/assets/../src/server.js");
check("asset route refuses path traversal", r.status === 404, `status=${r.status}`);

// ---- word list validation
r = await call("/api/admin/words", "PUT", { puzzles: [{ answer: "XX", hint: "too short" }] });
check("bad word list refused", r.status === 400, r.data?.message);
r = await call("/api/admin/words", "PUT", { puzzles: [{ answer: "LOKI", hint: "loki himself" }] });
check("clue that leaks its answer refused", r.status === 400, r.data?.message);

// reset
r = await call("/api/admin/reset", "POST");
check("reset accepted", r.data.ok === true);
r = await call("/api/admin/board");
check("board empty after reset", r.data.players.length === 0);
r = await call("/api/admin/board");
check("reset returns the round to the lobby", r.data.phase === "lobby" && r.data.startsAt === null);
r = await call("/api/state");
check("reset clears the player server-side", r.data.joined === false);
r = await call("/api/join", "POST", { name: "Tester" });
check("re-entry waits in the lobby again",
  r.data.waiting === true && r.data.idx === 0 && r.data.solved === 0,
  `phase=${r.data.phase}`);
r = await call("/api/admin/board");
check("board shows the re-entered player at zero",
  r.data.players.length === 1 && r.data.players[0].solved === 0);
r = await call("/api/admin/start", "POST", { countdownMs: 3000 });
check("a second round can be started", r.data.ok === true);

// ---- a reset must not quietly readmit anyone the host removed -------------
// The reset above ejected everyone, so Rival has to come back in first.
as("other");
r = await call("/api/join", "POST", { name: "Rival" });
check("ejected player can rejoin deliberately", r.status === 200 && r.data.removed === false);
r = await call("/api/admin/board");
const victim = r.data.players.find((p) => p.name === "Rival");
if (victim) {
  await call("/api/admin/kick", "POST", { playerId: victim.id });
  r = await call("/api/state");
  check("removed player is out", r.data.removed === true);
  r = await call("/api/admin/board");
  const listed = r.data.blocked.find((b) => b.id === victim.id);
  check("the removed list names them while the round stands", !!listed && listed.name === "Rival",
    `name=${listed && listed.name}`);
  r = await call("/api/join", "POST", { name: "Rival" });
  check("a removed player cannot rejoin the same round", r.data.removed === true);

  r = await call("/api/admin/reset", "POST");
  check("a reset clears the removed list", r.data.blocked === 0, `blocked=${r.data.blocked}`);
  r = await call("/api/admin/board");
  check("removed list is empty after a reset", r.data.blocked.length === 0);
  r = await call("/api/join", "POST", { name: "Rival" });
  check("they can join the next round normally", r.data.removed === false);

  /* And the explicit control, for clearing without resetting. */
  await call("/api/admin/kick", "POST", { playerId: victim.id });
  r = await call("/api/admin/clear-removed", "POST");
  check("clear-removed empties the list", r.data.ok === true && r.data.cleared >= 1);
  r = await call("/api/admin/board");
  check("nothing left on the removed list", r.data.blocked.length === 0);
} else {
  check("rival present to remove", false, "could not find the second player");
}
as("me");

} catch (e) {
  /* A thrown error used to skip the cleanup below, which is how residue got left
     in the first place. Record it as a failure and fall through. */
  check("suite ran to completion without throwing", false, `${e && e.message}`);
}

/*
 * Tidy up, whatever happened above. This suite drives a real server against a
 * real database -- the local Docker stack shares its volume with actual play --
 * so it must not leave players, removals or a half-finished round behind. It
 * previously left a blocked player called "Rival" in the removed list for good.
 */
try {
  as("me");
  await call("/api/admin/clear-removed", "POST");
  await call("/api/admin/reset", "POST");
  const after = await call("/api/admin/board");
  const clean = (after.data?.players?.length ?? 0) === 0
    && (after.data?.blocked?.length ?? 0) === 0
    && after.data?.phase === "lobby";
  check("suite leaves no players, removals or running round behind", clean,
    `players=${after.data?.players?.length} blocked=${after.data?.blocked?.length} phase=${after.data?.phase}`);
} catch (e) {
  check("cleanup ran", false, e.message);
}

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

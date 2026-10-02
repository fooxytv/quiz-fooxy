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

// health
let r = await call("/healthz");
check("healthz responds", r.status === 200 && r.data.ok);

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
const wrong = "ZZZZZZZZ".slice(0, len);
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
const { BUILTIN_PUZZLES } = await import("../src/words.js");
const p2 = BUILTIN_PUZZLES[1].answer;
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

console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

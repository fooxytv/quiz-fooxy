/*
 * Host-login suite. Boots its own server on a throwaway database with a known
 * password, so it exercises the real password path rather than the local
 * bypass -- then checks that a session cannot be forged, that brute force gets
 * locked out, and that players are never asked for anything.
 *
 *   npm run test:auth
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";

const PORT = Number(process.env.PORT || 3213);
const PW = "a-long-test-password-9x7q";
const B = `http://127.0.0.1:${PORT}`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mq-auth-"));

const child = spawn(process.execPath, [path.join(import.meta.dirname, "../src/server.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR: dir,
    COOKIE_SECURE: "false",
    ADMIN_PASSWORD: PW,
    PUBLIC_URL: B,
    ADMIN_DEV_BYPASS: "",
    ADMIN_INSECURE_LOCAL: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => { log += d; });
child.stderr.on("data", (d) => { log += d; });

function stop() {
  try { child.kill(); } catch {}
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}
process.on("exit", stop);

for (let i = 0; i < 100; i++) {
  try { if ((await fetch(B + "/healthz")).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

let fails = 0;
const ok = (l, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"}  ${l}${x ? "  " + x : ""}`); };
ok("the server reports password auth", /admin auth +password/.test(log), log.match(/admin auth.*/)?.[0]);


/* fetch() refuses to send an Upgrade header, so the websocket handshake needs a
   raw socket. Returns the numeric status from the response line. */
function upgrade(path, cookie) {
  return new Promise((resolve) => {
    const s = net.connect(PORT, "127.0.0.1", () => {
      s.write(
        `GET ${path} HTTP/1.1\r\n` +
        `Host: 127.0.0.1:${PORT}\r\n` +
        "Connection: Upgrade\r\nUpgrade: websocket\r\n" +
        "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n" +
        (cookie ? `Cookie: ${cookie}\r\n` : "") +
        "\r\n"
      );
    });
    let buf = "";
    const done = (v) => { try { s.destroy(); } catch {} resolve(v); };
    s.on("data", (d) => {
      buf += d.toString("latin1");
      if (buf.includes("\r\n")) done(Number((buf.split("\r\n")[0].match(/ (\d{3}) /) || [])[1] || 0));
    });
    s.on("error", () => done(0));
    setTimeout(() => done(0), 3000);
  });
}

async function call(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const r = await fetch(B + path, {
    method, redirect: "manual",
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setC = (r.headers.getSetCookie?.() || []).find((c) => c.startsWith("mwq_admin=")) || "";
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch {}
  return { status: r.status, data, text, setC };
}

let r = await call("/admin");
ok("unauthenticated /admin serves the login form", r.status === 200 && r.text.includes("Password, please"));
ok("the login form does not leak the password", !r.text.includes(PW));

r = await call("/api/admin/board");
ok("admin API refuses without a session", r.status === 403 && r.data.error === "admin_only");

let wsStatus = await upgrade("/ws/admin");
ok("admin websocket refuses without a session", wsStatus === 403, `status=${wsStatus}`);

r = await call("/api/admin/login", { method: "POST", body: { password: "obviously-wrong" } });
ok("a wrong password is refused", r.status === 401 && r.data.error === "bad_password", r.data?.message);
ok("the refusal says how many tries are left", /tries|try/.test(r.data?.message || ""));

r = await call("/api/admin/login", { method: "POST", body: { password: PW } });
ok("the right password is accepted", r.status === 200 && r.data.ok === true);
ok("it sets an httpOnly session cookie", /HttpOnly/i.test(r.setC), r.setC.split(";").slice(1).join(";").trim());
ok("the cookie is not the password", !r.setC.includes(PW));
const session = r.setC.split(";")[0];

r = await call("/api/admin/board", { cookie: session });
ok("the session opens the admin API", r.status === 200 && Array.isArray(r.data.players));
r = await call("/admin", { cookie: session });
ok("the session opens the host screen", r.status === 200 && r.text.includes('id="tabBoard"'));
wsStatus = await upgrade("/ws/admin", session);
ok("the session opens the admin websocket", wsStatus === 101, `status=${wsStatus}`);

/* A tampered cookie must not work. */
const tampered = session.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
r = await call("/api/admin/board", { cookie: tampered });
ok("a tampered session is refused", r.status === 403);
const forged = "mwq_admin=" + (Date.now() + 9e9) + ".notarealsignature";
r = await call("/api/admin/board", { cookie: forged });
ok("a forged session is refused", r.status === 403);

/* Players are never asked for anything. */
r = await call("/");
ok("the player page stays open to everyone", r.status === 200);
r = await call("/api/state");
ok("the player API stays open to everyone", r.status === 200);

/* Brute force gets shut down. */
let locked = null;
for (let i = 0; i < 9; i++) {
  const a = await call("/api/admin/login", { method: "POST", body: { password: "nope-" + i } });
  if (a.status === 429) { locked = a; break; }
}
ok("repeated wrong guesses get locked out", !!locked && locked.data.error === "locked", locked?.data?.message);
r = await call("/api/admin/login", { method: "POST", body: { password: PW } });
ok("the lockout applies even to the correct password", r.status === 429, `status=${r.status}`);

/* The raw filenames must not bypass the check. */
for (const p of ["/admin.html", "/login.html"]) {
  const raw = await call(p);
  ok(`${p} does not serve the host UI unauthenticated`,
    raw.status === 302 || !raw.text.includes('id="tabBoard"'), `status=${raw.status}`);
}

/* An auth-sensitive page must not be cached, or a stale login page looks like a
   rejected password. */
const hdr = await fetch(B + "/admin", { redirect: "manual" });
ok("the host page is not cacheable",
  /no-store/i.test(hdr.headers.get("cache-control") || ""), hdr.headers.get("cache-control"));
ok("the host page sends no cache validators",
  !hdr.headers.get("last-modified") && !hdr.headers.get("etag"),
  `last-modified=${hdr.headers.get("last-modified")} etag=${hdr.headers.get("etag")}`);

/*
 * The one that bit in practice: both pages share a URL, so a browser holding the
 * cached login page asks "changed?" and a 304 makes it re-render the login form --
 * which looks exactly like the password doing nothing until a manual refresh.
 */
const cond = await fetch(B + "/admin", {
  headers: { Cookie: session, "If-Modified-Since": "Thu, 01 Jan 2099 00:00:00 GMT" },
  redirect: "manual",
});
const condBody = await cond.text();
ok("an authenticated request is never answered 304", cond.status === 200, `status=${cond.status}`);
ok("a conditional request still gets the HOST screen, not the login form",
  condBody.includes('id="tabBoard"') && !condBody.includes("Password, please"));

r = await call("/api/admin/logout", { method: "POST", cookie: session });
ok("logout responds", r.status === 200);

console.log(fails ? `\n${fails} LOGIN CHECK(S) FAILED` : "\nALL LOGIN CHECKS PASSED");
stop();
process.exit(fails ? 1 : 0);

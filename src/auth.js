/*
 * Who is allowed to run a quiz.
 *
 * Two ways, checked in this order:
 *
 *   1. A password you set in ADMIN_PASSWORD. Posting it once exchanges it for a
 *      signed, httpOnly session cookie. This is the plain-tunnel route: the site
 *      is public, and this is the only thing standing in front of the host
 *      screen, so it is built to take a kicking -- hashed constant-time
 *      comparison, an HMAC-signed token that carries no secret, and per-IP
 *      lockout after repeated failures.
 *
 *   2. Cloudflare Access, if you happen to run Zero Trust. The edge checks the
 *      identity and forwards a signed JWT, which is verified here against the
 *      team's public keys and audience tag -- so reaching the origin by any other
 *      route proves nothing.
 *
 * With neither configured the host screen is sealed rather than open. Players are
 * never asked for anything either way.
 */
import crypto from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getSetting, setSetting } from "./db.js";

const TEAM_DOMAIN = (process.env.CF_ACCESS_TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const AUD = process.env.CF_ACCESS_AUD || "";
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const DEV_BYPASS = process.env.ADMIN_DEV_BYPASS === "1";
const SESSION_DAYS = Number(process.env.ADMIN_SESSION_DAYS || 14);

/*
 * Testing the built image locally is awkward: the container sees the Docker
 * bridge address, never loopback, so the bypass above cannot fire and /admin
 * 403s. This flag widens it to private address ranges -- and is HARD-INTERLOCKED
 * to a non-production NODE_ENV, because the deployed image sets
 * NODE_ENV=production and cloudflared also reaches the app from a private
 * address. So even if this is left in a .env on the server it cannot open the
 * admin portal there.
 */
const INSECURE_LOCAL =
  process.env.ADMIN_INSECURE_LOCAL === "1" && process.env.NODE_ENV !== "production";

export const ADMIN_COOKIE = "mwq_admin";
export const accessConfigured = Boolean(TEAM_DOMAIN && AUD);
export const passwordConfigured = Boolean(PASSWORD);
export const insecureLocal = INSECURE_LOCAL;
export const devBypass = DEV_BYPASS;
export const sessionMs = Math.max(1, SESSION_DAYS) * 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ utils --- */

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function rawIp(req) {
  /* Behind the tunnel Express resolves the forwarded client address, which is
     what we want to rate-limit; the socket address would be the connector. */
  return String(req.ip || req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
}

function isLoopback(req) {
  const ip = String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  return ip === "127.0.0.1" || ip === "::1";
}

/** Docker bridge, LAN and loopback. Only consulted when INSECURE_LOCAL is on. */
function isPrivate(req) {
  const ip = String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  if (isLoopback(req)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  if (/^(fc|fd)/i.test(ip)) return true;
  return false;
}

/* --------------------------------------------------------- password login --- */

/* Persisted so sessions survive a restart, random so tokens cannot be forged. */
function sessionSecret() {
  let s = getSetting("adminSessionSecret");
  if (!s) {
    s = crypto.randomBytes(32).toString("hex");
    setSetting("adminSessionSecret", s);
  }
  return s;
}

/* Binding the token to the password means changing the password logs everyone
   out, without having to track sessions anywhere. */
function passwordFingerprint() {
  return crypto.createHash("sha256").update(PASSWORD).digest("hex").slice(0, 16);
}

function sign(value) {
  return crypto
    .createHmac("sha256", sessionSecret())
    .update(`${value}|${passwordFingerprint()}`)
    .digest("base64url");
}

export function mintSession() {
  const expires = Date.now() + sessionMs;
  return `${expires}.${sign(String(expires))}`;
}

function sessionValid(token) {
  const [expStr, sig] = String(token || "").split(".");
  const expires = Number(expStr);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = sign(expStr);
  const a = Buffer.from(String(sig || ""), "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Constant-time, and length-safe because both sides are hashed first. */
export function passwordMatches(given) {
  if (!PASSWORD) return false;
  const a = crypto.createHash("sha256").update(String(given ?? "")).digest();
  const b = crypto.createHash("sha256").update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

/* ---------------------------------------------------------- rate limiting --- */

const attempts = new Map();   // ip -> { fails, until }
const MAX_FAILS = 5;
const LOCK_BASE_MS = 30000;

setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of attempts) {
    if (rec.until < now - 10 * 60 * 1000) attempts.delete(ip);
  }
}, 60000).unref();

/** Milliseconds still to wait, or 0 if a try is allowed now. */
export function lockedFor(req) {
  const rec = attempts.get(rawIp(req));
  if (!rec) return 0;
  return Math.max(0, rec.until - Date.now());
}

export function noteFailure(req) {
  const ip = rawIp(req);
  const rec = attempts.get(ip) || { fails: 0, until: 0 };
  rec.fails += 1;
  if (rec.fails >= MAX_FAILS) {
    /* Doubling each time past the threshold, capped at an hour. */
    const over = rec.fails - MAX_FAILS;
    rec.until = Date.now() + Math.min(60 * 60 * 1000, LOCK_BASE_MS * Math.pow(2, over));
  }
  attempts.set(ip, rec);
  return rec;
}

export function noteSuccess(req) {
  attempts.delete(rawIp(req));
}

/* -------------------------------------------------------------- verifying --- */

let jwks = null;
function keys() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`));
  return jwks;
}

/** Resolves the host's identity, or null. Never throws. */
export async function verifyAdmin(req) {
  if (DEV_BYPASS && isLoopback(req)) return { via: "dev", who: "dev@localhost" };
  if (INSECURE_LOCAL && isPrivate(req)) return { via: "local", who: "local@container" };

  if (PASSWORD) {
    const token = parseCookies(req.headers.cookie)[ADMIN_COOKIE];
    if (token && sessionValid(token)) return { via: "password", who: "host" };
  }

  if (accessConfigured) {
    const token =
      req.headers["cf-access-jwt-assertion"] ||
      parseCookies(req.headers.cookie).CF_Authorization;
    if (token) {
      try {
        const { payload } = await jwtVerify(token, keys(), {
          issuer: `https://${TEAM_DOMAIN}`,
          audience: AUD,
        });
        return { via: "access", who: payload.email || payload.sub || "unknown" };
      } catch (e) {
        /* fall through to refusal */
      }
    }
  }

  return null;
}

export function sealedMessage() {
  if (passwordConfigured || accessConfigured || DEV_BYPASS || INSECURE_LOCAL) {
    return "Those credentials were not accepted.";
  }
  return "The host screen is sealed: set ADMIN_PASSWORD (or Cloudflare Access) and restart.";
}

export function requireAdmin(req, res, next) {
  verifyAdmin(req)
    .then((who) => {
      if (!who) {
        res.status(403).json({ error: "admin_only", message: sealedMessage() });
        return;
      }
      req.admin = who;
      next();
    })
    .catch(() => res.status(403).json({ error: "admin_only" }));
}

/**
 * What the process actually received, without revealing it. A password that went
 * through a .env can arrive truncated at a `#`, stripped of quotes, or with a
 * stray trailing space -- all of which look like "the password does not work".
 */
export function passwordInfo() {
  const raw = process.env.ADMIN_PASSWORD;
  if (raw == null) return { set: false };
  const warnings = [];
  if (/#/.test(raw)) warnings.push("contains '#', which .env may treat as a comment");
  if (/\$/.test(raw)) warnings.push("contains '$', which compose may try to expand");
  if (/^["']|["']$/.test(raw)) warnings.push("starts or ends with a quote, which may have been kept literally");
  if (/^\s|\s$/.test(raw)) warnings.push("starts or ends with whitespace");
  if (raw.length > 0 && raw.length < 12) warnings.push(`only ${raw.length} characters`);
  return { set: raw.length > 0, length: raw.length, warnings };
}

export function authMode() {
  if (passwordConfigured && accessConfigured) return "password + Cloudflare Access";
  if (passwordConfigured) return "password";
  if (accessConfigured) return "Cloudflare Access";
  if (INSECURE_LOCAL) return "OPEN TO THE LOCAL NETWORK";
  if (DEV_BYPASS) return "DEV BYPASS (loopback only)";
  return "SEALED - set ADMIN_PASSWORD";
}

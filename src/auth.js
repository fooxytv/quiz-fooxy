/*
 * Admin access is proved by Cloudflare Access, not by a password this app holds.
 * Cloudflare validates the identity at the edge and forwards a signed JWT; we
 * verify it against the team's public keys and check the audience tag, so a
 * request that reaches the origin by any other route is refused.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

const TEAM_DOMAIN = (process.env.CF_ACCESS_TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const AUD = process.env.CF_ACCESS_AUD || "";
const DEV_BYPASS = process.env.ADMIN_DEV_BYPASS === "1";

/*
 * Testing the built image locally is awkward: the container sees the Docker
 * bridge address, never loopback, so the bypass above cannot fire and /admin
 * 403s. This flag widens it to private address ranges — and is HARD-INTERLOCKED
 * to a non-production NODE_ENV, because the deployed image sets
 * NODE_ENV=production and cloudflared also reaches the app from a private
 * address. So even if this is left in a .env on the server it cannot open the
 * admin portal there.
 */
const INSECURE_LOCAL =
  process.env.ADMIN_INSECURE_LOCAL === "1" && process.env.NODE_ENV !== "production";

let jwks = null;
function keys() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`));
  return jwks;
}

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
  return String(req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
}

function isLoopback(req) {
  const ip = rawIp(req);
  return ip === "127.0.0.1" || ip === "::1";
}

/** Docker bridge, LAN and loopback. Only consulted when INSECURE_LOCAL is on. */
function isPrivate(req) {
  const ip = rawIp(req);
  if (isLoopback(req)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return true;
  if (/^(fc|fd)/i.test(ip)) return true;
  return false;
}

export const accessConfigured = Boolean(TEAM_DOMAIN && AUD);
export const insecureLocal = INSECURE_LOCAL;
export const devBypass = DEV_BYPASS;

/** Resolves the admin's identity, or null. Never throws. */
export async function verifyAdmin(req) {
  if (DEV_BYPASS && isLoopback(req)) return { email: "dev@localhost", dev: true };
  if (INSECURE_LOCAL && isPrivate(req)) return { email: "local@container", dev: true };
  if (!accessConfigured) return null;
  const token =
    req.headers["cf-access-jwt-assertion"] ||
    parseCookies(req.headers.cookie).CF_Authorization;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, keys(), {
      issuer: `https://${TEAM_DOMAIN}`,
      audience: AUD,
    });
    return { email: payload.email || payload.sub || "unknown", dev: false };
  } catch (e) {
    return null;
  }
}

export function requireAdmin(req, res, next) {
  verifyAdmin(req).then((who) => {
    if (!who) {
      res.status(403).json({
        error: "admin_only",
        message: accessConfigured || DEV_BYPASS || INSECURE_LOCAL
          ? "Cloudflare Access did not vouch for this request."
          : "CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are not set, so the admin portal is sealed.",
      });
      return;
    }
    req.admin = who;
    next();
  }).catch(() => res.status(403).json({ error: "admin_only" }));
}

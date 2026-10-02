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

function isLoopback(req) {
  const ip = req.socket?.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export const accessConfigured = Boolean(TEAM_DOMAIN && AUD);

/** Resolves the admin's identity, or null. Never throws. */
export async function verifyAdmin(req) {
  if (DEV_BYPASS && isLoopback(req)) return { email: "dev@localhost", dev: true };
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
        message: accessConfigured || DEV_BYPASS
          ? "Cloudflare Access did not vouch for this request."
          : "CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are not set, so the admin portal is sealed.",
      });
      return;
    }
    req.admin = who;
    next();
  }).catch(() => res.status(403).json({ error: "admin_only" }));
}

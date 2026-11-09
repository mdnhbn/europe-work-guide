"use strict";

// This helper is called only after Supabase Auth accepts the bearer token via /auth/v1/user.
// That validation establishes the token signature; this code applies the admin MFA policy.
function hasAal2TotpSession(token, userId, nowMs = Date.now()) {
  if (typeof token !== "string" || typeof userId !== "string" || !userId) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return false;

  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) return false;

  const expiresAt = Number(claims.exp) * 1000;
  return claims.sub === userId &&
    claims.aal === "aal2" &&
    Number.isFinite(expiresAt) &&
    expiresAt > nowMs &&
    Array.isArray(claims.amr) &&
    claims.amr.some((entry) => entry && entry.method === "totp");
}

module.exports = { hasAal2TotpSession };

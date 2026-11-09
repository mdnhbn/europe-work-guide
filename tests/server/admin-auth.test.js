"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { hasAal2TotpSession } = require("../../server/admin-auth");

function makeToken(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.signature`;
}

test("accepts a current AAL2 session verified with TOTP for the allowlisted user", () => {
  const token = makeToken({
    sub: "admin-1",
    aal: "aal2",
    amr: [{ method: "totp", timestamp: 1 }, { method: "password", timestamp: 0 }],
    exp: 2,
  });
  assert.equal(hasAal2TotpSession(token, "admin-1", 1000), true);
});

test("rejects sessions that have not reached AAL2", () => {
  const token = makeToken({ sub: "admin-1", aal: "aal1", amr: [{ method: "totp" }], exp: 2 });
  assert.equal(hasAal2TotpSession(token, "admin-1", 1000), false);
});

test("rejects AAL2 sessions verified by a non-TOTP method", () => {
  const token = makeToken({ sub: "admin-1", aal: "aal2", amr: [{ method: "otp" }], exp: 2 });
  assert.equal(hasAal2TotpSession(token, "admin-1", 1000), false);
});

test("rejects a different user, expired token, and malformed token", () => {
  const claims = { sub: "admin-1", aal: "aal2", amr: [{ method: "totp" }], exp: 2 };
  assert.equal(hasAal2TotpSession(makeToken(claims), "admin-2", 1000), false);
  assert.equal(hasAal2TotpSession(makeToken(claims), "admin-1", 2000), false);
  assert.equal(hasAal2TotpSession("not-a-jwt", "admin-1", 1000), false);
});

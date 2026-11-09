"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const adminApi = require("./admin");

const base = "https://audit.example.test";
const auditUrl = `${base}/rest/v1/admin_audit_log`;
const admin = { id: "b71a65d1-50ba-4ed3-b066-b70a11726b7b", email: "admin@example.test" };
const claims = Buffer.from(JSON.stringify({
  sub: admin.id,
  exp: Math.floor(Date.now() / 1000) + 3600,
  aal: "aal2",
  amr: [{ method: "totp" }],
})).toString("base64url");

function response(status, data = null) {
  return new Response(data === null ? null : JSON.stringify(data), { status });
}

async function invoke(t, { resource = "countries", method = "POST", body, replies = [] }) {
  const env = {
    SUPABASE_URL: base,
    SUPABASE_ANON_KEY: "test-anon",
    SUPABASE_SERVICE_KEY: "test-service",
    ADMIN_EMAILS: admin.email,
    GITHUB_TOKEN: "test-github",
    GITHUB_REPOSITORY: "example/work-guide",
    GITHUB_BRANCH: "test",
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  t.mock.method(console, "error", () => {});
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET", body: options.body && JSON.parse(options.body) });
    if (url === `${base}/auth/v1/user`) return response(200, admin);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    assert.ok(next, `Unexpected fetch to ${url}`);
    return next;
  });
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  await adminApi({
    method,
    url: `/api/admin?resource=${resource}`,
    headers: { authorization: `Bearer test.${claims}.test` },
    body,
  }, res);
  return { res, calls };
}

const country = { code: "DE", name: "Germany" };

test("blocks a database write before mutation when the audit table is missing", async (t) => {
  const { res, calls } = await invoke(t, { body: { record: country }, replies: [response(404)] });

  assert.equal(res.statusCode, 503);
  assert.match(res.body.error, /operation was not attempted/i);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, auditUrl);
  assert.equal(calls[1].body.action, "create_or_upsert_requested");
  assert.deepEqual(calls[1].body.after_json, { id: "DE" });
});

test("blocks external workflow dispatch when the audit write fails on the network", async (t) => {
  const { res, calls } = await invoke(t, { resource: "scraper-run", replies: [new Error("offline")] });

  assert.equal(res.statusCode, 503);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, auditUrl);
  assert.equal(calls[1].body.action, "scraper_manual_run_requested");
});

test("keeps the mutation response if the separate completion event fails", async (t) => {
  const { res, calls } = await invoke(t, {
    body: { record: country },
    replies: [response(201), response(200, [country]), response(503)],
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, country);
  assert.deepEqual(calls.slice(1).map((call) => call.url), [
    auditUrl,
    `${base}/rest/v1/countries?on_conflict=code`,
    auditUrl,
  ]);
  assert.equal(calls[1].body.action, "create_or_upsert_requested");
  assert.equal(calls[3].body.action, "create_or_upsert");
  assert.deepEqual(calls[3].body.after_json, country);
});

test("rejects invalid input without recording an attempt", async (t) => {
  const { res, calls } = await invoke(t, { body: { record: { forbidden: true } } });

  assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 1);
});

test("keeps read access independent of audit write availability", async (t) => {
  const { res, calls } = await invoke(t, { method: "GET", replies: [response(200, [country])] });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [country]);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/countries\?select=\*/);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createCipheriv } = require("node:crypto");
const { gzipSync } = require("node:zlib");
const adminApi = require("../../api/admin");

const backupKey = "ab".repeat(32);

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
    BACKUP_ENCRYPTION_KEY: backupKey,
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

const legacyAccess = { country_code: "DE", nationality: "Bangladesh" };

function backupBody(access) {
  const tables = {
    profiles: [],
    countries: [],
    country_access: [access],
    visa_routes: [],
    jobs: [],
    source_pages: [],
  };
  const iv = Buffer.alloc(12, 5);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(backupKey, "hex"), iv);
  const payload = gzipSync(Buffer.from(JSON.stringify({ export_version: "1.0", tables })));
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  return {
    action: "restore",
    mode: "merge",
    confirm: true,
    backup: {
      format: "europe-work-guide-encrypted-backup",
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: ciphertext.toString("base64"),
    },
  };
}

function missingResidenceColumn() {
  return response(400, { code: "42703", message: "column country_access.residence_country does not exist" });
}

function restoreReplies(probe) {
  return [probe, ...Array.from({ length: 6 }, () => response(200, [])), response(201), response(201), response(201)];
}

test("restores legacy access rows into a migrated database using generic residence scope", async (t) => {
  const { res, calls } = await invoke(t, {
    resource: "backup",
    body: backupBody(legacyAccess),
    replies: restoreReplies(response(200, [])),
  });
  const write = calls.find((call) => call.url.includes("country_access?on_conflict="));
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.restored_rows, 1);
  assert.match(decodeURIComponent(write.url), /on_conflict=country_code,nationality,residence_country$/);
  assert.deepEqual(write.body, [{ ...legacyAccess, residence_country: "ANY" }]);
});

test("keeps the legacy restore conflict target when the residence column is missing", async (t) => {
  const { res, calls } = await invoke(t, {
    resource: "backup",
    body: backupBody(legacyAccess),
    replies: restoreReplies(missingResidenceColumn()),
  });
  const write = calls.find((call) => call.url.includes("country_access?on_conflict="));
  assert.equal(res.statusCode, 200);
  assert.match(decodeURIComponent(write.url), /on_conflict=country_code,nationality$/);
  assert.deepEqual(write.body, [legacyAccess]);
});

test("rejects a residence-scoped restore into a legacy database before any writes", async (t) => {
  const { res, calls } = await invoke(t, {
    resource: "backup",
    body: backupBody({ ...legacyAccess, residence_country: "Saudi Arabia" }),
    replies: [missingResidenceColumn()],
  });

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /residence-aware matching migration/i);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "GET"]);
});

test("preserves specific residence scope when restoring into a migrated database", async (t) => {
  const access = { ...legacyAccess, residence_country: "Saudi Arabia" };
  const { res, calls } = await invoke(t, {
    resource: "backup",
    body: backupBody(access),
    replies: restoreReplies(response(200, [])),
  });
  const write = calls.find((call) => call.url.includes("country_access?on_conflict="));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(write.body, [access]);
});

test("saves valid source registry JSON to the configured branch", async (t) => {
  const config = {
    code: "DE",
    name: "Germany",
    language: "de",
    sources: [{ url: "https://www.make-it-in-germany.com/en/", type: "official", check_every_days: 7 }],
  };
  const existing = { ...config, name: "Existing" };
  const { res, calls } = await invoke(t, {
    resource: "sources",
    body: { config },
    replies: [
      response(200, [{ type: "file", name: "de.json" }]),
      response(200, { content: Buffer.from(JSON.stringify(existing)).toString("base64"), sha: "previous" }),
      response(201), response(200, { commit: { sha: "updated" } }), response(201),
    ],
  });

  assert.equal(res.statusCode, 200);
  assert.match(calls[1].url, /\/countries\?ref=test$/);
  assert.match(calls[2].url, /\/de\.json\?ref=test$/);
  const write = calls.find((call) => call.method === "PUT");
  const content = Buffer.from(write.body.content, "base64").toString("utf8");
  assert.equal(write.body.branch, "test");
  assert.equal(write.body.sha, "previous");
  assert.equal(content, JSON.stringify(config, null, 2) + "\n");
  assert.deepEqual(JSON.parse(content), config);
});

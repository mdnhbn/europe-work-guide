"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const accountDelete = require("./account-delete");

const envNames = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_KEY"];
let originalEnv;
let originalFetch;

test.beforeEach(() => {
  originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
  process.env.SUPABASE_URL = "https://supabase.example.test";
  process.env.SUPABASE_ANON_KEY = "test-anon";
  process.env.SUPABASE_SERVICE_KEY = "test-service";
  originalFetch = global.fetch;
});

test.afterEach(() => {
  for (const name of envNames) {
    if (originalEnv[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnv[name];
  }
  global.fetch = originalFetch;
});

function response(status, body = null) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

async function invoke(req) {
  const res = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await accountDelete(req, res);
  return res;
}

function deletionRequest(body = { confirm: true }) {
  return { method: "POST", headers: { authorization: "Bearer user-token" }, body };
}

test("fails closed when the service key is not configured", async () => {
  delete process.env.SUPABASE_SERVICE_KEY;
  global.fetch = async () => { throw new Error("fetch must not run"); };

  const result = await invoke(deletionRequest());
  assert.equal(result.statusCode, 503);
  assert.match(result.body.error, /not configured/i);
});

test("requires explicit confirmation before calling Supabase", async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error("fetch must not run"); };

  const result = await invoke(deletionRequest({ confirm: false }));
  assert.equal(result.statusCode, 400);
  assert.equal(calls, 0);
});

test("deletes the linked profile and authenticated user after verifying identity", async () => {
  const calls = [];
  const queued = [response(200, { id: "user-1" }), response(200, []), response(204)];
  global.fetch = async (url, options = {}) => { calls.push({ url: String(url), options }); return queued.shift(); };

  const result = await invoke(deletionRequest());
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.deleted, true);
  assert.equal(calls.length, 3);
  assert.match(calls[0].url, /\/auth\/v1\/user$/);
  assert.match(calls[1].url, /\/rest\/v1\/profiles\?user_id=eq\.user-1/);
  assert.equal(calls[2].options.method, "DELETE");
  assert.match(calls[2].url, /\/auth\/v1\/admin\/users\/user-1$/);
});

test("attempts to restore profile data if Auth deletion fails", async () => {
  const profile = { user_id: "user-1", display_name: "Test User" };
  const calls = [];
  const queued = [response(200, { id: "user-1" }), response(200, [profile]), response(204), response(502), response(204)];
  global.fetch = async (url, options = {}) => { calls.push({ url: String(url), options }); return queued.shift(); };

  const result = await invoke(deletionRequest());
  assert.equal(result.statusCode, 502);
  assert.equal(result.body.error.includes("could not be deleted"), true);
  assert.equal(calls[2].options.method, "DELETE");
  assert.equal(calls[3].options.method, "DELETE");
  assert.equal(calls[4].options.method, "POST");
  assert.deepEqual(JSON.parse(calls[4].options.body), profile);
});

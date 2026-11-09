"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { computeJobFingerprint, validateStructuredJob } = require("./job-schema");

const validJob = {
  country_code: "IT",
  title: "Care worker",
  employer: "Example Care",
  location: "Milan",
  apply_url: "https://example.test/jobs/1",
  salary_min: 1800,
  salary_max: 2200,
  salary_currency: "EUR",
  salary_period: "monthly",
  application_deadline: "2026-12-31",
  isco08_code: "5321",
  language_requirements: [{ language: "Italian", level: "B1" }],
  qualification_requirements: ["Care certificate"],
  expires_at: "2027-01-01T00:00:00.000Z",
  last_seen_at: "2026-11-09T00:00:00.000Z",
};

test("accepts a structured job with explicit salary, deadline, and requirements", () => {
  assert.equal(validateStructuredJob(validJob), null);
});

test("rejects invalid salary ranges and currency", () => {
  assert.match(validateStructuredJob({ ...validJob, salary_min: 2400 }), /Maximum salary/);
  assert.match(validateStructuredJob({ ...validJob, salary_currency: "EURO" }), /currency code/);
});

test("rejects malformed dates, ISCO codes, and requirement arrays", () => {
  assert.match(validateStructuredJob({ ...validJob, application_deadline: "2026-02-30" }), /valid date/);
  assert.match(validateStructuredJob({ ...validJob, isco08_code: "532" }), /four digits/);
  assert.match(validateStructuredJob({ ...validJob, language_requirements: ["Italian"] }), /JSON array/);
  assert.match(validateStructuredJob({ ...validJob, qualification_requirements: [null] }), /non-empty strings/);
});

test("computes a stable country-scoped duplicate fingerprint", () => {
  const first = computeJobFingerprint(validJob);
  const normalized = computeJobFingerprint({ ...validJob, title: "  CARE   WORKER ", employer: " example care " });
  assert.equal(first, normalized);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, computeJobFingerprint({ ...validJob, country_code: "DE" }));
});

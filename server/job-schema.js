"use strict";

const { createHash } = require("crypto");

const STRUCTURED_JOB_FIELDS = [
  "salary_min", "salary_max", "salary_currency", "salary_period",
  "application_deadline", "isco08_code", "language_requirements",
  "qualification_requirements", "expires_at", "last_seen_at", "duplicate_fingerprint",
];

function validDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validTimestamp(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function validateStructuredJob(job) {
  if (!job || typeof job !== "object" || Array.isArray(job)) return "Invalid structured job record";
  for (const field of ["salary_min", "salary_max"]) {
    const value = job[field];
    if (value !== null && value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      return "Salary amounts must be non-negative numbers";
    }
  }
  const hasSalary = (job.salary_min !== null && job.salary_min !== undefined) ||
    (job.salary_max !== null && job.salary_max !== undefined);
  if (hasSalary && (typeof job.salary_currency !== "string" || !/^[A-Z]{3}$/.test(job.salary_currency))) {
    return "Salary amounts require a three-letter uppercase currency code";
  }
  if (hasSalary && !["hourly", "weekly", "monthly", "annual"].includes(job.salary_period)) {
    return "Choose a valid salary period";
  }
  if (!hasSalary && (job.salary_currency || job.salary_period)) return "Salary currency and period require a salary amount";
  if (job.salary_min !== null && job.salary_min !== undefined &&
      job.salary_max !== null && job.salary_max !== undefined &&
      job.salary_max < job.salary_min) return "Maximum salary cannot be lower than minimum salary";
  if (job.application_deadline !== null && job.application_deadline !== undefined && job.application_deadline !== "" &&
      !validDateOnly(job.application_deadline)) return "Application deadline must be a valid date";
  if (job.expires_at !== null && job.expires_at !== undefined && job.expires_at !== "" &&
      !validTimestamp(job.expires_at)) return "Expiry time must include a timezone";
  if (job.last_seen_at !== null && job.last_seen_at !== undefined && job.last_seen_at !== "" &&
      !validTimestamp(job.last_seen_at)) return "Last-seen time must include a timezone";
  if (job.isco08_code !== null && job.isco08_code !== undefined && job.isco08_code !== "" &&
      (typeof job.isco08_code !== "string" || !/^\d{4}$/.test(job.isco08_code))) {
    return "ISCO-08 unit-group code must contain four digits";
  }
  const languages = job.language_requirements ?? [];
  if (!Array.isArray(languages) || languages.some((entry) =>
    !entry || typeof entry !== "object" || Array.isArray(entry) ||
    typeof entry.language !== "string" || !entry.language.trim() ||
    (entry.level !== undefined && entry.level !== null && typeof entry.level !== "string"))) {
    return "Language requirements must be a JSON array of language and optional level objects";
  }
  const qualifications = job.qualification_requirements ?? [];
  if (!Array.isArray(qualifications) || qualifications.some((entry) => typeof entry !== "string" || !entry.trim())) {
    return "Qualification requirements must be a JSON array of non-empty strings";
  }
  return null;
}

function computeJobFingerprint(job) {
  if (!job || typeof job !== "object") return null;
  const normalize = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const parts = [
    normalize(job.country_code),
    normalize(job.title),
    normalize(job.employer),
    normalize(job.location),
    normalize(job.apply_url || job.source_url),
  ];
  if (!parts[0] || !parts[1]) return null;
  return createHash("sha256").update(parts.join("\n"), "utf8").digest("hex");
}

module.exports = { STRUCTURED_JOB_FIELDS, computeJobFingerprint, validateStructuredJob };

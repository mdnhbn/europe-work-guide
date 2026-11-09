const { supabaseServiceAuthHeaders } = require("../server/supabase-service");
const { randomUUID, createCipheriv, createDecipheriv, randomBytes } = require("crypto");
const { gzipSync, gunzipSync } = require("zlib");
const { hasAal2TotpSession } = require("../server/admin-auth");
const { STRUCTURED_JOB_FIELDS, computeJobFingerprint, validateStructuredJob } = require("../server/job-schema");

const TABLES = {
  countries: {
    fields: ["code", "name", "languages", "enabled"],
    order: "name.asc",
    conflict: "code",
  },
  country_access: {
    fields: ["id", "country_code", "nationality", "residence_country", "access_status", "quota_included", "restrictions", "apply_where", "documents_note", "official_url", "review_status", "last_verified"],
    order: "country_code.asc",
    conflict: "country_code,nationality,residence_country",
  },
  visa_routes: {
    fields: ["id", "country_code", "nationality", "residence_country", "route_type", "title", "summary", "requirements", "documents", "fees", "steps", "official_url", "review_status", "last_verified"],
    order: "country_code.asc,title.asc",
  },
  jobs: {
    fields: ["id", "country_code", "title", "occupation", "employer", "location", "description", "apply_url", "source_url", "posted_at", "active", "review_status", ...STRUCTURED_JOB_FIELDS],
    order: "country_code.asc,posted_at.desc",
  },
};

const AD_FIELDS = ["id", "title", "body", "href", "image_url", "start_date", "end_date", "active"];
const REVIEW_STATUSES = new Set(["pending", "verified"]);
const ACCESS_STATUSES = new Set(["open", "limited", "closed", "unknown"]);

function env(name) {
  return (process.env[name] || "").trim();
}

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function supabaseBase() {
  const url = env("SUPABASE_URL");
  return url ? url.replace(/\/+$/, "") : "";
}

async function authorizeAdmin(req) {
  const supabaseUrl = supabaseBase();
  const anonKey = env("SUPABASE_ANON_KEY");
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const allowedEmails = env("ADMIN_EMAILS").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  if (!supabaseUrl || !anonKey || !token || !allowedEmails.length) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const user = await response.json();
  if (!user.email || !allowedEmails.includes(user.email.toLowerCase())) return null;
  return user;
}

function serviceHeaders(prefer) {
  const key = env("SUPABASE_SERVICE_KEY");
  return {
    ...supabaseServiceAuthHeaders(key),
    "Content-Type": "application/json",
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function readAds() {
  const repo = env("GITHUB_REPOSITORY");
  const token = env("GITHUB_TOKEN");
  const branch = env("GITHUB_BRANCH") || "main";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !token) throw new Error("Ads storage is not configured");
  const url = `https://api.github.com/repos/${repo}/contents/app/public/ads.json?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (response.status === 404) return { ads: [], sha: null, repo, branch, token };
  if (!response.ok) throw new Error("Could not read ad data from GitHub");
  const file = await response.json();
  const ads = JSON.parse(Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8"));
  if (!Array.isArray(ads)) throw new Error("Ad data file must contain a JSON array");
  return { ads, sha: file.sha, repo, branch, token };
}


const COUNTRY_ACCESS_CONFLICT_LEGACY = "country_code,nationality";
const COUNTRY_ACCESS_CONFLICT_SCOPED = "country_code,nationality,residence_country";
const RESIDENCE_BACKUP_FIELDS = {
  profiles: ["current_residence_country", "target_countries"],
  country_access: ["residence_country"],
  visa_routes: ["nationality", "residence_country"],
};

const BACKUP_TABLES = [
  { name: "profiles", conflict: "user_id" },
  { name: "countries", conflict: "code" },
  { name: "country_access", conflict: COUNTRY_ACCESS_CONFLICT_LEGACY },
  { name: "visa_routes", conflict: "id" },
  { name: "jobs", conflict: "id" },
  { name: "source_pages", conflict: "url" },
];

function backupKey() {
  const value = env("BACKUP_ENCRYPTION_KEY");
  if (!value) throw new Error("BACKUP_ENCRYPTION_KEY is not configured");
  let key;
  if (/^[a-f0-9]{64}$/i.test(value)) key = Buffer.from(value, "hex");
  else {
    try { key = Buffer.from(value, "base64"); } catch { key = Buffer.alloc(0); }
  }
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY must be a 32-byte base64 or 64-character hex key");
  return key;
}

function encryptBackup(payload) {
  const key = backupKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  if (ciphertext.length > 3 * 1024 * 1024) throw new Error("Encrypted backup exceeds the 3 MB API transfer limit; export a smaller dataset or use a direct storage backup");
  return {
    format: "europe-work-guide-encrypted-backup",
    version: 1,
    algorithm: "AES-256-GCM+gzip",
    created_at: new Date().toISOString(),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  };
}

function decryptBackup(bundle) {
  backupKey();
  if (!bundle || bundle.format !== "europe-work-guide-encrypted-backup" || bundle.version !== 1 ||
      typeof bundle.iv !== "string" || typeof bundle.tag !== "string" || typeof bundle.data !== "string") {
    throw new Error("Backup file format is not supported");
  }
  if (Buffer.byteLength(bundle.data, "base64") > 3 * 1024 * 1024) throw new Error("Backup file exceeds the 3 MB restore limit");
  const decipher = createDecipheriv("aes-256-gcm", backupKey(), Buffer.from(bundle.iv, "base64"));
  decipher.setAuthTag(Buffer.from(bundle.tag, "base64"));
  const compressed = Buffer.concat([decipher.update(Buffer.from(bundle.data, "base64")), decipher.final()]);
  const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
  if (payload?.export_version !== "1.0" || !payload.tables || typeof payload.tables !== "object") throw new Error("Backup payload structure is invalid");
  return payload;
}

async function fetchAllRows(table) {
  const base = supabaseBase();
  const rows = [];
  for (let start = 0; start < 100000; start += 1000) {
    const response = await fetch(`${base}/rest/v1/${table}?select=*`, {
      headers: { ...serviceHeaders(), Range: `${start}-${start + 999}` },
    });
    if (!response.ok) throw new Error(`Could not export table: ${table}`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Unexpected response while exporting table: ${table}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  throw new Error(`Table ${table} exceeds the 100,000-row backup safety limit`);
}

async function getCountryAccessConflict() {
  const response = await fetch(`${supabaseBase()}/rest/v1/country_access?select=residence_country&limit=0`, {
    headers: serviceHeaders(),
  });
  if (response.ok) return COUNTRY_ACCESS_CONFLICT_SCOPED;
  const error = await response.json().catch(() => null);
  if (["42703", "PGRST204"].includes(error?.code) && /residence_country/i.test(error?.message || "")) {
    return COUNTRY_ACCESS_CONFLICT_LEGACY;
  }
  throw new Error("Could not verify the residence matching schema. No data was changed.");
}

function hasResidenceBackupFields(tables) {
  return Object.entries(RESIDENCE_BACKUP_FIELDS).some(([table, fields]) =>
    tables[table].some((row) => row && fields.some((field) => Object.hasOwn(row, field)))
  );
}

async function insertAudit(user, action, entity, beforeValue = null, afterValue = null) {
  const base = supabaseBase();
  if (!base || !env("SUPABASE_SERVICE_KEY")) return false;
  try {
    const response = await fetch(`${base}/rest/v1/admin_audit_log`, {
      method: "POST",
      headers: serviceHeaders("return=minimal"),
      body: JSON.stringify({
        admin_user_id: user.id,
        admin_email: user.email || null,
        action,
        entity,
        before_json: beforeValue,
        after_json: afterValue,
        created_at: new Date().toISOString(),
      }),
    });
    if (response.ok) return true;
    console.error(`Admin audit write failed (${response.status}) for ${action}`);
  } catch {
    console.error(`Admin audit request failed for ${action}`);
  }
  return false;
}

class AuditUnavailableError extends Error {}

async function requireAudit(user, action, entity, details = null) {
  if (!await insertAudit(user, action, entity, null, details)) {
    throw new AuditUnavailableError("Admin audit log is unavailable. The operation was not attempted. Check the audit migration and service key.");
  }
}


async function githubApi(path, options = {}) {
  const token = env("GITHUB_TOKEN");
  const repo = env("GITHUB_REPOSITORY") || "mdnhbn/europe-work-guide";
  if (!token || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("GitHub source storage is not configured");
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  return response;
}

async function readSourceConfigs() {
  const branch = encodeURIComponent(env("GITHUB_BRANCH") || "main");
  const directory = await githubApi(`contents/scrapers/countries?ref=${branch}`);
  if (!directory.ok) throw new Error("Could not list scraper source configurations");
  const entries = await directory.json();
  if (!Array.isArray(entries)) throw new Error("Source configuration directory is invalid");
  const files = entries.filter((item) => item.type === "file" && item.name.endsWith(".json"));
  const configs = [];
  for (const item of files) {
    const response = await githubApi(`contents/scrapers/countries/${encodeURIComponent(item.name)}?ref=${branch}`);
    if (!response.ok) throw new Error("Could not read a source configuration");
    const file = await response.json();
    let config;
    try { config = JSON.parse(Buffer.from(String(file.content || "").replace(/\s/g, ""), "base64").toString("utf8")); }
    catch { throw new Error(`Invalid JSON source configuration: ${item.name}`); }
    configs.push({ filename: item.name, sha: file.sha, config });
  }
  return configs;
}

function validateSourceConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Source config must be a JSON object");
  const code = String(input.code || "").trim().toUpperCase();
  const name = String(input.name || "").trim();
  const language = String(input.language || "").trim().toLowerCase();
  if (!/^[A-Z]{2,3}$/.test(code) || !name || name.length > 100 || !/^[a-z]{2,3}$/.test(language)) throw new Error("Country code, name and language are required");
  if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 100) throw new Error("Provide 1 to 100 official source URLs");
  const sources = input.sources.map((source) => {
    const url = String(source?.url || "").trim();
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error("Each source must have a valid HTTPS URL"); }
    if (parsed.protocol !== "https:" || !parsed.hostname.includes(".")) throw new Error("Each source must use HTTPS");
    const type = String(source.type || "").trim();
    const days = Number(source.check_every_days);
    if (!/^[a-zA-Z0-9_-]{2,60}$/.test(type) || !Number.isInteger(days) || days < 1 || days > 365) throw new Error("Source type and check interval are invalid");
    return { url, type, check_every_days: days };
  });
  return { code, name, language, sources };
}

function validUrl(value, allowEmpty = true) {
  if (!value) return allowEmpty;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeAds(input) {
  if (!Array.isArray(input) || input.length > 100) throw new Error("Provide an ad list with at most 100 entries");
  return input.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Invalid ad entry");
    const title = String(item.title || "").trim();
    const body = String(item.body || "").trim();
    const href = String(item.href || "").trim();
    const imageUrl = String(item.image_url || "").trim();
    if (!title || title.length > 120 || body.length > 1200) throw new Error("Each ad needs a short title and a body under 1200 characters");
    if (!validUrl(href) || !validUrl(imageUrl)) throw new Error("Ad links must use http or https");
    return {
      id: String(item.id || randomUUID()).slice(0, 80),
      title,
      body,
      href,
      image_url: imageUrl,
      start_date: item.start_date || null,
      end_date: item.end_date || null,
      active: item.active === true,
    };
  });
}

async function saveAds(input) {
  const ads = normalizeAds(input);
  const current = await readAds();
  const url = `https://api.github.com/repos/${current.repo}/contents/app/public/ads.json`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${current.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "Update advertisements from admin panel",
      content: Buffer.from(`${JSON.stringify(ads, null, 2)}\n`, "utf8").toString("base64"),
      branch: current.branch,
      ...(current.sha ? { sha: current.sha } : {}),
    }),
  });
  if (!response.ok) throw new Error("Could not save ads to GitHub; check the token and repository permissions");
  const saved = await response.json();
  return { ads, commit: saved.commit?.sha || null };
}

module.exports = async function adminApi(req, res) {
  if (!["GET", "POST", "DELETE"].includes(req.method)) return sendError(res, 405, "Method not allowed");
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return sendError(res, 401, "Sign in before accessing admin resources");
    const user = await authorizeAdmin(req);
    if (!user) return sendError(res, 403, "This account is not authorized to access admin resources");

    const url = new URL(req.url, "http://localhost");
    const resource = url.searchParams.get("resource");
    if (resource === "check" && req.method === "GET") return res.status(200).json({ admin: true, email: user.email, totp_verified: hasAal2TotpSession(token, user.id) });
    if (!hasAal2TotpSession(token, user.id)) return sendError(res, 403, "Complete TOTP two-factor verification before accessing admin resources");

    if (resource === "dashboard" && req.method === "GET") {
      const base = supabaseBase();
      const serviceKey = env("SUPABASE_SERVICE_KEY");
      if (!base || !serviceKey) return sendError(res, 500, "Admin database is not configured");
      const tables = [
        ["profiles", "user_id", "profiles"],
        ["countries", "code", "countries"],
        ["country_access", "id", "country_access"],
        ["visa_routes", "id", "visa_routes"],
        ["jobs", "id", "jobs"],
        ["source_pages", "id", "source_pages"],
      ];
      const counts = {};
      await Promise.all(tables.map(async ([table, key, label]) => {
        try {
          const response = await fetch(`${base}/rest/v1/${table}?select=${key}`, {
            headers: { ...serviceHeaders("count=exact"), Range: "0-0" },
          });
          if (!response.ok) { counts[label] = null; return; }
          const range = response.headers.get("content-range") || "";
          const total = Number(range.split("/").pop());
          counts[label] = Number.isFinite(total) ? total : null;
        } catch {
          counts[label] = null;
        }
      }));
      return res.status(200).json({ generated_at: new Date().toISOString(), counts });
    }


    if (resource === "ad-settings" && req.method === "GET") {
      const response = await githubApi("contents/app/public/ads-config.json?ref=" + encodeURIComponent(env("GITHUB_BRANCH") || "main"));
      if (!response.ok) return sendError(res, 502, "Could not read advertisement settings");
      const file = await response.json();
      const settings = JSON.parse(Buffer.from(String(file.content || "").replace(/\s/g, ""), "base64").toString("utf8"));
      return res.status(200).json(settings);
    }

    if (resource === "ad-settings" && req.method === "POST") {
      const input = req.body?.settings;
      if (!input || typeof input !== "object" || Array.isArray(input) ||
          typeof input.ads_enabled !== "boolean" || typeof input.disable_on_legal_warnings !== "boolean" ||
          !Number.isInteger(Number(input.banner_interval_minutes)) || Number(input.banner_interval_minutes) < 1 || Number(input.banner_interval_minutes) > 1440) {
        return sendError(res, 400, "Invalid ad settings; interval must be between 1 and 1440 minutes");
      }
      if (input.popunder_enabled === true) return sendError(res, 400, "Pop-under is not implemented in this release and must remain disabled");
      const currentResponse = await githubApi("contents/app/public/ads-config.json?ref=" + encodeURIComponent(env("GITHUB_BRANCH") || "main"));
      if (!currentResponse.ok) return sendError(res, 502, "Could not read existing ad settings");
      const current = await currentResponse.json();
      const settings = {
        ads_enabled: input.ads_enabled,
        banner_interval_minutes: Number(input.banner_interval_minutes),
        disable_on_legal_warnings: input.disable_on_legal_warnings,
        popunder_enabled: false,
        popunder_interval_minutes: 30,
        popunder_max_per_session: 0,
      };
      await requireAudit(user, "ad_settings_update_requested", "ad-settings");
      const response = await githubApi("contents/app/public/ads-config.json", {
        method: "PUT",
        body: JSON.stringify({
          message: "Update ad display settings from admin panel",
          content: Buffer.from(JSON.stringify(settings, null, 2) + "\n", "utf8").toString("base64"),
          branch: env("GITHUB_BRANCH") || "main",
          sha: current.sha,
        }),
      });
      if (!response.ok) return sendError(res, 502, "Could not save ad settings; check GitHub Contents write permission");
      const result = await response.json();
      await insertAudit(user, "ad_settings_update", "ad-settings", null, settings);
      return res.status(200).json({ settings, commit: result.commit?.sha || null });
    }

    if (resource === "ads" && req.method === "DELETE") {
      const id = String(req.body?.id || "").trim();
      if (!id) return sendError(res, 400, "Advertisement id is required");
      const current = await readAds();
      const next = current.ads.filter((item) => String(item.id) !== id);
      if (next.length === current.ads.length) return sendError(res, 404, "Advertisement not found");
      await requireAudit(user, "ads_delete_requested", "ads", { id });
      const result = await saveAds(next);
      await insertAudit(user, "ads_delete", "ads", null, { id, commit: result.commit });
      return res.status(200).json({ deleted: true, id, commit: result.commit });
    }


    if (resource === "sources" && req.method === "GET") {
      const configs = await readSourceConfigs();
      return res.status(200).json(configs.map(({ filename, config }) => ({ filename, ...config })));
    }

    if (resource === "sources" && req.method === "POST") {
      const config = validateSourceConfig(req.body?.config);
      const configs = await readSourceConfigs();
      const existing = configs.find((item) => item.config.code === config.code);
      const filename = existing?.filename || `${config.code.toLowerCase()}.json`;
      const repo = env("GITHUB_REPOSITORY") || "mdnhbn/europe-work-guide";
      const branch = env("GITHUB_BRANCH") || "main";
      const path = `contents/scrapers/countries/${encodeURIComponent(filename)}`;
      const body = {
        message: `Update official scraper sources for ${config.code}`,
        content: Buffer.from(`${JSON.stringify(config, null, 2)}\n`, "utf8").toString("base64"),
        branch,
        ...(existing ? { sha: existing.sha } : {}),
      };
      await requireAudit(user, "source_config_update_requested", config.code);
      const response = await githubApi(path, { method: "PUT", body: JSON.stringify(body) });
      if (!response.ok) return sendError(res, 502, "Could not save source config; check GitHub Contents permission");
      const result = await response.json();
      await insertAudit(user, "source_config_update", config.code, existing?.config || null, config);
      return res.status(200).json({ saved: true, filename, commit: result.commit?.sha || null, config });
    }

    if (resource === "source_pages" && req.method === "GET") {
      if (!env("SUPABASE_SERVICE_KEY")) return sendError(res, 503, "Admin database is not configured");
      const response = await fetch(`${supabaseBase()}/rest/v1/source_pages?select=id,country_code,url,content_hash,changed,fetched_at&order=fetched_at.desc&limit=100`, { headers: serviceHeaders() });
      if (!response.ok) return sendError(res, 502, "Could not load source fetch history");
      return res.status(200).json(await response.json());
    }

    if (resource === "scraper-run" && req.method === "POST") {
      const branch = env("GITHUB_BRANCH") || "main";
      await requireAudit(user, "scraper_manual_run_requested", "scrape.yml", { branch });
      const response = await githubApi("actions/workflows/scrape.yml/dispatches", { method: "POST", body: JSON.stringify({ ref: branch }) });
      if (response.status === 204) {
        await insertAudit(user, "scraper_manual_run", "scrape.yml", null, { branch });
        return res.status(200).json({ queued: true, branch, message: "Scraper workflow was queued. Newly collected immigration data remains pending review." });
      }
      return sendError(res, response.status === 404 || response.status === 403 ? 403 : 502, "Could not start scraper. The GitHub token needs Actions: write permission for this repository.");
    }

    if (resource === "backup") {
      if (!env("SUPABASE_SERVICE_KEY")) return sendError(res, 503, "Admin database is not configured");
      if (req.method !== "POST") return sendError(res, 405, "Backup actions must use POST");
      const action = String(req.body?.action || "");
      if (action === "export") {
        const tables = {};
        for (const item of BACKUP_TABLES) tables[item.name] = await fetchAllRows(item.name);
        const ads = await readAds();
        const payload = {
          export_version: "1.0",
          exported_at: new Date().toISOString(),
          counts: Object.fromEntries([...Object.entries(tables).map(([name, rows]) => [name, rows.length]), ["ads", ads.ads.length]]),
          tables,
          ads: ads.ads,
          note: "This backup contains personal profile data and is encrypted. Store it securely.",
        };
        const backup = encryptBackup(payload);
        await requireAudit(user, "backup_export", "full_backup", { counts: payload.counts, encrypted: true });
        return res.status(200).json(backup);
      }
      if (action === "preview" || action === "restore") {
        let payload;
        try { payload = decryptBackup(req.body?.backup); }
        catch (error) { return sendError(res, 400, error.message || "Backup could not be decrypted"); }
        const counts = {};
        for (const item of BACKUP_TABLES) {
          if (!Array.isArray(payload.tables[item.name])) return sendError(res, 400, `Backup is missing the ${item.name} table`);
          counts[item.name] = payload.tables[item.name].length;
        }
        counts.ads = Array.isArray(payload.ads) ? payload.ads.length : 0;
        if (action === "preview") {
          const current = {};
          for (const item of BACKUP_TABLES) {
            try { current[item.name] = (await fetchAllRows(item.name)).length; }
            catch { current[item.name] = null; }
          }
          return res.status(200).json({ valid: true, export_version: payload.export_version, exported_at: payload.exported_at, counts, current_counts: current, modes: ["merge", "empty_database_restore"] });
        }
        const mode = String(req.body?.mode || "");
        if (req.body?.confirm !== true || !["merge", "empty_database_restore"].includes(mode)) return sendError(res, 400, "Explicit confirmation and a valid restore mode are required");
        let countryAccessConflict = COUNTRY_ACCESS_CONFLICT_LEGACY;
        const hasResidenceFields = hasResidenceBackupFields(payload.tables);
        if (counts.country_access || hasResidenceFields) {
          countryAccessConflict = await getCountryAccessConflict();
          if (hasResidenceFields && countryAccessConflict === COUNTRY_ACCESS_CONFLICT_LEGACY) {
            return sendError(res, 409, "Apply the residence-aware matching migration before restoring this backup. No data was changed.");
          }
        }
        const current = {};
        for (const item of BACKUP_TABLES) current[item.name] = await fetchAllRows(item.name);
        if (mode === "empty_database_restore" && Object.values(current).some((rows) => rows.length > 0)) {
          return sendError(res, 409, "Full restore is allowed only when all supported database tables are empty. No data was changed.");
        }
        await requireAudit(user, "backup_restore_requested", "full_backup", { mode, counts });
        let restored = 0;
        for (const item of BACKUP_TABLES) {
          let rows = payload.tables[item.name];
          if (!rows.length) continue;
          const conflict = item.name === "country_access" ? countryAccessConflict : item.conflict;
          if (item.name === "country_access" && countryAccessConflict === COUNTRY_ACCESS_CONFLICT_SCOPED) {
            rows = rows.map((row) => ({ ...row, residence_country: row.residence_country ?? "ANY" }));
          }
          for (let offset = 0; offset < rows.length; offset += 100) {
            const batch = rows.slice(offset, offset + 100);
            const response = await fetch(`${supabaseBase()}/rest/v1/${item.name}?on_conflict=${encodeURIComponent(conflict)}`, {
              method: "POST",
              headers: serviceHeaders("return=minimal,resolution=merge-duplicates"),
              body: JSON.stringify(batch),
            });
            if (!response.ok) return sendError(res, 502, `Restore stopped while importing ${item.name}; earlier batches may already have been imported`);
            restored += batch.length;
          }
        }
        if (Array.isArray(payload.ads)) await saveAds(payload.ads);
        await insertAudit(user, "backup_restore", "full_backup", null, { mode, counts, restored_rows: restored });
        return res.status(200).json({ restored: true, mode, counts, restored_rows: restored, message: "Restore completed. Review the imported data before public approval." });
      }
      return sendError(res, 400, "Unknown backup action");
    }

    if (resource === "admin_audit_log" && req.method === "GET") {
      const response = await fetch(`${supabaseBase()}/rest/v1/admin_audit_log?select=id,admin_user_id,admin_email,action,entity,before_json,after_json,created_at&order=created_at.desc&limit=200`, { headers: serviceHeaders() });
      if (!response.ok) return sendError(res, 503, "Audit log is unavailable; apply the admin backup/audit migration");
      return res.status(200).json(await response.json());
    }

    if (resource === "ads") {
      if (req.method === "GET") {
        const result = await readAds();
        return res.status(200).json(result.ads);
      }
      if (req.method !== "POST") return sendError(res, 405, "Method not allowed for ads");
      if (!req.body || !Array.isArray(req.body.ads)) return sendError(res, 400, "Invalid advertisement data");
      const ads = normalizeAds(req.body.ads);
      await requireAudit(user, "ads_update_requested", "ads", { count: ads.length });
      const result = await saveAds(ads);
      await insertAudit(user, "ads_update", "ads", null, { count: result.ads.length, commit: result.commit });
      return res.status(200).json(result);
    }

    if (req.method === "DELETE") {
      const deletable = new Set(["country_access", "visa_routes", "jobs"]);
      if (!deletable.has(resource)) return sendError(res, 403, "This resource cannot be deleted through the admin API");
      const input = req.body && typeof req.body === "object" ? req.body : {};
      const id = String(input.id || "").trim();
      if (!id || id.length > 160) return sendError(res, 400, "A valid record id is required");
      const deleteUrl = `${supabaseBase()}/rest/v1/${resource}?id=eq.${encodeURIComponent(id)}`;
      await requireAudit(user, "delete_requested", resource, { id });
      const deleted = await fetch(deleteUrl, { method: "DELETE", headers: serviceHeaders("return=representation") });
      if (!deleted.ok) return sendError(res, 502, "Could not delete the record");
      const rows = await deleted.json().catch(() => []);
      if (!Array.isArray(rows) || rows.length === 0) return sendError(res, 404, "Record not found");
      await insertAudit(user, "delete", resource, rows[0], null);
      return res.status(200).json({ deleted: true, id });
    }

    const config = TABLES[resource];
    if (!config) return sendError(res, 404, "Unknown admin resource");
    const base = supabaseBase();
    if (!base || !env("SUPABASE_SERVICE_KEY")) return sendError(res, 500, "Admin database is not configured");
    const tableUrl = `${base}/rest/v1/${resource}`;

    if (req.method === "GET") {
      const response = await fetch(`${tableUrl}?select=*&order=${encodeURIComponent(config.order)}`, { headers: serviceHeaders() });
      if (!response.ok) return sendError(res, 502, "Could not load admin data");
      return res.status(200).json(await response.json());
    }

    let input = req.body && typeof req.body === "object" ? req.body.record : null;
    if (!input || typeof input !== "object" || Array.isArray(input)) return sendError(res, 400, "Invalid record");
    if (resource === "jobs") {
      const schemaCheck = await fetch(tableUrl + "?select=application_deadline&limit=0", { headers: serviceHeaders() });
      if (!schemaCheck.ok) {
        const hasStructuredValues = STRUCTURED_JOB_FIELDS.some((field) =>
          input[field] !== null && input[field] !== undefined && input[field] !== ""
        );
        if (hasStructuredValues) return sendError(res, 409, "Apply the structured jobs migration before saving structured job fields");
        input = Object.fromEntries(Object.entries(input).filter(([field]) => !STRUCTURED_JOB_FIELDS.includes(field)));
      } else {
        input = { ...input };
        if (typeof input.salary_currency === "string") input.salary_currency = input.salary_currency.trim().toUpperCase() || null;
        const validationError = validateStructuredJob(input);
        if (validationError) return sendError(res, 400, validationError);
        input.duplicate_fingerprint = computeJobFingerprint(input);
        if (input.duplicate_fingerprint) {
          const duplicateUrl = tableUrl + "?select=id&duplicate_fingerprint=eq." + encodeURIComponent(input.duplicate_fingerprint) + "&limit=1";
          const duplicateResponse = await fetch(duplicateUrl, { headers: serviceHeaders() });
          if (!duplicateResponse.ok) return sendError(res, 502, "Could not check for a duplicate job record");
          const duplicates = await duplicateResponse.json();
          if (Array.isArray(duplicates) && duplicates.some((row) => String(row.id) !== String(input.id || ""))) {
            return sendError(res, 409, "A matching job record already exists");
          }
        }
      }
    }
    if (Object.keys(input).some((key) => !config.fields.includes(key))) return sendError(res, 400, "Record contains unsupported fields");
    if (input.review_status && !REVIEW_STATUSES.has(input.review_status)) return sendError(res, 400, "Invalid review status");
    if (resource === "country_access" && input.access_status && !ACCESS_STATUSES.has(input.access_status)) return sendError(res, 400, "Invalid access status");

    let requestUrl = tableUrl;
    let method = "POST";
    let prefer = "return=representation,resolution=merge-duplicates";
    if (resource === "country_access" && input.id) {
      requestUrl += `?id=eq.${encodeURIComponent(input.id)}`;
      method = "PATCH";
      prefer = "return=representation";
    } else if (config.conflict) {
      requestUrl += `?on_conflict=${encodeURIComponent(config.conflict)}`;
    } else if (input.id) {
      requestUrl += `?id=eq.${encodeURIComponent(input.id)}`;
      method = "PATCH";
      prefer = "return=representation";
    }
    const action = method === "PATCH" ? "update" : "create_or_upsert";
    await requireAudit(user, `${action}_requested`, resource, { id: input.id || input.code || null });
    const response = await fetch(requestUrl, {
      method,
      headers: serviceHeaders(prefer),
      body: JSON.stringify(input),
    });
    if (!response.ok) return sendError(res, 502, "Could not save admin data");
    const rows = await response.json();
    const saved = Array.isArray(rows) ? rows[0] || null : rows;
    await insertAudit(user, action, resource, null, saved);
    return res.status(200).json(saved);
  } catch (error) {
    if (error instanceof AuditUnavailableError) return sendError(res, 503, error.message);
    const message = error instanceof Error ? error.message : "Unexpected admin error";
    const status = /Provide an ad|Invalid ad|Each ad|Ad links|Source config must|Country code, name|Provide 1 to 100|Each source must|Source type and check interval/i.test(message) ? 400 : 500;
    return sendError(res, status, message);
  }
};


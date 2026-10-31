const { randomUUID } = require("crypto");

const TABLES = {
  countries: {
    fields: ["code", "name", "languages", "enabled"],
    order: "name.asc",
    conflict: "code",
  },
  country_access: {
    fields: ["id", "country_code", "nationality", "access_status", "quota_included", "restrictions", "apply_where", "documents_note", "official_url", "review_status", "last_verified"],
    order: "country_code.asc",
    conflict: "country_code,nationality",
  },
  visa_routes: {
    fields: ["id", "country_code", "route_type", "title", "summary", "requirements", "documents", "fees", "steps", "official_url", "review_status", "last_verified"],
    order: "country_code.asc,title.asc",
  },
  jobs: {
    fields: ["id", "country_code", "title", "occupation", "employer", "location", "description", "apply_url", "source_url", "posted_at", "active", "review_status"],
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
    apikey: key,
    Authorization: `Bearer ${key}`,
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
  if (req.method !== "GET" && req.method !== "POST") return sendError(res, 405, "Method not allowed");
  try {
    const user = await authorizeAdmin(req);
    if (!user) return sendError(res, 403, "Admin access is not configured for this account");

    const url = new URL(req.url, "http://localhost");
    const resource = url.searchParams.get("resource");
    if (resource === "check" && req.method === "GET") return res.status(200).json({ admin: true, email: user.email });

    if (resource === "ads") {
      if (req.method === "GET") {
        const result = await readAds();
        return res.status(200).json(result.ads);
      }
      if (!req.body || !Array.isArray(req.body.ads)) return sendError(res, 400, "Invalid advertisement data");
      const result = await saveAds(req.body.ads);
      return res.status(200).json(result);
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

    const input = req.body && typeof req.body === "object" ? req.body.record : null;
    if (!input || typeof input !== "object" || Array.isArray(input)) return sendError(res, 400, "Invalid record");
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
    const response = await fetch(requestUrl, {
      method,
      headers: serviceHeaders(prefer),
      body: JSON.stringify(input),
    });
    if (!response.ok) return sendError(res, 502, "Could not save admin data");
    const rows = await response.json();
    return res.status(200).json(Array.isArray(rows) ? rows[0] || null : rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected admin error";
    const status = message.includes("Provide an ad") || message.includes("Invalid ad") || message.includes("Each ad") || message.includes("Ad links") ? 400 : 500;
    return sendError(res, status, message);
  }
};


const { supabaseServiceAuthHeaders } = require("../server/supabase-service");

const SUPABASE_URL = () => (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
function fail(res, status, error) { return res.status(status).json({ error }); }

module.exports = async function accountDelete(req, res) {
  if (req.method !== "POST") return fail(res, 405, "Method not allowed");
  const base = SUPABASE_URL();
  const anonKey = (process.env.SUPABASE_ANON_KEY || "").trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_KEY || "").trim();
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!base || !anonKey || !serviceKey) return fail(res, 503, "Account deletion is not configured. Please contact the site administrator.");
  if (!token) return fail(res, 401, "Sign in before deleting your account");
  if (req.body?.confirm !== true) return fail(res, 400, "Explicit account deletion confirmation is required");
  try {
    const identity = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    if (!identity.ok) return fail(res, 401, "Your session could not be verified");
    const user = await identity.json();
    if (!user?.id) return fail(res, 401, "Your session could not be verified");
    // The profiles.user_id foreign key cascades on Auth user deletion.
    const deletion = await fetch(`${base}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: "DELETE",
      headers: supabaseServiceAuthHeaders(serviceKey),
    });
    if (!deletion.ok) return fail(res, 502, "The account could not be deleted.");
    return res.status(200).json({ deleted: true, message: "Account deletion request completed." });
  } catch {
    return fail(res, 502, "The account service could not be reached. Please try again later.");
  }
};

function supabaseServiceAuthHeaders(key) {
  return {
    apikey: key,
    ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
  };
}

module.exports = { supabaseServiceAuthHeaders };

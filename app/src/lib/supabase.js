import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function getOAuthProviderEnabled(provider) {
  if (!isSupabaseConfigured) return null;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseAnonKey },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const settings = await response.json();
    return typeof settings.external?.[provider] === 'boolean' ? settings.external[provider] : null;
  } catch {
    return null;
  }
}

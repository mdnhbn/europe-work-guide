import { supabase } from './supabase.js';

export async function adminRequest(resource, method = 'GET', payload) {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('অ্যাডমিন অ্যাক্সেস যাচাই করা যায়নি। আবার লগ ইন করুন।');
  const response = await fetch(`/api/admin?resource=${encodeURIComponent(resource)}`, {
    method,
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(['POST', 'DELETE'].includes(method) ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(['POST', 'DELETE'].includes(method) ? { body: JSON.stringify(payload || {}) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'অ্যাডমিন অনুরোধ সম্পন্ন হয়নি।');
  return result;
}

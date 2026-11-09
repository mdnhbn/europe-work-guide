import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from './lib/adminApi.js';

const LABELS = {
  profiles: 'প্রোফাইল',
  countries: 'সক্রিয়/মোট দেশের রেকর্ড',
  country_access: 'জাতীয়তা-ভিত্তিক প্রবেশ রেকর্ড',
  visa_routes: 'ভিসা রুট',
  jobs: 'চাকরির রেকর্ড',
  source_pages: 'সংগৃহীত সরকারি পৃষ্ঠা',
};
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await adminRequest('dashboard')); }
    catch (e) { setError(e.message || 'ড্যাশবোর্ড লোড করা যায়নি।'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return <section className="admin-dashboard"><div className="section-heading"><div><h3>সিস্টেমের সারসংক্ষেপ</h3><p className="muted">Supabase থেকে রেকর্ডের সংখ্যা; এটি ব্যক্তিগত তথ্য দেখায় না।</p></div><button type="button" className="button button-light small" onClick={load} disabled={loading}>রিফ্রেশ</button></div>
    {error && <p className="message error" role="alert">{error}</p>}
    {loading && !data ? <p className="loading-line">ড্যাশবোর্ড লোড হচ্ছে…</p> : data && <><div className="admin-metric-grid">{Object.entries(LABELS).map(([key,label])=><article className="admin-metric" key={key}><span>{label}</span><strong>{data.counts?.[key] === null || data.counts?.[key] === undefined ? '—' : Number(data.counts[key]).toLocaleString('bn-BD')}</strong>{data.counts?.[key] === null && <small>টেবিল/অনুমতি যাচাই করুন</small>}</article>)}</div><p className="muted admin-updated">সর্বশেষ অনুরোধ: {data.generated_at ? new Date(data.generated_at).toLocaleString('bn-BD') : '—'}</p></>}
  </section>;
}

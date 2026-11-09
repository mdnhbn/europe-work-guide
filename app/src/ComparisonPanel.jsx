import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';

const STATUS = { open: 'খোলা', limited: 'সীমিত', closed: 'বন্ধ', unknown: 'যাচাইকৃত তথ্য নেই' };
function show(value) {
  if (value === null || value === undefined || value === '') return 'তথ্য দেওয়া নেই';
  if (Array.isArray(value)) return value.length ? value.map(show).join(', ') : 'তথ্য দেওয়া নেই';
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${show(item)}`).join(' · ');
  return String(value);
}
function CountryColumn({ country, data, loading }) {
  if (!country) return <article className="compare-column"><p className="muted">একটি দেশ নির্বাচন করুন।</p></article>;
  if (loading) return <article className="compare-column"><h3>{country.name}</h3><p>যাচাইকৃত তথ্য লোড হচ্ছে…</p></article>;
  const access = data?.access;
  const routes = data?.routes || [];
  const jobs = data?.jobs || [];
  return <article className="compare-column">
    <div className="compare-country-heading"><span className="compare-country-code">{country.code}</span><div><h3>{country.name}</h3><small>জাতীয়তা অনুযায়ী তথ্য</small></div></div>
    <section className="compare-block"><h4>প্রবেশের অবস্থা</h4><span className={`status-badge ${access?.access_status || 'unknown'}`}>{STATUS[access?.access_status || 'unknown']}</span>
      {access ? <><p>{show(access.restrictions)}</p><p><strong>আবেদন:</strong> {show(access.apply_where)}</p><p><strong>সর্বশেষ যাচাই:</strong> {show(access.last_verified)}</p>{access.official_url && <a href={access.official_url} target="_blank" rel="noreferrer">সরকারি সূত্র ↗</a>}</> : <p className="muted">এই জাতীয়তার জন্য যাচাইকৃত প্রবেশের তথ্য নেই। অনুমান করে অবস্থা দেখানো হয়নি।</p>}
    </section>
    <section className="compare-block"><h4>ভিসার পথ <span className="count-pill">{routes.length}</span></h4>{routes.length ? routes.map(route => <div className="compare-item" key={route.id}><strong>{route.title}</strong><p>{show(route.summary)}</p><p><strong>ফি:</strong> {show(route.fees)}</p><p><strong>যাচাই:</strong> {show(route.last_verified)}</p>{route.official_url && <a href={route.official_url} target="_blank" rel="noreferrer">সরকারি সূত্র ↗</a>}</div>) : <p className="muted">যাচাইকৃত ভিসা পথ নেই।</p>}</section>
    <section className="compare-block"><h4>সক্রিয় যাচাইকৃত চাকরি <span className="count-pill">{jobs.length}</span></h4>{jobs.length ? jobs.slice(0,5).map(job => <div className="compare-item" key={job.id}><strong>{show(job.title)}</strong><p>{show(job.employer)} · {show(job.location)}</p>{job.apply_url && <a href={job.apply_url} target="_blank" rel="noreferrer">আবেদনের সাইট ↗</a>}</div>) : <p className="muted">যাচাইকৃত চাকরি নেই।</p>}</section>
  </article>;
}
export default function ComparisonPanel({ countries, profile }) {
  const [left, setLeft] = useState('IT');
  const [right, setRight] = useState('DE');
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(false);
  const nationality = profile?.nationality?.trim() || 'Bangladesh';
  useEffect(() => {
    let active = true;
    const selected = [...new Set([left, right].filter(Boolean))];
    setLoading(true);
    Promise.all(selected.map(async code => {
      const [accessResult, routeResult, jobResult] = await Promise.all([
        supabase.from('country_access').select('*').eq('country_code', code).eq('nationality', nationality).eq('review_status', 'verified').limit(1),
        supabase.from('visa_routes').select('*').eq('country_code', code).eq('review_status', 'verified').order('last_verified', { ascending: false }),
        supabase.from('jobs').select('*').eq('country_code', code).eq('review_status', 'verified').eq('active', true).order('posted_at', { ascending: false }),
      ]);
      if (accessResult.error || routeResult.error || jobResult.error) throw new Error('তুলনার তথ্য লোড করা যায়নি। পরে আবার চেষ্টা করুন।');
      return [code, { access: accessResult.data?.[0] || null, routes: routeResult.data || [], jobs: jobResult.data || [] }];
    })).then(rows => { if (active) setData(Object.fromEntries(rows)); })
      .catch(() => { if (active) setData({}); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [left, right, nationality]);
  const leftCountry = countries.find(c => c.code === left);
  const rightCountry = countries.find(c => c.code === right);
  return <section className="panel comparison-panel">
    <div className="panel-heading"><div><p className="eyebrow">একসঙ্গে তুলনা</p><h2>দেশ ও ভিসার পথ তুলনা করুন</h2></div><span className="privacy-pill">জাতীয়তা: {nationality}</span></div>
    <p className="muted">শুধু যাচাইকৃত তথ্য তুলনা করা হচ্ছে। বর্তমান বসবাসের দেশভিত্তিক আলাদা রেকর্ড এই ডেটাসেটে না থাকলে সেটি অনুমান করা হবে না। ভিসা অনুমোদন নিশ্চিত নয়।</p>
    <div className="compare-selectors"><label className="field"><span>প্রথম দেশ</span><select value={left} onChange={e => setLeft(e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label><label className="field"><span>দ্বিতীয় দেশ</span><select value={right} onChange={e => setRight(e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label></div>
    {loading && <p className="loading-line">তুলনার তথ্য হালনাগাদ হচ্ছে…</p>}
    <div className="compare-grid"><CountryColumn country={leftCountry} data={data[left]} loading={loading}/><CountryColumn country={rightCountry} data={data[right]} loading={loading}/></div>
  </section>;
}

import { useEffect, useMemo, useState } from 'react';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import phoneLabels from 'react-phone-number-input/locale/en';
import 'react-phone-number-input/style.css';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';
import { matchRoute } from './lib/matching.js';
import { adminRequest } from './lib/adminApi.js';

const EMPTY_PROFILE = {
  full_name: '', birth_date: '', nationality: 'Bangladesh', education: [], experience: [],
  skills: [], languages: [], desired_occupations: [],
};
const NOTICE = 'এটা শুধু তথ্যের জন্য। আবেদনের আগে অফিশিয়াল সাইটে যাচাই করুন। টাকার বিনিময়ে ভিসার প্রতিশ্রুতি দেওয়া কাউকে বিশ্বাস করবেন না।';
const STATUS_ORDER = { open: 0, limited: 1, unknown: 2, closed: 3 };
const STATUS_LABELS = { open: 'খোলা', limited: 'সীমিত', closed: 'বন্ধ', unknown: 'যাচাই করা তথ্য নেই' };
const CHECK_LABELS = { pass: 'মিলে গেছে', fail: 'মেলেনি', unknown: 'তথ্য নেই' };

function csvToArray(value) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}
function arrayToCsv(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}
function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'তথ্য দেওয়া নেই';
  if (Array.isArray(value)) return value.length ? value.map(displayValue).join(', ') : 'তথ্য দেওয়া নেই';
  if (typeof value === 'object') return Object.entries(value).filter(([, item]) => item !== null && item !== undefined && item !== '')
    .map(([key, item]) => `${key}: ${displayValue(item)}`).join(' · ') || 'তথ্য দেওয়া নেই';
  return String(value);
}
function dateLabel(value) {
  if (!value) return 'তারিখ দেওয়া নেই';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat('bn-BD', { dateStyle: 'long' }).format(parsed);
}
function ErrorMessage({ children }) {
  return children ? <p className="message error" role="alert">{children}</p> : null;
}
function Notice() {
  return <aside className="notice" aria-label="গুরুত্বপূর্ণ সতর্কতা"><span aria-hidden="true">ⓘ</span><p>{NOTICE}</p></aside>;
}
function Header({ user, onSignOut }) {
  return <header className="topbar"><a className="brand" href="#home" aria-label="ইউরোপ ওয়ার্ক গাইড হোম"><span className="brand-mark">ইউ</span><span>ইউরোপ ওয়ার্ক গাইড<small>নিরাপদ তথ্য, নিজের সিদ্ধান্ত</small></span></a>
    {user && <div className="user-actions"><span className="user-email">{user.email}</span><button className="button button-light small" onClick={onSignOut}>লগ আউট</button></div>}
  </header>;
}
function AuthPanel() {
  const [mode, setMode] = useState('signup');
  const [authMethod, setAuthMethod] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (resendCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => setResendCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendCountdown]);

  const clearNotices = () => { setError(''); setMessage(''); };
  const authErrorMessage = (err, method) => {
    const raw = `${err?.code || ''} ${err?.message || ''}`.toLowerCase();
    if (raw.includes('provider') && (raw.includes('disabled') || raw.includes('unsupported'))) {
      return 'এই provider এখনো Supabase Auth-এ চালু করা হয়নি। README-র provider setup অনুসরণ করুন।';
    }
    if (method === 'phone' && raw.includes('over_sms_send_rate_limit')) {
      return 'এই নম্বরে অনেকবার কোড চাওয়া হয়েছে। কিছুক্ষণ অপেক্ষা করে আবার চেষ্টা করুন।';
    }
    if (method === 'phone' && raw.includes('otp_expired')) {
      return 'কোডটির মেয়াদ শেষ হয়েছে। নতুন কোড নিয়ে আবার চেষ্টা করুন।';
    }
    if (method === 'phone' && (raw.includes('phone_provider_disabled') || raw.includes('sms') || raw.includes('phone'))) {
      return 'ফোনে কোড পাঠানো যায়নি। Supabase-এ Phone provider ও SMS provider চালু আছে কি না যাচাই করুন।';
    }
    if (method === 'email' && raw.includes('invalid login credentials')) {
      return 'ইমেইল বা পাসওয়ার্ড সঠিক নয়। আবার যাচাই করুন।';
    }
    return 'অনুরোধ সম্পন্ন হয়নি। সংযোগ ও Supabase Auth সেটিং যাচাই করে আবার চেষ্টা করুন।';
  };
  useEffect(() => {
    const callbackParams = new URLSearchParams(window.location.hash.slice(1));
    const callbackError = callbackParams.get('error_description') || callbackParams.get('error');
    if (!callbackError) return;
    setError(authErrorMessage({ message: callbackError }, 'oauth'));
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  }, []);

  const submitEmail = async (event) => {
    event.preventDefault(); clearNotices(); setBusy('email');
    try {
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) setMessage('ইমেইলে পাঠানো লিংক খুলে নিবন্ধন নিশ্চিত করুন। তারপর লগ ইন করুন।');
    } catch (err) { setError(authErrorMessage(err, 'email')); }
    finally { setBusy(''); }
  };

  const requestPhoneOtp = async (event) => {
    event.preventDefault(); clearNotices();
    if (!phone || !isValidPhoneNumber(phone)) { setError('দেশের কোডসহ সঠিক ফোন নম্বর দিন।'); return; }
    setBusy('phone');
    try {
      const { error: requestError } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
      if (requestError) throw requestError;
      setOtpSent(true); setOtp(''); setResendCountdown(60);
      setMessage('SMS-এ ৬ সংখ্যার কোড পাঠানো হয়েছে। নতুন নম্বর হলে কোড যাচাইয়ের পর অ্যাকাউন্ট তৈরি হবে।');
    } catch (err) { setError(authErrorMessage(err, 'phone')); }
    finally { setBusy(''); }
  };

  const verifyPhoneOtp = async (event) => {
    event.preventDefault(); clearNotices();
    if (!phone || !isValidPhoneNumber(phone)) { setError('ফোন নম্বরটি আবার যাচাই করুন।'); return; }
    if (!/^\d{6}$/.test(otp.trim())) { setError('SMS-এ পাওয়া ৬ সংখ্যার কোডটি লিখুন।'); return; }
    setBusy('phone');
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: otp.trim(), type: 'sms' });
      if (verifyError) throw verifyError;
    } catch (err) { setError(authErrorMessage(err, 'phone')); }
    finally { setBusy(''); }
  };

  const resendPhoneOtp = async () => {
    clearNotices(); setBusy('phone');
    try {
      const { error: requestError } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
      if (requestError) throw requestError;
      setOtp(''); setResendCountdown(60); setMessage('নতুন কোড পাঠানো হয়েছে।');
    } catch (err) { setError(authErrorMessage(err, 'phone')); }
    finally { setBusy(''); }
  };

  const signInWithProvider = async (provider) => {
    clearNotices(); setBusy(provider);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (oauthError) throw oauthError;
    } catch (err) { setError(authErrorMessage(err, provider)); setBusy(''); }
  };

  return <main className="auth-layout"><section className="hero-copy"><p className="eyebrow">আপনার পথ, আপনার নিয়ন্ত্রণে</p><h1>ইউরোপে কাজের<br className="desktop-break" /> তথ্য বুঝুন সহজে</h1><p className="hero-description">সরকারি উৎসের তথ্য দেখুন, নিজের যোগ্যতার সঙ্গে পথ মিলিয়ে নিন, আর নিজের সিভি তৈরি করুন।</p><div className="hero-points"><span>✓ যাচাইকৃত তথ্যের অবস্থা স্পষ্ট</span><span>✓ দালাল ছাড়া নিজে খোঁজার সহায়তা</span><span>✓ আপনার প্রোফাইল শুধু আপনার</span></div></section>
    <section className="auth-card"><div className="tabs auth-tabs"><button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); clearNotices(); }}>নতুন অ্যাকাউন্ট</button><button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); clearNotices(); }}>লগ ইন</button></div><h2>{mode === 'signup' ? 'শুরু করুন' : 'আবার স্বাগতম'}</h2><p className="muted">ইমেইল, Google, Facebook অথবা ফোন নম্বর দিয়ে {mode === 'signup' ? 'অ্যাকাউন্ট খুলুন' : 'প্রবেশ করুন'}।</p>
      <div className="tabs auth-method-tabs" role="tablist" aria-label="সাইন-ইন পদ্ধতি"><button type="button" role="tab" aria-selected={authMethod === 'email'} className={authMethod === 'email' ? 'active' : ''} onClick={() => { setAuthMethod('email'); clearNotices(); }}>ইমেইল</button><button type="button" role="tab" aria-selected={authMethod === 'phone'} className={authMethod === 'phone' ? 'active' : ''} onClick={() => { setAuthMethod('phone'); clearNotices(); }}>ফোন OTP</button></div>
      {authMethod === 'email' ? <form onSubmit={submitEmail} className="stack auth-form"><label>ইমেইল<input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>পাসওয়ার্ড<input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength="6" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><ErrorMessage>{error}</ErrorMessage>{message && <p className="message success">{message}</p>}<button className="button button-primary full" disabled={Boolean(busy)}>{busy === 'email' ? 'অপেক্ষা করুন…' : mode === 'signup' ? 'ইমেইলে অ্যাকাউন্ট খুলুন' : 'ইমেইল দিয়ে লগ ইন করুন'}</button></form> : <form onSubmit={otpSent ? verifyPhoneOtp : requestPhoneOtp} className="stack auth-form"><Field label="ফোন নম্বর" hint="দেশের কোড বেছে নম্বর দিন; যেকোনো দেশের নম্বর ব্যবহার করা যাবে।"><PhoneInput defaultCountry="BD" labels={{ ...phoneLabels, country: 'দেশ নির্বাচন করুন', phone: 'ফোন নম্বর' }} countrySelectProps={{ 'aria-label': 'দেশ নির্বাচন করুন' }} value={phone} onChange={(value) => setPhone(value || '')} disabled={Boolean(busy) || otpSent} placeholder="ফোন নম্বর" /></Field>{otpSent && <><Field label="SMS যাচাইকরণ কোড"><input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} required /></Field><div className="phone-code-actions"><button type="button" className="text-button" onClick={() => { setOtpSent(false); setOtp(''); setResendCountdown(0); clearNotices(); }} disabled={Boolean(busy)}>নম্বর পরিবর্তন</button><button type="button" className="text-button" onClick={resendPhoneOtp} disabled={Boolean(busy) || resendCountdown > 0}>{resendCountdown > 0 ? `${resendCountdown} সেকেন্ড পরে আবার কোড` : 'আবার কোড পাঠান'}</button></div></>}<ErrorMessage>{error}</ErrorMessage>{message && <p className="message success">{message}</p>}<button className="button button-primary full" disabled={Boolean(busy) || !phone || (otpSent && otp.length !== 6)}>{busy === 'phone' ? 'অপেক্ষা করুন…' : otpSent ? 'কোড যাচাই করে প্রবেশ করুন' : 'SMS কোড পাঠান'}</button></form>}
      <div className="auth-divider"><span>অথবা Google / Facebook দিয়ে চালিয়ে যান</span></div><div className="social-auth"><button type="button" className="social-button" onClick={() => signInWithProvider('google')} disabled={Boolean(busy)}><span className="provider-icon google-icon" aria-hidden="true">G</span><span>{busy === 'google' ? 'Google-এ যাচাই হচ্ছে…' : 'Google দিয়ে চালিয়ে যান'}</span></button><button type="button" className="social-button" onClick={() => signInWithProvider('facebook')} disabled={Boolean(busy)}><span className="provider-icon facebook-icon" aria-hidden="true">f</span><span>{busy === 'facebook' ? 'Facebook-এ যাচাই হচ্ছে…' : 'Facebook দিয়ে চালিয়ে যান'}</span></button></div>

    </section></main>;
}
function TabNav({ selected, onSelect, isAdmin }) {
  const tabs = [['profile', 'আমার প্রোফাইল'], ['countries', 'দেশ ও চাকরি'], ['cv', 'সিভি তৈরি'], ...(isAdmin ? [['admin', 'অ্যাডমিন']] : [])];
  return <nav className="tabs main-tabs" aria-label="প্রধান মেনু">{tabs.map(([id, label]) => <button key={id} className={selected === id ? 'active' : ''} onClick={() => onSelect(id)}>{label}</button>)}</nav>;
}function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
function RepeatableList({ title, entries, fields, onChange, emptyEntry }) {
  return <section className="repeatable-section"><div className="section-heading"><h3>{title}</h3><button type="button" className="button button-light small" onClick={() => onChange([...entries, { ...emptyEntry }])}>＋ যোগ করুন</button></div>
    {entries.length === 0 && <p className="muted empty-inline">এখনো কিছু যোগ করা হয়নি।</p>}
    {entries.map((entry, index) => <div className="repeat-item" key={`${title}-${index}`}>{fields.map((field) => <Field key={field.name} label={field.label}><input type={field.type || 'text'} min={field.type === 'number' ? '0' : undefined} step={field.type === 'number' ? '0.5' : undefined} value={entry[field.name] ?? ''} placeholder={field.placeholder || ''} onChange={(e) => onChange(entries.map((item, i) => i === index ? { ...item, [field.name]: e.target.value } : item))} /></Field>)}<button type="button" className="remove-button" onClick={() => onChange(entries.filter((_, i) => i !== index))}>মুছুন</button></div>)}
  </section>;
}
function ProfileForm({ profile, userId, onSaved }) {
  const [form, setForm] = useState(profile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(profile), [profile]);
  const setValue = (key, value) => { setForm((current) => ({ ...current, [key]: value })); setSaved(false); };
  const updateList = (key, value) => { setValue(key, value); };
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false);
    const payload = {
      user_id: userId,
      full_name: (form.full_name || "").trim(),
      birth_date: form.birth_date || null,
      nationality: (form.nationality || '').trim() || 'Bangladesh',
      education: (Array.isArray(form.education) ? form.education : []).map((item) => ({ degree: item.degree || '', institution: item.institution || '', year: item.year || '' })),
      experience: (Array.isArray(form.experience) ? form.experience : []).map((item) => ({ title: item.title || '', employer: item.employer || '', country: item.country || '', years: item.years === '' ? null : Number(item.years), description: item.description || '' })),
      skills: csvToArray(arrayToCsv(form.skills)),
      languages: (Array.isArray(form.languages) ? form.languages : []).map((item) => ({ name: item.name || '', level: item.level || '' })),
      desired_occupations: csvToArray(arrayToCsv(form.desired_occupations)),
      updated_at: new Date().toISOString(),
    };
    try {
      const { error: saveError } = await supabase.from('profiles').upsert(payload, { onConflict: 'user_id' });
      if (saveError) throw saveError;
      setForm((current) => ({ ...current, ...payload })); setSaved(true); onSaved(payload);
    } catch { setError('প্রোফাইল সংরক্ষণ করা যায়নি। সংযোগ বা অনুমতি যাচাই করে আবার চেষ্টা করুন।'); }
    finally { setBusy(false); }
  };
  return <form className="panel profile-form" onSubmit={submit}><div className="panel-heading"><div><p className="eyebrow">আপনার তথ্য</p><h2>আমার প্রোফাইল</h2></div><span className="privacy-pill">🔒 শুধু আপনার অ্যাকাউন্ট</span></div><p className="muted">আপনার দেওয়া তথ্য দিয়ে ভিসা পথের শর্ত মিলিয়ে দেখা হবে। কোনো তথ্য অনুমান করা হবে না।</p>
    <div className="form-grid"><Field label="পুরো নাম"><input value={form.full_name || ''} onChange={(e) => setValue('full_name', e.target.value)} autoComplete="name" /></Field><Field label="জন্মতারিখ"><input type="date" value={form.birth_date || ''} onChange={(e) => setValue('birth_date', e.target.value)} /></Field><Field label="জাতীয়তা"><input value={form.nationality || ''} onChange={(e) => setValue('nationality', e.target.value)} placeholder="Bangladesh" /></Field><Field label="পছন্দের পেশা" hint="কমা দিয়ে আলাদা করুন"><input value={arrayToCsv(form.desired_occupations)} onChange={(e) => setValue('desired_occupations', csvToArray(e.target.value))} placeholder="যেমন: Cook, Care worker" /></Field><Field label="দক্ষতা" hint="কমা দিয়ে আলাদা করুন"><input value={arrayToCsv(form.skills)} onChange={(e) => setValue('skills', csvToArray(e.target.value))} placeholder="যেমন: রান্না, ওয়েল্ডিং" /></Field></div>
    <RepeatableList title="শিক্ষা" entries={form.education || []} onChange={(v) => updateList('education', v)} emptyEntry={{ degree: '', institution: '', year: '' }} fields={[{ name: 'degree', label: 'ডিগ্রি / সনদ' }, { name: 'institution', label: 'প্রতিষ্ঠান' }, { name: 'year', label: 'বছর', type: 'number' }]} />
    <RepeatableList title="কাজের অভিজ্ঞতা" entries={form.experience || []} onChange={(v) => updateList('experience', v)} emptyEntry={{ title: '', employer: '', country: '', years: '', description: '' }} fields={[{ name: 'title', label: 'পদ / কাজ' }, { name: 'employer', label: 'প্রতিষ্ঠান' }, { name: 'country', label: 'দেশ' }, { name: 'years', label: 'বছর', type: 'number' }, { name: 'description', label: 'কাজের বিবরণ' }]} />
    <RepeatableList title="ভাষা" entries={form.languages || []} onChange={(v) => updateList('languages', v)} emptyEntry={{ name: '', level: '' }} fields={[{ name: 'name', label: 'ভাষা' }]} />
    {(form.languages || []).length > 0 && <div className="language-level-list">{form.languages.map((item, index) => <Field key={index} label={`${item.name || `ভাষা ${index + 1}`} — স্তর`}><select value={item.level || ''} onChange={(e) => updateList('languages', form.languages.map((entry, i) => i === index ? { ...entry, level: e.target.value } : entry))}><option value="">স্তর নির্বাচন করুন</option>{['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'Native'].map((level) => <option key={level} value={level}>{level === 'Native' ? 'মাতৃভাষা / Native' : level}</option>)}</select></Field>)}</div>}
    <ErrorMessage>{error}</ErrorMessage>{saved && <p className="message success">প্রোফাইল সংরক্ষণ হয়েছে।</p>}<div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'সংরক্ষণ হচ্ছে…' : 'প্রোফাইল সংরক্ষণ করুন'}</button></div>
  </form>;
}
function CheckList({ checks }) {
  if (!checks.length) return <p className="muted">এই রুটের জন্য মিলিয়ে দেখার মতো নির্দিষ্ট শর্ত প্রকাশিত নেই।</p>;
  return <ul className="check-list">{checks.map((check, index) => <li key={index}><span className={`check-badge ${check.status}`}>{CHECK_LABELS[check.status]}</span><span><strong>{check.label}</strong><small>{check.detail}</small></span></li>)}</ul>;
}
function RouteCard({ route, profile }) {
  const checks = matchRoute(profile, route);
  return <article className="route-card"><div className="route-title-row"><div><span className="route-type">{displayValue(route.route_type)}</span><h4>{displayValue(route.title)}</h4></div><span className="verified-tag">যাচাইকৃত</span></div>
    <p>{displayValue(route.summary)}</p><section className="route-section"><h5>আপনার সঙ্গে শর্তের মিল</h5><CheckList checks={checks} /></section>
    <div className="route-detail-grid"><section className="route-section"><h5>ফি</h5><p>{Array.isArray(route.fees) && route.fees.length ? route.fees.map((fee, i) => <span className="detail-line" key={i}>{displayValue(fee.name)}: {displayValue(fee.amount)} {displayValue(fee.currency)}</span>) : 'ফি দেওয়া নেই'}</p></section><section className="route-section"><h5>প্রয়োজনীয় নথি</h5><p>{displayValue(route.documents)}</p></section><section className="route-section"><h5>আবেদনের ধাপ</h5><p>{displayValue(route.steps)}</p></section><section className="route-section"><h5>সর্বশেষ যাচাই</h5><p>{dateLabel(route.last_verified)}</p></section></div>
    {route.official_url && <a className="external-link" href={route.official_url} target="_blank" rel="noreferrer">সরকারি তথ্যের পৃষ্ঠা খুলুন ↗</a>}
  </article>;
}
function CountryCard({ country, access, profile, expanded, data, loading, error, onToggle }) {
  const status = access?.access_status || 'unknown';
  return <article className={`country-card ${expanded ? 'expanded' : ''}`}><button className="country-summary" onClick={onToggle} aria-expanded={expanded}><span className="country-icon" aria-hidden="true">{country.code === 'IT' ? '🇮🇹' : '🌍'}</span><span className="country-name"><strong>{country.name}</strong><small>{country.code}</small></span><span className={`status-badge ${status}`}>{STATUS_LABELS[status]}</span><span className="chevron" aria-hidden="true">{expanded ? '−' : '+'}</span></button>
    {expanded && <div className="country-content">{loading ? <p className="loading-line">তথ্য লোড হচ্ছে…</p> : error ? <ErrorMessage>{error}</ErrorMessage> : <>
      <section className="access-summary"><h3>জাতীয়তা অনুযায়ী প্রবেশের তথ্য</h3>{access ? <><p>{displayValue(access.restrictions)}</p><p><strong>কোথায় আবেদন করবেন:</strong> {displayValue(access.apply_where)}</p><p><strong>নথির নোট:</strong> {displayValue(access.documents_note)}</p><p><strong>সর্বশেষ যাচাই:</strong> {dateLabel(access.last_verified)}</p>{access.official_url && <a href={access.official_url} target="_blank" rel="noreferrer">সরকারি পৃষ্ঠা ↗</a>}</> : <p className="muted">যাচাইকৃত জাতীয়তা-সংক্রান্ত তথ্য নেই। এখানে প্রবেশের অবস্থা অনুমান করা হয়নি।</p>}</section>
      <section className="country-subsection"><div className="section-heading"><h3>ভিসার পথ</h3><span className="count-pill">{data?.routes?.length || 0}</span></div>{data?.routes?.length ? data.routes.map((route) => <RouteCard key={route.id} route={route} profile={profile} />) : <p className="muted empty-inline">এখনো কোনো যাচাইকৃত ভিসা পথ নেই।</p>}</section>
      <section className="country-subsection"><div className="section-heading"><h3>চাকরির বিজ্ঞপ্তি</h3><span className="count-pill">{data?.jobs?.length || 0}</span></div>{data?.jobs?.length ? data.jobs.map((job) => <article className="job-card" key={job.id}><h4>{displayValue(job.title)}</h4><p><strong>{displayValue(job.employer)}</strong> · {displayValue(job.location)}</p><p>{displayValue(job.description)}</p><p className="muted">{displayValue(job.occupation)} · প্রকাশিত {dateLabel(job.posted_at)}</p>{job.apply_url && <a href={job.apply_url} target="_blank" rel="noreferrer">আবেদনের পৃষ্ঠা ↗</a>}</article>) : <p className="muted empty-inline">এখনো কোনো যাচাইকৃত সক্রিয় চাকরি নেই।</p>}</section>
    </>}</div>}
  </article>;
}
function CountriesPanel({ profile }) {
  const [countries, setCountries] = useState([]);

  const [accessRows, setAccessRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState('');
  const [countryData, setCountryData] = useState({});
  const [countryLoading, setCountryLoading] = useState({});
  const [countryErrors, setCountryErrors] = useState({});
  const nationality = profile.nationality?.trim() || 'Bangladesh';
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true); setError('');
      const [countryResult, accessResult] = await Promise.all([
        supabase.from('countries').select('code,name,languages,enabled').eq('enabled', true),
        supabase.from('country_access').select('*').eq('nationality', nationality).eq('review_status', 'verified'),
      ]);
      if (!active) return;
      if (countryResult.error || accessResult.error) setError('দেশের তালিকা লোড করা যায়নি। পরে আবার চেষ্টা করুন।');
      else { setCountries(countryResult.data || []); setAccessRows(accessResult.data || []); }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [nationality]);
  const accessByCode = useMemo(() => Object.fromEntries(accessRows.map((row) => [row.country_code, row])), [accessRows]);
  const sorted = useMemo(() => [...countries].sort((a, b) => {
    const statusA = accessByCode[a.code]?.access_status || 'unknown';
    const statusB = accessByCode[b.code]?.access_status || 'unknown';
    return (STATUS_ORDER[statusA] ?? 2) - (STATUS_ORDER[statusB] ?? 2) || String(a.name).localeCompare(String(b.name));
  }), [countries, accessByCode]);
  const toggle = async (country) => {
    if (expanded === country.code) { setExpanded(''); return; }
    setExpanded(country.code);
    if (countryData[country.code]) return;
    setCountryLoading((current) => ({ ...current, [country.code]: true }));
    setCountryErrors((current) => ({ ...current, [country.code]: '' }));
    const [routeResult, jobResult] = await Promise.all([
      supabase.from('visa_routes').select('*').eq('country_code', country.code).eq('review_status', 'verified').order('last_verified', { ascending: false }),
      supabase.from('jobs').select('*').eq('country_code', country.code).eq('review_status', 'verified').eq('active', true).order('posted_at', { ascending: false }),
    ]);
    if (routeResult.error || jobResult.error) setCountryErrors((current) => ({ ...current, [country.code]: 'এই দেশের তথ্য লোড করা যায়নি। পরে আবার চেষ্টা করুন।' }));
    else setCountryData((current) => ({ ...current, [country.code]: { routes: routeResult.data || [], jobs: jobResult.data || [] } }));
    setCountryLoading((current) => ({ ...current, [country.code]: false }));
  };
  return <section className="panel countries-panel"><div className="panel-heading"><div><p className="eyebrow">দেশ ও সুযোগ</p><h2>দেশ ও চাকরি</h2></div><span className="nationality-pill">জাতীয়তা: {nationality}</span></div><p className="muted">অবস্থা কেবল যাচাইকৃত তথ্য থেকে দেখানো হয়। দেশ খুলে রুটের শর্ত, ফি, নথি ও সরকারি লিংক দেখুন।</p><ErrorMessage>{error}</ErrorMessage>
    {loading ? <div className="loading-state">দেশের তালিকা লোড হচ্ছে…</div> : !countries.length ? <div className="empty-state"><span>🌍</span><h3>এখনো কোনো দেশ যুক্ত হয়নি</h3><p>যাচাইকৃত তথ্য যোগ হলে এখানে দেখা যাবে।</p></div> : <div className="country-list">{sorted.map((country) => <CountryCard key={country.code} country={country} access={accessByCode[country.code]} profile={profile} expanded={expanded === country.code} data={countryData[country.code]} loading={Boolean(countryLoading[country.code])} error={countryErrors[country.code]} onToggle={() => toggle(country)} />)}</div>}
  </section>;
}
function CvPanel({ profile, countries }) {
  const [destination, setDestination] = useState('IT');
  const [template, setTemplate] = useState('europass');
  const [contact, setContact] = useState({ email: '', phone: '', address: '' });
  const countryName = countries.find((country) => country.code === destination)?.name || 'ইতালি';
  return <section className="panel cv-panel"><div className="panel-heading no-print"><div><p className="eyebrow">নিজের পরিচয় তুলে ধরুন</p><h2>সিভি তৈরি</h2></div><button className="button button-primary" onClick={() => window.print()}>প্রিন্ট / PDF হিসেবে সংরক্ষণ</button></div><p className="muted no-print">তথ্য পূরণ করে প্রিভিউ দেখুন। প্রিন্ট উইন্ডোতে “Save as PDF” বেছে নিন।</p>
    <div className="cv-controls no-print"><Field label="গন্তব্য দেশ"><select value={destination} onChange={(e) => setDestination(e.target.value)}>{countries.length ? countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>) : <option value="IT">ইতালি</option>}</select></Field><Field label="সিভির ধরন"><select value={template} onChange={(e) => setTemplate(e.target.value)}><option value="europass">Europass-ধাঁচের (ছবি ছাড়া)</option><option value="tabular">টেবিল-ধাঁচের (ছবির জায়গাসহ)</option><option value="short">সংক্ষিপ্ত এক পৃষ্ঠা</option></select></Field><Field label="ইমেইল"><input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></Field><Field label="ফোন"><input type="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></Field><Field label="ঠিকানা"><input value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} /></Field></div>
    <article className={`cv-paper cv-${template}`}><div className="cv-paper-top">{template === 'tabular' && <div className="photo-placeholder">ছবির<br />জায়গা</div>}<div><p className="cv-country">{countryName} · জীবনবৃত্তান্ত</p><h1>{profile.full_name || 'আপনার নাম'}</h1><p className="cv-contact">{[contact.email, contact.phone, contact.address].filter(Boolean).join(' · ') || 'ইমেইল · ফোন · ঠিকানা যোগ করুন'}</p></div></div>
      <CvSection title="ব্যক্তিগত তথ্য"><p>জন্মতারিখ: {profile.birth_date || '—'} · জাতীয়তা: {profile.nationality || 'Bangladesh'}</p></CvSection>
      {profile.desired_occupations?.length > 0 && <CvSection title="কাঙ্ক্ষিত পেশা"><p>{profile.desired_occupations.join(' · ')}</p></CvSection>}
      {profile.experience?.length > 0 && <CvSection title="কাজের অভিজ্ঞতা">{profile.experience.slice(0, template === 'short' ? 2 : undefined).map((item, i) => <div className="cv-entry" key={i}><strong>{item.title || 'পদ'}</strong><span>{item.employer}{item.country ? ` · ${item.country}` : ''}{item.years ? ` · ${item.years} বছর` : ''}</span>{item.description && <p>{item.description}</p>}</div>)}</CvSection>}
      {profile.education?.length > 0 && <CvSection title="শিক্ষা">{profile.education.slice(0, template === 'short' ? 2 : undefined).map((item, i) => <div className="cv-entry" key={i}><strong>{item.degree || 'ডিগ্রি / সনদ'}</strong><span>{item.institution}{item.year ? ` · ${item.year}` : ''}</span></div>)}</CvSection>}
      {profile.skills?.length > 0 && <CvSection title="দক্ষতা"><p>{profile.skills.slice(0, template === 'short' ? 8 : undefined).join(' · ')}</p></CvSection>}
      {profile.languages?.length > 0 && <CvSection title="ভাষা">{profile.languages.slice(0, template === 'short' ? 4 : undefined).map((item, i) => <p key={i}>{item.name}: {item.level || 'স্তর উল্লেখ নেই'}</p>)}</CvSection>}
    </article>
  </section>;
}
function CvSection({ title, children }) {
  return <section className="cv-section"><h2>{title}</h2>{children}</section>;
}

const ADMIN_SECTIONS = {
  countries: { label: "দেশ", key: "code", fields: [
    { name: "code", label: "দেশের কোড", required: true }, { name: "name", label: "দেশের নাম", required: true },
    { name: "languages", label: "ভাষা", type: "csv" }, { name: "enabled", label: "দেশটি সক্রিয়", type: "checkbox", defaultValue: true },
  ] },
  country_access: { label: "জাতীয়তা প্রবেশ", key: "id", fields: [
    { name: "country_code", label: "দেশের কোড", required: true }, { name: "nationality", label: "জাতীয়তা", defaultValue: "Bangladesh", required: true },
    { name: "access_status", label: "প্রবেশের অবস্থা", type: "select", options: [["open", "খোলা"], ["limited", "সীমিত"], ["closed", "বন্ধ"], ["unknown", "তথ্য নেই"]], defaultValue: "unknown" },
    { name: "quota_included", label: "কোটা অন্তর্ভুক্ত", type: "checkbox" }, { name: "restrictions", label: "সীমাবদ্ধতা / নোট", type: "textarea" },
    { name: "apply_where", label: "কোথায় আবেদন করবেন", type: "textarea" }, { name: "documents_note", label: "নথির নোট", type: "textarea" },
    { name: "official_url", label: "সরকারি URL", type: "url" }, { name: "review_status", label: "পর্যালোচনার অবস্থা", type: "select", options: [["pending", "পর্যালোচনাধীন"], ["verified", "যাচাইকৃত"]], defaultValue: "pending" },
    { name: "last_verified", label: "সর্বশেষ যাচাই", type: "date" },
  ] },
  visa_routes: { label: "ভিসা পথ", key: "id", fields: [
    { name: "country_code", label: "দেশের কোড", required: true }, { name: "route_type", label: "রুটের ধরন", required: true },
    { name: "title", label: "শিরোনাম", required: true }, { name: "summary", label: "সারাংশ", type: "textarea" },
    { name: "requirements", label: "শর্ত (JSON)", type: "json", defaultValue: "{}" }, { name: "documents", label: "নথি (JSON)", type: "json", defaultValue: "[]" },
    { name: "fees", label: "ফি (JSON)", type: "json", defaultValue: "[]" }, { name: "steps", label: "ধাপ (JSON)", type: "json", defaultValue: "[]" },
    { name: "official_url", label: "সরকারি URL", type: "url" }, { name: "review_status", label: "পর্যালোচনার অবস্থা", type: "select", options: [["pending", "পর্যালোচনাধীন"], ["verified", "যাচাইকৃত"]], defaultValue: "pending" },
    { name: "last_verified", label: "সর্বশেষ যাচাই", type: "date" },
  ] },
  jobs: { label: "চাকরি", key: "id", fields: [
    { name: "country_code", label: "দেশের কোড", required: true }, { name: "title", label: "চাকরির শিরোনাম", required: true },
    { name: "occupation", label: "পেশা" }, { name: "employer", label: "প্রতিষ্ঠান" }, { name: "location", label: "কাজের স্থান" },
    { name: "description", label: "বিবরণ", type: "textarea" }, { name: "apply_url", label: "আবেদনের URL", type: "url" },
    { name: "source_url", label: "উৎস URL", type: "url" }, { name: "posted_at", label: "প্রকাশের সময়", type: "datetime-local" },
    { name: "active", label: "সক্রিয় বিজ্ঞপ্তি", type: "checkbox", defaultValue: true },
    { name: "review_status", label: "পর্যালোচনার অবস্থা", type: "select", options: [["pending", "পর্যালোচনাধীন"], ["verified", "যাচাইকৃত"]], defaultValue: "pending" },
  ] },
  ads: { label: "বিজ্ঞাপন", key: "id", fields: [
    { name: "title", label: "বিজ্ঞাপনের শিরোনাম", required: true }, { name: "body", label: "বিজ্ঞাপনের লেখা", type: "textarea" },
    { name: "href", label: "গন্তব্য URL", type: "url" }, { name: "image_url", label: "ছবির URL (ঐচ্ছিক)", type: "url" },
    { name: "start_date", label: "শুরুর তারিখ", type: "date" }, { name: "end_date", label: "শেষের তারিখ", type: "date" },
    { name: "active", label: "বিজ্ঞাপন সক্রিয়", type: "checkbox", defaultValue: true },
  ] },
};

function freshAdminForm(section) {
  return Object.fromEntries(section.fields.map((field) => [field.name, field.defaultValue ?? (field.type === "checkbox" ? false : "")]));
}
function adminFormFromRow(section, row) {
  const form = {};
  for (const field of section.fields) {
    const value = row[field.name];
    if (field.type === "csv") form[field.name] = Array.isArray(value) ? value.join(", ") : "";
    else if (field.type === "json") form[field.name] = value === null || value === undefined ? field.defaultValue : JSON.stringify(value, null, 2);
    else if (field.type === "datetime-local") form[field.name] = value ? new Date(value).toISOString().slice(0, 16) : "";
    else form[field.name] = value ?? field.defaultValue ?? (field.type === "checkbox" ? false : "");
  }
  return form;
}
function adminRecordFromForm(section, form) {
  const record = {};
  for (const field of section.fields) {
    const value = form[field.name];
    if (field.type === "checkbox") record[field.name] = Boolean(value);
    else if (field.type === "csv") record[field.name] = csvToArray(value || "");
    else if (field.type === "json") record[field.name] = value?.trim() ? JSON.parse(value) : null;
    else if (field.type === "datetime-local") record[field.name] = value ? new Date(value).toISOString() : null;
    else record[field.name] = value === "" ? null : value;
  }
  return record;
}
function rowTitle(resource, row) {
  if (resource === "countries") return `${row.name} (${row.code})`;
  if (resource === "country_access") return `${row.country_code} · ${row.nationality}`;
  return row.title || row.name || row.id;
}
function AdBanner() {
  const [ads, setAds] = useState([]);
  useEffect(() => {
    let active = true;
    fetch("/ads.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : []).then((rows) => {
      if (active && Array.isArray(rows)) setAds(rows);
    }).catch(() => { if (active) setAds([]); });
    return () => { active = false; };
  }, []);
  const today = new Date().toISOString().slice(0, 10);
  const visibleAds = ads.filter((ad) => ad.active && (!ad.start_date || ad.start_date <= today) && (!ad.end_date || ad.end_date >= today));
  if (!visibleAds.length) return null;
  return <section className="ads-banner" aria-label="বিজ্ঞাপন"><div className="ads-heading"><h2>আপনার জন্য</h2><span>বিজ্ঞাপন</span></div><div className="ads-grid">{visibleAds.map((ad) => <article className="ad-card" key={ad.id}>{ad.image_url && <img src={ad.image_url} alt="" loading="lazy" />}<div><span className="ad-label">স্পনসরকৃত</span><h3>{ad.title}</h3><p>{ad.body}</p>{/^https?:\/\//i.test(ad.href || "") && <a href={ad.href} target="_blank" rel="noreferrer">আরও জানুন ↗</a>}</div></article>)}</div></section>;
}
function AdminPanel() {
  const [resource, setResource] = useState("countries");
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(() => freshAdminForm(ADMIN_SECTIONS.countries));
  const [editingKey, setEditingKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const section = ADMIN_SECTIONS[resource];
  const loadItems = async (selected = resource) => {
    setLoading(true); setError("");
    try {
      const rows = await adminRequest(selected);
      setItems(Array.isArray(rows) ? rows : []);
    } catch (err) { setItems([]); setError(err.message || "তথ্য লোড করা যায়নি।"); }
    finally { setLoading(false); }
  };
  useEffect(() => { setForm(freshAdminForm(ADMIN_SECTIONS[resource])); setEditingKey(null); setMessage(""); loadItems(resource); }, [resource]);
  const startEdit = (row) => {
    setEditingKey(row[section.key] ?? null);
    setForm(adminFormFromRow(section, row));
    setError(""); setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const record = adminRecordFromForm(section, form);
      if (resource === "ads") {
        const ad = { ...record, id: editingKey || crypto.randomUUID() };
        const next = editingKey ? items.map((item) => item.id === editingKey ? ad : item) : [...items, ad];
        await adminRequest("ads", "POST", { ads: next });
        setMessage("বিজ্ঞাপন GitHub-এ সংরক্ষিত হয়েছে। Vercel deploy শেষ হলে অ্যাপে দেখা যাবে।");
      } else {
        if (editingKey) record[section.key] = editingKey;
        await adminRequest(resource, "POST", { record });
        setMessage("তথ্য সংরক্ষণ হয়েছে। verified status হলে এটি user-দের কাছে দেখা যাবে।");
      }
      setEditingKey(null); setForm(freshAdminForm(section)); await loadItems(resource);
    } catch (err) { setError(err.message || "তথ্য সংরক্ষণ করা যায়নি।"); }
    finally { setBusy(false); }
  };
  return <section className="panel admin-panel"><div className="panel-heading"><div><p className="eyebrow">কনটেন্ট পরিচালনা</p><h2>অ্যাডমিন প্যানেল</h2></div><span className="privacy-pill">🔒 অনুমোদিত অ্যাডমিন</span></div><p className="muted">দেশ, প্রবেশের তথ্য, ভিসা পথ, চাকরি ও বিজ্ঞাপন যোগ বা সম্পাদনা করুন। user-দের দেখাতে status “যাচাইকৃত” করুন।</p>
    <div className="admin-resource-tabs">{Object.entries(ADMIN_SECTIONS).map(([key, item]) => <button key={key} className={resource === key ? "active" : ""} onClick={() => setResource(key)}>{item.label}</button>)}</div>
    <form className="admin-form" onSubmit={save}><div className="section-heading"><h3>{editingKey ? `${section.label} সম্পাদনা` : `নতুন ${section.label} যোগ করুন`}</h3>{editingKey && <button type="button" className="button button-light small" onClick={() => { setEditingKey(null); setForm(freshAdminForm(section)); }}>বাতিল</button>}</div>
      <div className="admin-fields">{section.fields.map((field) => <Field key={field.name} label={field.label}>{field.type === "textarea" || field.type === "json" ? <textarea required={field.required} rows={field.type === "json" ? 5 : 3} value={form[field.name] ?? ""} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} /> : field.type === "select" ? <select required={field.required} value={form[field.name] ?? ""} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })}><option value="">নির্বাচন করুন</option>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : field.type === "checkbox" ? <input className="checkbox-input" type="checkbox" checked={Boolean(form[field.name])} onChange={(e) => setForm({ ...form, [field.name]: e.target.checked })} /> : <input type={field.type === "csv" ? "text" : field.type || "text"} required={field.required} value={form[field.name] ?? ""} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} />}</Field>)}</div>
      <ErrorMessage>{error}</ErrorMessage>{message && <p className="message success">{message}</p>}<div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? "সংরক্ষণ হচ্ছে…" : editingKey ? "পরিবর্তন সংরক্ষণ" : "যোগ করুন"}</button></div>
    </form>
    <section className="admin-records"><div className="section-heading"><h3>বর্তমান {section.label} তালিকা</h3><button className="button button-light small" onClick={() => loadItems(resource)}>রিফ্রেশ</button></div>{loading ? <p className="loading-line">তথ্য লোড হচ্ছে…</p> : error ? <ErrorMessage>{error}</ErrorMessage> : !items.length ? <p className="muted empty-inline">এখনো কোনো তথ্য নেই।</p> : items.map((item) => <article className="admin-record" key={item[section.key] || item.id}><div><strong>{rowTitle(resource, item)}</strong><small>{item.review_status || (item.active === false ? "নিষ্ক্রিয়" : item.enabled === false ? "বন্ধ" : resource === "ads" ? item.active ? "সক্রিয়" : "নিষ্ক্রিয়" : "সক্রিয়")}</small></div><button className="button button-light small" onClick={() => startEdit(item)}>সম্পাদনা</button></article>)}</section>
  </section>;
}
export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [selectedTab, setSelectedTab] = useState('profile');
  const [countries, setCountries] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) { setAuthLoading(false); return undefined; }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setProfileError('সংযোগে সমস্যা হয়েছে। পৃষ্ঠাটি আবার লোড করুন।');
      setUser(data?.session?.user || null); setAuthLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!user) { setProfile(EMPTY_PROFILE); return undefined; }
    let active = true;
    setProfileLoading(true); setProfileError('');
    supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error) setProfileError('প্রোফাইল লোড করা যায়নি। আপনার Supabase profiles নীতিগুলো যাচাই করুন।');
      else if (data) setProfile({ ...EMPTY_PROFILE, ...data });
      else setProfile(EMPTY_PROFILE);
      setProfileLoading(false);
    });
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    if (!user) { setIsAdmin(false); return undefined; }
    let active = true;
    adminRequest("check").then(() => { if (active) setIsAdmin(true); }).catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, [user]);
  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    supabase.from('countries').select('code,name,enabled').eq('enabled', true).then(({ data }) => { if (active) setCountries(data || []); });
    return () => { active = false; };
  }, [user]);
  const signOut = async () => { const { error } = await supabase.auth.signOut(); if (error) setProfileError('লগ আউট করা যায়নি। আবার চেষ্টা করুন।'); else setSelectedTab('profile'); };
  if (!isSupabaseConfigured) return <div className="app-shell"><Header /><main className="config-error"><span>⚙</span><h1>অ্যাপ সেটআপ অসম্পূর্ণ</h1><p><code>app/.env</code> ফাইলে <code>VITE_SUPABASE_URL</code> এবং <code>VITE_SUPABASE_ANON_KEY</code> যোগ করে আবার চালু করুন।</p></main><Notice /></div>;
  return <div className="app-shell"><Header user={user} onSignOut={signOut} />
    {authLoading ? <main className="loading-state">অ্যাকাউন্ট যাচাই হচ্ছে…</main> : !user ? <AuthPanel /> : <main className="workspace"><TabNav selected={selectedTab} onSelect={setSelectedTab} isAdmin={isAdmin} /><AdBanner />{profileError && <div className="page-error"><ErrorMessage>{profileError}</ErrorMessage></div>}{profileLoading ? <div className="loading-state panel">প্রোফাইল লোড হচ্ছে…</div> : <>
      {selectedTab === 'profile' && <ProfileForm key={user.id} profile={profile} userId={user.id} onSaved={setProfile} />}
      {selectedTab === 'countries' && <CountriesPanel profile={profile} />}
      {selectedTab === 'cv' && <CvPanel profile={profile} countries={countries} />}
      {selectedTab === 'admin' && isAdmin && <AdminPanel />}
    </>}</main>}
    <Notice /><footer className="site-footer">সরকারি তথ্যের লিংক খুলে নিয়ম ও আবেদন পদ্ধতি নিজে যাচাই করুন।</footer>
  </div>;
}








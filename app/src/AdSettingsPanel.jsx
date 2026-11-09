import { useEffect, useState } from 'react';
import { adminRequest } from './lib/adminApi.js';

const DEFAULTS = { ads_enabled: true, banner_interval_minutes: 5, disable_on_legal_warnings: false, popunder_enabled: false };
export default function AdSettingsPanel() {
  const [settings, setSettings] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/ads-config.json', { cache: 'no-store' }).then((response) => response.ok ? response.json() : DEFAULTS).then((data) => { if (active) setSettings({ ...DEFAULTS, ...data }); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const save = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const result = await adminRequest('ad-settings', 'POST', { settings: { ...settings, popunder_enabled: false } });
      setSettings({ ...DEFAULTS, ...result.settings });
      setMessage('বিজ্ঞাপনের নিয়ম GitHub-এ সংরক্ষিত হয়েছে। Vercel deploy শেষ হলে নতুন নিয়ম কার্যকর হবে।');
    } catch (e) { setError(e.message || 'বিজ্ঞাপনের নিয়ম সংরক্ষণ করা যায়নি।'); }
    finally { setBusy(false); }
  };
  return <section className="panel ad-settings-panel">
    <div className="panel-heading"><div><p className="eyebrow">বিজ্ঞাপন ও ব্যবহারকারীর অভিজ্ঞতা</p><h2>বিজ্ঞাপন নিয়ন্ত্রণ</h2></div><span className="privacy-pill">Safe banner mode</span></div>
    <form onSubmit={save}>
      <label className="ad-setting-toggle"><span><strong>সব বিজ্ঞাপন চালু রাখুন</strong><small>বন্ধ করলে সাইটের সব banner ad লুকানো হবে।</small></span><input type="checkbox" checked={settings.ads_enabled} onChange={(e) => setSettings((old) => ({ ...old, ads_enabled: e.target.checked }))} /></label>
      <label className="field ad-setting-interval"><span>Banner আবার দেখানোর ব্যবধান (মিনিট)</span><input type="number" min="1" max="1440" step="1" value={settings.banner_interval_minutes} onChange={(e) => setSettings((old) => ({ ...old, banner_interval_minutes: Number(e.target.value) }))} /></label>
      <label className="ad-setting-toggle"><span><strong>ভিসা/আইনি সতর্কতার পৃষ্ঠায় বিজ্ঞাপন বন্ধ রাখুন</strong><small>দেশ, তুলনা, চাকরি, CV, Cover Letter ও নীতির পৃষ্ঠায় banner লুকানো হবে।</small></span><input type="checkbox" checked={settings.disable_on_legal_warnings} onChange={(e) => setSettings((old) => ({ ...old, disable_on_legal_warnings: e.target.checked }))} /></label>
      <p className="message warning">Pop-under এবং third-party script injection এই সংস্করণে ইচ্ছাকৃতভাবে নিষ্ক্রিয়—এগুলো ব্যবহারকারীর নিরাপত্তা ও বিজ্ঞাপন নীতির ঝুঁকি তৈরি করতে পারে।</p>
      {error && <p className="message error" role="alert">{error}</p>}{message && <p className="message success" role="status">{message}</p>}
      <div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'সংরক্ষণ হচ্ছে…' : 'বিজ্ঞাপন সেটিংস সংরক্ষণ'}</button></div>
    </form>
  </section>;
}

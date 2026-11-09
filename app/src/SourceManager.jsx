import { useEffect, useState } from 'react';
import { adminRequest } from './lib/adminApi.js';

export default function SourceManager() {
  const [configs, setConfigs] = useState([]);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    const [configResult, historyResult] = await Promise.allSettled([adminRequest('sources'), adminRequest('source_pages')]);
    if (configResult.status === 'fulfilled') {
      const rows = Array.isArray(configResult.value) ? configResult.value : [];
      setConfigs(rows);
      const next = rows.find((row) => row.code === selected) || rows[0];
      if (next) { setSelected(next.code); setDraft(JSON.stringify({ code: next.code, name: next.name, language: next.language, sources: next.sources }, null, 2)); }
    } else setError(configResult.reason?.message || 'Source config লোড করা যায়নি।');
    if (historyResult.status === 'fulfilled') setHistory(Array.isArray(historyResult.value) ? historyResult.value : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const choose = (code) => {
    const row = configs.find((item) => item.code === code);
    if (!row) return;
    setSelected(code);
    setDraft(JSON.stringify({ code: row.code, name: row.name, language: row.language, sources: row.sources }, null, 2));
    setError(''); setMessage('');
  };
  const save = async () => {
    setBusy('save'); setError(''); setMessage('');
    try {
      const config = JSON.parse(draft);
      const result = await adminRequest('sources', 'POST', { config });
      setMessage(`${result.config.name} source registry GitHub-এ সংরক্ষিত হয়েছে। Scraper চালাতে আলাদা Actions permission লাগবে।`);
      await load();
    } catch (e) { setError(e.message || 'Source config সংরক্ষণ করা যায়নি। JSON ও URL যাচাই করুন।'); }
    finally { setBusy(''); }
  };
  const runNow = async () => {
    if (!window.confirm('সরকারি উৎসগুলো আবার পরীক্ষা করার GitHub Actions workflow চালু করবেন? সংগৃহীত immigration তথ্য review queue-তে pending থাকবে।')) return;
    setBusy('run'); setError(''); setMessage('');
    try {
      const result = await adminRequest('scraper-run', 'POST', {});
      setMessage(result.message || 'Scraper workflow queue করা হয়েছে।');
    } catch (e) { setError(e.message || 'Scraper চালু করা যায়নি। GitHub token-এ Actions write permission লাগতে পারে।'); }
    finally { setBusy(''); }
  };
  return <section className="panel source-manager">
    <div className="panel-heading"><div><p className="eyebrow">সরকারি উৎস ও crawler</p><h2>Sources পরিচালনা</h2></div><button type="button" className="button button-light small" onClick={load} disabled={Boolean(busy || loading)}>রিফ্রেশ</button></div>
    <p className="muted">এখানে source config সম্পাদনা করা যায়। শুধু HTTPS URL গ্রহণ করা হয়; প্রতিটি immigration পরিবর্তন প্রকাশের আগে Admin-কে যাচাই করতে হবে।</p>
    {loading ? <p className="loading-line">Source registry লোড হচ্ছে…</p> : <><div className="source-toolbar"><label className="field"><span>দেশের source config</span><select value={selected} onChange={(e) => choose(e.target.value)}>{configs.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}</select></label><button type="button" className="button button-primary" onClick={save} disabled={Boolean(busy || !selected)}>{busy === 'save' ? 'সংরক্ষণ হচ্ছে…' : 'Source config সংরক্ষণ'}</button></div><label className="field"><span>JSON config</span><textarea className="source-json-editor" rows={12} value={draft} onChange={(e) => setDraft(e.target.value)} spellCheck="false" /></label><div className="form-actions"><button type="button" className="button button-light" onClick={runNow} disabled={Boolean(busy)}>{busy === 'run' ? 'Workflow queue হচ্ছে…' : 'এখনই official-source scraper চালান'}</button></div></>}
    {error && <p className="message error" role="alert">{error}</p>}{message && <p className="message success" role="status">{message}</p>}
    <div className="source-history"><div className="section-heading"><h3>সাম্প্রতিক সংগৃহীত পৃষ্ঠা</h3><span className="count-pill">{history.length}</span></div>{history.length ? <div className="source-history-list">{history.map((item) => <article key={item.id || item.url} className="source-history-row"><div><strong>{item.country_code || '—'}</strong><a href={item.url} target="_blank" rel="noreferrer">{item.url}</a><small>Fetched: {item.fetched_at ? new Date(item.fetched_at).toLocaleString() : 'এখনো সংগ্রহ হয়নি'}</small></div><span className={item.changed ? 'source-changed' : 'source-unchanged'}>{item.changed ? 'পরিবর্তন শনাক্ত' : 'পরিবর্তন নেই'}</span></article>)}</div> : <p className="muted">Source fetch history নেই, অথবা Supabase service key / migration কনফিগার করা হয়নি।</p>}</div>
  </section>;
}

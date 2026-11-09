import { useState } from 'react';
import { adminRequest } from './lib/adminApi.js';

const formatCount = (value) => Number(value || 0).toLocaleString('bn-BD');
function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function AdminMaintenance() {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState('merge');
  const [audit, setAudit] = useState([]);
  const [auditLoaded, setAuditLoaded] = useState(false);

  const exportBackup = async () => {
    setBusy('export'); setError(''); setMessage('');
    try {
      const backup = await adminRequest('backup', 'POST', { action: 'export' });
      downloadJson(backup, `europe-work-guide-encrypted-backup-${new Date().toISOString().slice(0,10)}.json`);
      setMessage('এনক্রিপ্ট করা ব্যাকআপ ডাউনলোড শুরু হয়েছে। ফাইলটি নিরাপদ স্থানে রাখুন; BACKUP_ENCRYPTION_KEY হারালে এটি পুনরুদ্ধার করা যাবে না।');
    } catch (e) { setError(e.message || 'ব্যাকআপ তৈরি করা যায়নি।'); }
    finally { setBusy(''); }
  };
  const chooseFile = async (event) => {
    const selected = event.target.files?.[0];
    setFile(null); setPreview(null); setError(''); setMessage('');
    if (!selected) return;
    if (selected.size > 4 * 1024 * 1024) { setError('ফাইলটি ৪ MB-এর বেশি। ছোট ব্যাকআপ ফাইল নির্বাচন করুন।'); event.target.value = ''; return; }
    try {
      const parsed = JSON.parse(await selected.text());
      if (parsed?.format !== 'europe-work-guide-encrypted-backup') throw new Error('এটি Europe Work Guide-এর এনক্রিপ্ট করা ব্যাকআপ ফাইল নয়।');
      setFile(parsed);
      setMessage('ব্যাকআপ ফাইল নির্বাচিত হয়েছে। আমদানির আগে প্রিভিউ যাচাই করুন।');
    } catch (e) { setError(e.message || 'JSON ব্যাকআপ ফাইল পড়া যায়নি।'); }
  };
  const previewBackup = async () => {
    if (!file) return;
    setBusy('preview'); setError(''); setMessage(''); setPreview(null);
    try { setPreview(await adminRequest('backup', 'POST', { action: 'preview', backup: file })); }
    catch (e) { setError(e.message || 'ব্যাকআপ যাচাই করা যায়নি।'); }
    finally { setBusy(''); }
  };
  const restoreBackup = async () => {
    if (!file || !preview?.valid) return;
    const warning = mode === 'empty_database_restore'
      ? 'সম্পূর্ণ restore কেবল খালি ডেটাবেসে চলবে। এই কাজের আগে নিশ্চিত করুন যে নির্বাচিত ডেটাবেসটি খালি। এগোবেন?'
      : 'ব্যাকআপের রেকর্ড বর্তমান ডেটার সঙ্গে merge হবে। একই ID/unique key-এর রেকর্ড আপডেট হতে পারে। এগোবেন?';
    if (!window.confirm(warning)) return;
    setBusy('restore'); setError(''); setMessage('');
    try {
      const result = await adminRequest('backup', 'POST', { action: 'restore', backup: file, mode, confirm: true });
      setMessage(`Restore সম্পন্ন হয়েছে। মোট ${formatCount(result.restored_rows)} রেকর্ড প্রক্রিয়া হয়েছে। প্রকাশের আগে আমদানি করা ভিসা তথ্য পর্যালোচনা করুন।`);
      setPreview(null); setFile(null);
    } catch (e) { setError(e.message || 'Restore সম্পন্ন হয়নি। আংশিক import হয়ে থাকতে পারে; ডেটাবেস পরীক্ষা করুন।'); }
    finally { setBusy(''); }
  };
  const loadAudit = async () => {
    setBusy('audit'); setError('');
    try { const rows = await adminRequest('admin_audit_log'); setAudit(Array.isArray(rows) ? rows : []); setAuditLoaded(true); }
    catch (e) { setError(e.message || 'অডিট লগ লোড করা যায়নি।'); }
    finally { setBusy(''); }
  };
  return <section className="panel admin-maintenance">
    <div className="panel-heading"><div><p className="eyebrow">ব্যাকআপ ও নিরাপত্তা</p><h2>ব্যাকআপ, Restore ও Audit Log</h2></div><span className="privacy-pill">এনক্রিপ্ট করা</span></div>
    <p className="muted">ব্যাকআপে প্রোফাইলসহ ব্যক্তিগত তথ্য থাকতে পারে। সার্ভার AES-256-GCM ও gzip ব্যবহার করে; ব্যাকআপ এনক্রিপশন কী ডেটাবেসের বাইরে রাখতে হবে।</p>
    <div className="maintenance-action"><div><strong>সম্পূর্ণ ডেটাবেস ব্যাকআপ</strong><p>সমর্থিত ডেটাবেস টেবিল ও বিজ্ঞাপনের কনফিগারেশন এনক্রিপ্ট করে JSON ফাইল তৈরি করুন।</p></div><button type="button" className="button button-primary" onClick={exportBackup} disabled={Boolean(busy)}>{busy === 'export' ? 'তৈরি হচ্ছে…' : 'এনক্রিপ্ট করা ব্যাকআপ ডাউনলোড'}</button></div>
    <div className="maintenance-restore">
      <h3>ব্যাকআপ যাচাই ও Restore</h3>
      <label className="field"><span>ব্যাকআপ JSON ফাইল</span><input type="file" accept=".json,application/json" onChange={chooseFile} disabled={Boolean(busy)} /></label>
      {file && <><div className="maintenance-mode"><label><input type="radio" name="restore-mode" value="merge" checked={mode === 'merge'} onChange={() => setMode('merge')} /> Merge — বিদ্যমান রেকর্ড রাখুন; মিল থাকা রেকর্ড আপডেট হতে পারে</label><label><input type="radio" name="restore-mode" value="empty_database_restore" checked={mode === 'empty_database_restore'} onChange={() => setMode('empty_database_restore')} /> খালি ডেটাবেসে পূর্ণ Restore</label></div><div className="form-actions"><button type="button" className="button button-light" onClick={previewBackup} disabled={Boolean(busy)}>{busy === 'preview' ? 'যাচাই হচ্ছে…' : 'ব্যাকআপ যাচাই ও Preview'}</button>{preview?.valid && <button type="button" className="button button-primary" onClick={restoreBackup} disabled={Boolean(busy)}>{busy === 'restore' ? 'Restore চলছে…' : 'নিশ্চিত করে Restore'}</button>}</div></>}
      {preview?.valid && <div className="backup-preview"><h4>ব্যাকআপ প্রিভিউ</h4><p className="muted">তৈরির সময়: {preview.exported_at || 'উল্লেখ নেই'}</p><div className="backup-counts">{Object.entries(preview.counts || {}).map(([name,count]) => <div key={name}><span>{name}</span><strong>{formatCount(count)}</strong><small>বর্তমানে: {preview.current_counts?.[name] === null || preview.current_counts?.[name] === undefined ? 'যাচাই হয়নি' : formatCount(preview.current_counts[name])}</small></div>)}</div>{mode === 'empty_database_restore' && Object.values(preview.current_counts || {}).some(value => value > 0) && <p className="message error">এক বা একাধিক টেবিলে রেকর্ড আছে। সার্ভার পূর্ণ Restore প্রত্যাখ্যান করবে।</p>}</div>}
    </div>
    {error && <p className="message error" role="alert">{error}</p>}
    {message && <p className="message success" role="status">{message}</p>}
    <div className="maintenance-audit"><div><h3>অ্যাডমিন Audit Log</h3><p className="muted">সাম্প্রতিক প্রশাসনিক পরিবর্তন ও ব্যাকআপ কার্যক্রম। লগ টেবিলের migration প্রয়োগ করা থাকতে হবে।</p></div><button type="button" className="button button-light small" onClick={loadAudit} disabled={Boolean(busy)}>{busy === 'audit' ? 'লোড হচ্ছে…' : 'লগ দেখুন / রিফ্রেশ'}</button></div>
    {auditLoaded && (audit.length ? <div className="audit-list">{audit.map((item) => <article className="audit-entry" key={item.id}><div><strong>{item.action}</strong><span>{item.entity}</span></div><p>{item.admin_email || item.admin_user_id || 'অ্যাডমিন'}</p><time>{item.created_at ? new Date(item.created_at).toLocaleString() : 'তারিখ নেই'}</time></article>)}</div> : <p className="muted">এখনো কোনো অডিট রেকর্ড নেই।</p>)}
  </section>;
}

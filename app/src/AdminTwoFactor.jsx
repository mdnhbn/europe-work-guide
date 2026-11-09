import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';
import { adminRequest } from './lib/adminApi.js';

export default function AdminTwoFactor({ children }) {
  const [mode, setMode] = useState('loading');
  const [factorId, setFactorId] = useState('');
  const [totp, setTotp] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    const [status, factorsResult] = await Promise.all([
      adminRequest('check'),
      supabase.auth.mfa.listFactors(),
    ]);
    if (factorsResult.error) throw factorsResult.error;
    const verifiedFactor = (factorsResult.data?.totp || []).find((factor) => factor.status === 'verified');
    setFactorId(verifiedFactor?.id || '');
    setTotp(null);
    setCode('');
    setMode(status?.totp_verified ? 'verified' : verifiedFactor ? 'challenge' : 'enroll');
    return status;
  }, []);

  useEffect(() => {
    let active = true;
    setMode('loading');
    refresh().catch(() => {
      if (active) {
        setError('অ্যাডমিনের TOTP অবস্থা যাচাই করা যায়নি। Supabase Auth সংযোগ দেখে আবার চেষ্টা করুন।');
        setMode('error');
      }
    });
    return () => { active = false; };
  }, [refresh]);

  const beginEnrollment = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Europe Work Guide admin',
      });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setTotp(data.totp);
      setCode('');
      setMode('enroll_verify');
    } catch {
      setError('অথেনটিকেটর সেটআপ শুরু হয়নি। Supabase Auth-এ TOTP MFA চালু আছে কি না যাচাই করুন।');
    } finally { setBusy(false); }
  };

  const verify = async (event) => {
    event.preventDefault();
    if (!factorId || code.length !== 6) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
      const status = await refresh();
      if (!status?.totp_verified) throw new Error('TOTP verification has not appeared in the current session');
      setMessage('TOTP যাচাই সম্পন্ন হয়েছে। অ্যাডমিন প্যানেল খোলা হচ্ছে।');
    } catch {
      setError('কোড যাচাই হয়নি। অথেনটিকেটর অ্যাপের নতুন ৬ সংখ্যার কোড দিয়ে আবার চেষ্টা করুন।');
    } finally { setBusy(false); }
  };

  if (mode === 'verified') return children;
  if (mode === 'loading') return <section className="panel admin-two-factor"><p className="loading-line">অ্যাডমিন TOTP যাচাই হচ্ছে…</p></section>;

  return <section className="panel admin-two-factor">
    <div className="panel-heading"><div><p className="eyebrow">অ্যাডমিন নিরাপত্তা</p><h2>অথেনটিকেটর যাচাই</h2></div><span className="privacy-pill">TOTP আবশ্যক</span></div>
    <p className="muted">অ্যাডমিন ডেটা দেখতে বা বদলাতে অথেনটিকেটর অ্যাপের TOTP কোড যাচাই করুন। এই যাচাই সার্ভারেও বাধ্যতামূলক।</p>
    {mode === 'enroll' && <><p>প্রথমে একটি authenticator app দিয়ে অ্যাডমিন TOTP সেট আপ করুন।</p><button type="button" className="button button-primary" onClick={beginEnrollment} disabled={busy}>{busy ? 'সেটআপ হচ্ছে…' : 'অথেনটিকেটর সেট আপ করুন'}</button></>}
    {mode === 'error' && <button type="button" className="button button-light" onClick={() => { setError(''); setMode('loading'); refresh().catch(() => { setError('অ্যাডমিনের TOTP অবস্থা যাচাই করা যায়নি।'); setMode('error'); }); }}>আবার যাচাই করুন</button>}
    {(mode === 'challenge' || mode === 'enroll_verify') && <form className="stack" onSubmit={verify}>
      {mode === 'enroll_verify' && <div className="totp-enrollment">
        <p>Authenticator app দিয়ে QR code স্ক্যান করুন। স্ক্যান করা না গেলে নিচের key হাতে লিখুন।</p>
        {totp?.qr_code && <img src={totp.qr_code} alt="Authenticator app-এর জন্য TOTP QR code" />}
        {totp?.secret && <p>ম্যানুয়াল key: <code>{totp.secret}</code></p>}
      </div>}
      <label className="field"><span>৬ সংখ্যার TOTP কোড</span><input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} required /></label>
      <button type="submit" className="button button-primary" disabled={busy || code.length !== 6}>{busy ? 'যাচাই হচ্ছে…' : 'কোড যাচাই করুন'}</button>
    </form>}
    {error && <p className="message error" role="alert">{error}</p>}
    {message && <p className="message success" role="status">{message}</p>}
  </section>;
}

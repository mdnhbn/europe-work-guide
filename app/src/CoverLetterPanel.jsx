import { useMemo, useState } from 'react';

function buildDraft(profile, language, jobTitle, employer, country) {
  const name = profile?.full_name?.trim() || '[আপনার পুরো নাম / Your full name]';
  const skills = Array.isArray(profile?.skills) ? profile.skills.filter(Boolean) : [];
  const experience = Array.isArray(profile?.experience) ? profile.experience.filter(item => item?.title || item?.employer || item?.description) : [];
  const education = Array.isArray(profile?.education) ? profile.education.filter(item => item?.degree || item?.institution) : [];
  const role = jobTitle.trim() || '[Job title / পদের নাম]';
  const company = employer.trim() || '[Employer / প্রতিষ্ঠানের নাম]';
  if (language === 'bn') {
    return `বরাবর নিয়োগকারী ব্যবস্থাপক,

বিষয়: ${role} পদে আবেদনের জন্য

আমি ${name}। ${country} এ ${company}-এর ${role} পদের জন্য আবেদন করতে আগ্রহী। আমার প্রোফাইলে দেওয়া তথ্যের ভিত্তিতে এই সুযোগটি সম্পর্কে আরও আলোচনা করতে চাই।

প্রাসঙ্গিক দক্ষতা: ${skills.length ? skills.join(', ') : '[এই পদের সঙ্গে সম্পর্কিত দক্ষতা যোগ করুন]'}।
শিক্ষাগত যোগ্যতা: ${education.length ? education.map(x => [x.degree, x.institution, x.year].filter(Boolean).join(' — ')).join('; ') : '[আপনার প্রাসঙ্গিক শিক্ষা / সনদ যোগ করুন]'}।
কাজের অভিজ্ঞতা: ${experience.length ? experience.map(x => [x.title, x.employer, x.years ? x.years + ' বছর' : '', x.description].filter(Boolean).join(' — ')).join('; ') : '[প্রাসঙ্গিক অভিজ্ঞতা থাকলে যোগ করুন; না থাকলে এই লাইনটি সম্পাদনা করুন]'}।

আমার আবেদন বিবেচনা করার জন্য ধন্যবাদ। পদের প্রয়োজনীয়তা ও আমার যোগ্যতা নিয়ে আরও আলোচনার সুযোগ পেলে কৃতজ্ঞ থাকব।

বিনীত,
${name}
${profile?.contact_email || ''}
${profile?.phone || ''}`;
  }
  return `Dear Hiring Manager,

Re: Application for ${role}

I am writing to express my interest in the ${role} position at ${company} in ${country}. I would welcome the opportunity to discuss how my actual skills and background align with the role.

Relevant skills: ${skills.length ? skills.join(', ') : '[Add skills relevant to this role]'}.
Education: ${education.length ? education.map(x => [x.degree, x.institution, x.year].filter(Boolean).join(' — ')).join('; ') : '[Add relevant education or certificates]'}.
Experience: ${experience.length ? experience.map(x => [x.title, x.employer, x.years ? x.years + ' years' : '', x.description].filter(Boolean).join(' — ')).join('; ') : '[Add relevant experience, or edit/remove this line if not applicable]'}.

Thank you for considering my application. I would appreciate the opportunity to discuss the position and the value I could bring to your team.

Yours sincerely,
${name}
${profile?.contact_email || ''}
${profile?.phone || ''}`;
}
export default function CoverLetterPanel({ profile, countries }) {
  const [destination, setDestination] = useState('IT');
  const [language, setLanguage] = useState('en');
  const [jobTitle, setJobTitle] = useState('');
  const [employer, setEmployer] = useState('');
  const country = countries.find(c => c.code === destination)?.name || destination;
  const draft = useMemo(() => buildDraft(profile, language, jobTitle, employer, country), [profile, language, jobTitle, employer, country]);
  const [text, setText] = useState('');
  const [lastDraft, setLastDraft] = useState('');
  const regenerate = () => { setText(draft); setLastDraft(draft); };
  return <section className="panel cover-letter-panel">
    <div className="panel-heading no-print"><div><p className="eyebrow">আবেদন প্রস্তুতি</p><h2>কভার লেটার তৈরি করুন</h2></div><button type="button" className="button button-primary" onClick={() => window.print()}>প্রিন্ট / PDF হিসেবে সংরক্ষণ</button></div>
    <p className="muted no-print">আপনার প্রোফাইল থেকে একটি সম্পাদনাযোগ্য খসড়া তৈরি করুন। কোনো অভিজ্ঞতা বা যোগ্যতা বানিয়ে যোগ করা হয় না; বন্ধনীর নির্দেশনা আপনার তথ্য দিয়ে বদলান।</p>
    <div className="cover-controls no-print">
      <label className="field"><span>গন্তব্য দেশ</span><select value={destination} onChange={e => setDestination(e.target.value)}>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</select></label>
      <label className="field"><span>চিঠির ভাষা</span><select value={language} onChange={e => setLanguage(e.target.value)}><option value="en">English</option><option value="bn">বাংলা</option></select></label>
      <label className="field"><span>পদের নাম</span><input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="যেমন: Cook" /></label>
      <label className="field"><span>নিয়োগকারী প্রতিষ্ঠান</span><input value={employer} onChange={e => setEmployer(e.target.value)} placeholder="প্রতিষ্ঠানের নাম" /></label>
    </div>
    <div className="form-actions no-print"><button type="button" className="button button-light" onClick={regenerate}>প্রোফাইল থেকে খসড়া তৈরি / রিফ্রেশ</button><span className="muted">{lastDraft ? 'খসড়া তৈরি হয়েছে; নিচে সম্পাদনা করুন।' : 'প্রথমে খসড়া তৈরি করুন।'}</span></div>
    <label className="field no-print"><span>সম্পাদনাযোগ্য কভার লেটার</span><textarea rows={18} value={text} onChange={e => setText(e.target.value)} placeholder="খসড়া তৈরি করলে এখানে লেখা আসবে।" /></label>
    <article className="cover-letter-paper"><p>{country} · Cover Letter</p><pre>{text || 'খসড়া তৈরি করার পর আপনার কভার লেটার এখানে প্রিভিউ হবে।'}</pre></article>
  </section>;
}

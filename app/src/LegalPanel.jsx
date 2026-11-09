import { useState } from 'react';

const SECTIONS = [
  { id: 'privacy', title: 'গোপনীয়তা ও তথ্য ব্যবহার', body: [
    'আপনার দেওয়া প্রোফাইলের তথ্য চাকরি ও ভিসা-সংক্রান্ত প্রকাশিত তথ্যের সঙ্গে মিল দেখাতে ব্যবহার করা হয়। প্রোফাইলে শুধু প্রয়োজনীয় তথ্য দিন।',
    'এই অ্যাপ Supabase-ভিত্তিক অ্যাকাউন্ট ও ডেটা স্টোরেজ ব্যবহার করে। অ্যাকাউন্টের ইমেইল, যোগাযোগের তথ্য এবং আপনার দেওয়া শিক্ষা, অভিজ্ঞতা, দক্ষতা ও ভাষার তথ্য সেবা চালানোর জন্য প্রক্রিয়াকৃত হয়।',
    'এই সংস্করণে পাসপোর্টের ছবি বা জাতীয় পরিচয়পত্রের স্ক্যান আপলোড করবেন না। অন্য কারও ব্যক্তিগত তথ্য অনুমতি ছাড়া দেবেন না।',
    'নিজের প্রোফাইল তথ্য JSON হিসেবে ডাউনলোড করতে নিচের বোতাম ব্যবহার করুন। সম্পূর্ণ অ্যাকাউন্ট মুছে ফেলার অনুরোধের জন্য সাইট পরিচালকের প্রকাশিত সহায়তা-যোগাযোগ ব্যবহার করুন; এই ইন্টারফেসে এখনো স্বয়ংক্রিয় অ্যাকাউন্ট-মুছে ফেলার সুবিধা নেই।',
  ]},
  { id: 'accuracy', title: 'তথ্যের নির্ভুলতা ও ভিসা-সংক্রান্ত সতর্কতা', body: [
    'এই সাইট আইনি পরামর্শ, ভিসা অনুমোদন বা চাকরির নিশ্চয়তা দেয় না। নিয়ম, ফি, কোটার অবস্থা ও সময়সীমা পরিবর্তিত হতে পারে।',
    'সিদ্ধান্ত নেওয়ার আগে সংশ্লিষ্ট দেশের সরকারি ইমিগ্রেশন কর্তৃপক্ষ, দূতাবাস বা মূল চাকরিদাতার সাইটে তথ্য যাচাই করুন। প্রতিটি প্রকাশিত রুটে সরকারি উৎসের লিংক ও যাচাইয়ের তারিখ থাকা উচিত।',
    'কোনো ব্যক্তি বা এজেন্ট “নিশ্চিত ভিসা” দেওয়ার প্রতিশ্রুতি দিলে সতর্ক থাকুন। সরকারি কর্তৃপক্ষের বাইরে কাউকে টাকা দেওয়ার আগে স্বাধীনভাবে যাচাই করুন।',
    'কোনো রুটে যাচাইকৃত তথ্য না থাকলে এই অ্যাপ অনুমান করে যোগ্যতা বা প্রবেশের অবস্থা দেখায় না।',
  ]},
  { id: 'terms', title: 'ব্যবহারের শর্ত', body: [
    'সাইটের তথ্য সাধারণ নির্দেশনা হিসেবে দেওয়া হয়। আবেদন জমা দেওয়া, নথি যাচাই, ফি প্রদান এবং চূড়ান্ত সিদ্ধান্তের দায়িত্ব ব্যবহারকারীর।',
    'চাকরির বিজ্ঞপ্তি থাকলে মূল বিজ্ঞপ্তির লিংক থেকে নিয়োগদাতা ও আবেদনের শর্ত যাচাই করুন। এই প্ল্যাটফর্ম ব্যবহারকারীর হয়ে চাকরির আবেদন জমা দেয় না।',
    'এই অ্যাপের সিভি ও কভার লেটার খসড়া সম্পাদনা করে সঠিক তথ্য নিশ্চিত করুন। কোনো তথ্য, দক্ষতা বা অভিজ্ঞতা বানিয়ে যোগ করবেন না।',
    'এই নীতিগুলো প্রাথমিক প্রকাশ-খসড়া। সাইট পরিচালকের আইনগত পরিচয়, যোগাযোগের তথ্য, তথ্য সংরক্ষণের সময়সীমা এবং প্রযোজ্য আইনি শর্ত যোগ করে প্রকাশের আগে নীতিগুলো পর্যালোচনা করা প্রয়োজন।',
  ]},
];
export default function LegalPanel({ profile, user }) {
  const [message, setMessage] = useState('');
  const exportProfile = () => {
    const payload = { exported_at: new Date().toISOString(), account: { email: user?.email || '', id: user?.id || '' }, profile };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'europe-work-guide-profile.json';
    document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    setMessage('আপনার প্রোফাইল JSON ফাইল ডাউনলোড শুরু হয়েছে। ফাইলটি ব্যক্তিগতভাবে সংরক্ষণ করুন।');
  };
  return <section className="panel legal-panel"><div className="panel-heading"><div><p className="eyebrow">স্বচ্ছতা ও ব্যবহারকারীর নিরাপত্তা</p><h2>গোপনীয়তা, শর্ত ও সতর্কতা</h2></div><span className="privacy-pill">আপনার তথ্য</span></div>
    <p className="muted">নিচের নীতিগুলো সাইটের বর্তমান কার্যকারিতা ব্যাখ্যা করে। প্রকাশের আগে সাইট পরিচালকের যোগাযোগ ও আইনগত তথ্য দিয়ে চূড়ান্ত পর্যালোচনা প্রয়োজন।</p>
    <div className="form-actions"><button type="button" className="button button-primary" onClick={exportProfile}>আমার প্রোফাইল JSON ডাউনলোড</button>{message && <p className="message success" role="status">{message}</p>}</div>
    <div className="legal-sections">{SECTIONS.map(section => <details key={section.id} open={section.id === 'privacy'}><summary>{section.title}</summary><div>{section.body.map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div></details>)}</div>
  </section>;
}

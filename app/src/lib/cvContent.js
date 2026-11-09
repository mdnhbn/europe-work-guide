function asList(items) {
  return Array.isArray(items) ? items.filter(Boolean) : [];
}

function joinDetails(parts) {
  return parts.filter(Boolean).join(' · ');
}

export function buildCvContent(profile, countryName, template) {
  const compact = template === 'short';
  const occupation = joinDetails(asList(profile.desired_occupations));
  const skills = joinDetails(asList(profile.skills).slice(0, compact ? 8 : undefined));
  const experience = asList(profile.experience).slice(0, compact ? 2 : undefined);
  const education = asList(profile.education).slice(0, compact ? 2 : undefined);
  const languages = asList(profile.languages).slice(0, compact ? 4 : undefined);

  const sections = [
    {
      title: 'ব্যক্তিগত তথ্য',
      entries: [{ text: `জন্মতারিখ: ${profile.birth_date || '—'} · জাতীয়তা: ${profile.nationality || 'Bangladesh'}` }],
    },
    { title: 'কাঙ্ক্ষিত পেশা', entries: occupation ? [{ text: occupation }] : [] },
    {
      title: 'কাজের অভিজ্ঞতা',
      entries: experience.map((item) => ({
        heading: item.title || 'পদ',
        details: joinDetails([item.employer, item.country, item.years && `${item.years} বছর`]),
        text: compact ? '' : item.description,
      })),
    },
    {
      title: 'শিক্ষা',
      entries: education.map((item) => ({
        heading: item.degree || 'ডিগ্রি / সনদ',
        details: joinDetails([item.institution, item.year]),
      })),
    },
    { title: 'দক্ষতা', entries: skills ? [{ text: skills }] : [] },
    {
      title: 'ভাষা',
      entries: languages.map((item) => ({
        text: `${item.name || 'ভাষা'}: ${item.level || 'স্তর উল্লেখ নেই'}`,
      })),
    },
  ];

  return {
    name: profile.full_name || 'আপনার নাম',
    contact: joinDetails([profile.contact_email, profile.phone, profile.address]) || 'ইমেইল · ফোন · ঠিকানা যোগ করুন',
    subtitle: `${countryName} · জীবনবৃত্তান্ত`,
    compact,
    photoPlaceholder: template === 'tabular',
    sections: sections.filter(({ entries }) => entries.length > 0),
  };
}

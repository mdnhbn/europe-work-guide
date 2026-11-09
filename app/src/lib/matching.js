export function isApplicableToProfile(profile, record) {
  const normalize = (value) => typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
  const wantedNationality = normalize(profile?.nationality);
  const wantedResidence = normalize(profile?.current_residence_country);
  const recordNationality = normalize(record?.nationality);
  const recordResidence = normalize(record?.residence_country);
  const nationalityMatches = !recordNationality || recordNationality === 'any' || recordNationality === wantedNationality;
  const residenceMatches = !recordResidence || recordResidence === 'any' || recordResidence === wantedResidence;
  return nationalityMatches && residenceMatches;
}

const LANGUAGE_ORDER = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6, NATIVE: 7 };

function ageOnDate(birthDate, today = new Date()) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > today) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function experienceTotal(profile) {
  const entries = profile?.experience;
  if (!Array.isArray(entries)) return null;
  if (entries.length === 0) return 0;
  const years = entries.map((entry) => numberValue(entry?.years));
  if (years.some((year) => year === null)) return null;
  return years.reduce((sum, year) => sum + year, 0);
}

const cleanText = (value) => typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';

function languageCheck(profile, minimum) {
  const requiredName = cleanText(minimum?.name);
  const requiredLevel = cleanText(minimum?.level).toUpperCase();
  if (!requiredName || !requiredLevel || !LANGUAGE_ORDER[requiredLevel]) return null;
  const entries = Array.isArray(profile?.languages) ? profile.languages : [];
  const language = entries.find((entry) => cleanText(entry?.name) === requiredName);
  const userLevel = cleanText(language?.level).toUpperCase();
  if (!userLevel || !LANGUAGE_ORDER[userLevel]) {
    return { label: `${minimum.name} ভাষা (${minimum.level})`, status: 'unknown', detail: 'প্রোফাইলে এই ভাষার স্তর দেওয়া নেই।' };
  }
  return {
    label: `${minimum.name} ভাষা (${minimum.level})`,
    status: LANGUAGE_ORDER[userLevel] >= LANGUAGE_ORDER[requiredLevel] ? 'pass' : 'fail',
    detail: `আপনার দেওয়া স্তর: ${language.level}`,
  };
}

export function matchRoute(profile, route) {
  const requirements = route?.requirements && typeof route.requirements === 'object' ? route.requirements : {};
  const checks = [];
  const age = ageOnDate(profile?.birth_date);

  if (numberValue(requirements.min_age) !== null || numberValue(requirements.max_age) !== null) {
    let status = 'unknown';
    let detail = 'জন্মতারিখ না থাকায় বয়স হিসাব করা যায়নি।';
    if (age !== null) {
      const minimum = numberValue(requirements.min_age);
      const maximum = numberValue(requirements.max_age);
      status = (minimum === null || age >= minimum) && (maximum === null || age <= maximum) ? 'pass' : 'fail';
      detail = `আপনার বয়স ${age} বছর।`;
    }
    checks.push({ label: 'বয়স', status, detail });
  }

  const minimumExperience = numberValue(requirements.min_experience_years);
  if (minimumExperience !== null) {
    const total = experienceTotal(profile);
    checks.push(total === null
      ? { label: 'কাজের অভিজ্ঞতা', status: 'unknown', detail: 'প্রতিটি অভিজ্ঞতার বছর পূরণ করুন।' }
      : { label: 'কাজের অভিজ্ঞতা', status: total >= minimumExperience ? 'pass' : 'fail', detail: `প্রোফাইলে মোট ${total} বছর দেওয়া আছে।` });
  }

  const language = languageCheck(profile, requirements.min_language);
  if (language) checks.push(language);

  if (Array.isArray(requirements.occupations) && requirements.occupations.length > 0) {
    const occupations = Array.isArray(profile?.desired_occupations) ? profile.desired_occupations : [];
    if (occupations.length === 0) {
      checks.push({ label: 'পেশা', status: 'unknown', detail: 'প্রোফাইলে পছন্দের পেশা দেওয়া নেই।' });
    } else {
      const wanted = new Set(occupations.map(cleanText));
      const matches = requirements.occupations.some((occupation) => wanted.has(cleanText(occupation)));
      checks.push({ label: 'পেশা', status: matches ? 'pass' : 'fail', detail: matches ? 'আপনার পছন্দের পেশার সঙ্গে মিল আছে।' : 'প্রোফাইলের পছন্দের পেশার সঙ্গে মেলেনি।' });
    }
  }
  return checks;
}

export function scoreJobMatch(profile, job) {
  const normalize = (value) => typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
  const title = normalize(job?.title);
  const occupation = normalize(job?.occupation);
  const text = [job?.title, job?.occupation, job?.description, job?.employer, job?.location].filter(Boolean).join(' ').toLocaleLowerCase();
  const desired = Array.isArray(profile?.desired_occupations) ? profile.desired_occupations.map(normalize).filter(Boolean) : [];
  const skills = Array.isArray(profile?.skills) ? [...new Set(profile.skills.map(normalize).filter(Boolean))] : [];
  const targetCountries = Array.isArray(profile?.target_countries) ? profile.target_countries.map(normalize) : [];
  const experience = Array.isArray(profile?.experience) ? profile.experience : [];
  let score = 0;
  const reasons = [];

  const occupationMatch = desired.some((item) => item === occupation || item === title);
  if (occupationMatch) { score += 40; reasons.push('পছন্দের পেশার সঙ্গে সরাসরি মিল'); }
  else if (desired.length) reasons.push('পেশার নাম হুবহু মেলেনি');

  const matchedSkills = skills.filter((skill) => text.includes(skill));
  if (skills.length) {
    const skillPoints = Math.round(30 * matchedSkills.length / Math.min(skills.length, 3));
    score += Math.min(30, skillPoints);
    reasons.push(`বিজ্ঞাপনের লেখায় ${matchedSkills.length}/${skills.length}টি প্রোফাইল দক্ষতার শব্দ পাওয়া গেছে`);
  }

  if (targetCountries.includes(normalize(job?.country_code))) { score += 20; reasons.push('আপনার পছন্দের গন্তব্য দেশ'); }
  else if (targetCountries.length) reasons.push('এই দেশটি আপনার পছন্দের দেশের তালিকায় নেই');

  const experienceText = experience.map((item) => [item?.title, item?.description].filter(Boolean).join(' ')).join(' ').toLocaleLowerCase();
  const roleWords = [occupation, title].filter(Boolean).flatMap((value) => value.split(/[^\p{L}\p{N}]+/u)).filter((word) => word.length >= 3);
  const experienceMatch = roleWords.some((word) => experienceText.includes(word));
  if (experienceMatch) { score += 10; reasons.push('কাজের অভিজ্ঞতার লেখার সঙ্গে মিল'); }

  return { score: Math.min(100, score), reasons, matchedSkills, totalSkills: skills.length, occupationMatch, targetCountryMatch: targetCountries.includes(normalize(job?.country_code)) };
}

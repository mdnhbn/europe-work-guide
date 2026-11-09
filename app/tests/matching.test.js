import test from 'node:test';
import assert from 'node:assert/strict';
import { isApplicableToProfile, matchRoute, scoreJobMatch } from '../src/lib/matching.js';

test('returns no checks when a route has no declared requirements', () => {
  assert.deepEqual(matchRoute({}, { requirements: {} }), []);
});

test('does not guess age eligibility when the profile has no birth date', () => {
  const checks = matchRoute({}, { requirements: { min_age: 18 } });
  assert.equal(checks.length, 1);
  assert.equal(checks[0].status, 'unknown');
});

test('marks missing language level as unknown rather than pass', () => {
  const checks = matchRoute({ languages: [] }, { requirements: { min_language: { name: 'German', level: 'B1' } } });
  assert.equal(checks[0].status, 'unknown');
});

test('compares CEFR language levels in the correct order', () => {
  const route = { requirements: { min_language: { name: 'German', level: 'B1' } } };
  assert.equal(matchRoute({ languages: [{ name: 'German', level: 'A2' }] }, route)[0].status, 'fail');
  assert.equal(matchRoute({ languages: [{ name: 'German', level: 'B2' }] }, route)[0].status, 'pass');
});

test('does not pass experience checks when years are missing', () => {
  const checks = matchRoute({ experience: [{ title: 'Cook' }] }, { requirements: { min_experience_years: 2 } });
  assert.equal(checks[0].status, 'unknown');
});

test('matches occupation without claiming visa approval', () => {
  const checks = matchRoute({ desired_occupations: ['Cook'] }, { requirements: { occupations: ['Cook', 'Chef'] } });
  assert.equal(checks[0].status, 'pass');
  assert.match(checks[0].detail, /পেশা/);
});

test('matches generic routes and exact nationality/residence combinations only', () => {
  const profile = { nationality: 'Bangladesh', current_residence_country: 'Saudi Arabia' };
  assert.equal(isApplicableToProfile(profile, { nationality: 'ANY', residence_country: 'ANY' }), true);
  assert.equal(isApplicableToProfile(profile, { nationality: 'Bangladesh', residence_country: 'Saudi Arabia' }), true);
  assert.equal(isApplicableToProfile(profile, { nationality: 'Bangladesh', residence_country: 'Switzerland' }), false);
  assert.equal(isApplicableToProfile(profile, { nationality: 'India', residence_country: 'Saudi Arabia' }), false);
});

test('treats missing scope fields as generic for backward compatibility', () => {
  assert.equal(isApplicableToProfile({ nationality: 'Bangladesh', current_residence_country: 'Bangladesh' }, {}), true);
});

test('job matching score explains occupation, skills, and target-country matches', () => {
  const profile = {
    desired_occupations: ['Cook'],
    skills: ['Cooking', 'Food safety'],
    target_countries: ['IT'],
    experience: [{ title: 'Cook', description: 'Restaurant kitchen' }],
  };
  const result = scoreJobMatch(profile, { title: 'Cook', occupation: 'Cook', country_code: 'IT', description: 'Cooking meals and food safety standards' });
  assert.equal(result.score, 100);
  assert.equal(result.occupationMatch, true);
  assert.equal(result.targetCountryMatch, true);
  assert.deepEqual(result.matchedSkills, ['cooking', 'food safety']);
});

test('job matching does not claim a perfect fit when profile data is absent', () => {
  const result = scoreJobMatch({}, { title: 'Electrician', occupation: 'Electrician', country_code: 'DE', description: 'Install and repair wiring' });
  assert.equal(result.score, 0);
  assert.deepEqual(result.reasons, []);
});

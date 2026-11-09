import test from 'node:test';
import assert from 'node:assert/strict';
import { matchRoute } from '../src/lib/matching.js';

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

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCvContent } from '../src/lib/cvContent.js';

const profile = {
  full_name: 'নুসরাত জাহান',
  contact_email: 'test@example.invalid',
  address: 'চট্টগ্রাম',
  experience: Array.from({ length: 3 }, (_, index) => ({
    title: `পদ ${index + 1}`,
    employer: 'Sample Garments',
    years: 2,
    description: 'কর্মক্ষেত্রে গুণগত মান যাচাই করেছি।',
  })),
};

test('keeps Bengali text and personal contact fields in the CV model', () => {
  const cv = buildCvContent(profile, 'জার্মানি', 'tabular');
  assert.equal(cv.name, 'নুসরাত জাহান');
  assert.equal(cv.subtitle, 'জার্মানি · জীবনবৃত্তান্ত');
  assert.equal(cv.contact, 'test@example.invalid · চট্টগ্রাম');
  assert.equal(cv.photoPlaceholder, true);
  const experience = cv.sections.find(({ title }) => title === 'কাজের অভিজ্ঞতা');
  assert.equal(experience.entries.length, 3);
  assert.equal(experience.entries[0].details, 'Sample Garments · 2 বছর');
  assert.equal(experience.entries[0].text, profile.experience[0].description);
});

test('compact CV limits experience and omits long descriptions', () => {
  const cv = buildCvContent(profile, 'ইতালি', 'short');
  const experience = cv.sections.find(({ title }) => title === 'কাজের অভিজ্ঞতা');
  assert.equal(cv.photoPlaceholder, false);
  assert.equal(cv.compact, true);
  assert.equal(experience.entries.length, 2);
  assert.equal(experience.entries[0].text, '');
});

test('older profiles with null or missing list fields still produce a CV', () => {
  const cv = buildCvContent({ experience: null, languages: [null], skills: '' }, 'ইতালি', 'europass');
  assert.equal(cv.name, 'আপনার নাম');
  assert.deepEqual(cv.sections.map(({ title }) => title), ['ব্যক্তিগত তথ্য']);
});

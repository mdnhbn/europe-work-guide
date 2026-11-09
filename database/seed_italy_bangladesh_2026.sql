-- Curated from Italian government and European Commission sources, reviewed 2026-11-03.
-- Apply to the existing production schema; no tables or policies are created here.

INSERT INTO public.country_access (
  country_code, nationality, residence_country, access_status, quota_included, restrictions,
  apply_where, documents_note, official_url, review_status, last_verified
) VALUES (
  'IT',
  'Bangladesh',
  'ANY',
  'limited',
  true,
  'বাংলাদেশি নাগরিকরা ইতালির ২০২৬–২০২৮ Flussi quota program-এর তালিকাভুক্ত। ২০২৬ সালে মৌসুমি কৃষি ও পর্যটন কাজের তালিকায় বাংলাদেশ স্পষ্টভাবে আছে। প্রতিটি ক্যাটাগরিতে অবশিষ্ট quota থাকতে হবে। বাংলাদেশি নাগরিকদের Nulla Osta ইস্যুর আগে Questura-এর অনুকূল মতামত ও INL যাচাই প্রয়োজন; কৃষি খাতে AGEA-ও যুক্ত থাকে। চাকরি বা ভিসা নিশ্চিত নয়।',
  'ইতালির নিয়োগকর্তা Portale Servizi ALI-তে অনলাইনে স্থানীয় Prefettura/Sportello Unico per l’Immigrazione-এ Nulla Osta আবেদন করেন। অনুমোদনের পরে কর্মী বসবাসের এলাকার Italian embassy/consulate-এ work visa আবেদন করেন।',
  'নিয়োগকর্তার Nulla Osta এবং employment contract দরকার। কর্মীর valid passport ও সংশ্লিষ্ট consular checklist-এর কাগজপত্র লাগবে। নাগরিকত্ব ও বসবাসের দেশ বেছে Visa for Italy-তে সঠিক checklist যাচাই করুন।',
  'https://prefettura.interno.gov.it/it/prefetture/chieti/decreto-flussi-2026-2028',
  'verified',
  '2026-11-03'
)
ON CONFLICT (country_code, nationality, residence_country) DO UPDATE SET
  access_status = EXCLUDED.access_status,
  quota_included = EXCLUDED.quota_included,
  restrictions = EXCLUDED.restrictions,
  apply_where = EXCLUDED.apply_where,
  documents_note = EXCLUDED.documents_note,
  official_url = EXCLUDED.official_url,
  review_status = EXCLUDED.review_status,
  last_verified = EXCLUDED.last_verified,
  updated_at = now();

INSERT INTO public.visa_routes (
  id, country_code, route_type, title, summary, requirements, documents,
  fees, steps, official_url, review_status, last_verified
) VALUES
(
  '0f60a65a-7d94-4c64-a42c-2033f1574eb1',
  'IT',
  'মৌসুমি কর্মী',
  'মৌসুমি কৃষি ও পর্যটন কাজ (২০২৬ Flussi quota)',
  'বাংলাদেশি নাগরিকরা ২০২৬ সালের মৌসুমি কৃষি ও পর্যটন কর্মী-প্রবেশের তালিকায় অন্তর্ভুক্ত। ইতালির নিয়োগকর্তাকে আগে Nulla Osta নিতে হয়। আবেদন ও ভিসা অবশিষ্ট কোটা এবং সংশ্লিষ্ট কর্তৃপক্ষের অনুমোদনের উপর নির্ভর করে; চাকরি বা ভিসা নিশ্চিত নয়।',
  '{}'::jsonb,
  '["নিয়োগকর্তার job offer/contract এবং অনুমোদিত Nulla Osta", "বৈধ passport ও সংশ্লিষ্ট Italian embassy/consulate-এর বর্তমান visa checklist"]'::jsonb,
  '[]'::jsonb,
  '["ইতালির নিয়োগকর্তা Portale Servizi ALI দিয়ে স্থানীয় Sportello Unico per l’Immigrazione-এ Nulla Osta আবেদন করেন।", "নিয়োগকর্তা ও কর্তৃপক্ষ অবশিষ্ট quota এবং Bangladesh-এর জন্য প্রয়োজনীয় অতিরিক্ত যাচাই নিশ্চিত করেন।", "Nulla Osta হলে কর্মী বসবাসের এলাকার Italian embassy/consulate-এ work visa আবেদন করেন।", "ইতালিতে পৌঁছানোর আট দিনের মধ্যে residence permit-এর আবেদন করুন।", "আবেদনের আগে বর্তমান quota, সময়সীমা ও নথি সরকারি পোর্টালে পুনরায় যাচাই করুন।"]'::jsonb,
  'https://www.integrazionemigranti.gov.it/it-it/Ricerca-news/Dettaglio-news/id/4549',
  'verified',
  '2026-11-03'
),
(
  '9bcbd493-c1bf-46ce-b490-78ea0a229ff2',
  'IT',
  'অ-মৌসুমি কর্মী',
  'অ-মৌসুমি চাকরি—নিয়োগকর্তার মাধ্যমে (Flussi)',
  'বাংলাদেশি নাগরিকরা ইতালির ২০২৬–২০২৮ quota-based non-seasonal work-এর eligible-country তালিকায় আছে। নিয়োগকর্তার Nulla Osta, অবশিষ্ট quota, এবং বাংলাদেশি আবেদনকারীদের জন্য অতিরিক্ত Questura ও INL যাচাই প্রয়োজন। ২০২৬ সালের আবেদন ৩১ ডিসেম্বর পর্যন্ত কেবল অবশিষ্ট quota থাকলে জমা দেওয়া যায়।',
  '{}'::jsonb,
  '["ইতালির নিয়োগকর্তার job offer/contract এবং অনুমোদিত Nulla Osta", "বৈধ passport ও সংশ্লিষ্ট Italian embassy/consulate-এর বর্তমান visa checklist"]'::jsonb,
  '[]'::jsonb,
  '["ইতালির নিয়োগকর্তা Portale Servizi ALI দিয়ে কর্মস্থলের প্রদেশের Sportello Unico per l’Immigrazione-এ Nulla Osta আবেদন করেন।", "বাংলাদেশি আবেদনকারীর ক্ষেত্রে Questura-এর অনুকূল মতামত এবং INL-এর পূর্ব যাচাই প্রযোজ্য; কৃষি খাতে AGEA-ও যুক্ত থাকে।", "অনুমোদিত Nulla Osta পাওয়ার পরে কর্মী বসবাসের এলাকার Italian embassy/consulate-এ national work visa আবেদন করেন।", "ইতালিতে পৌঁছানোর আট দিনের মধ্যে residence permit-এর আবেদন করুন।", "প্রতি আবেদনেই অবশিষ্ট quota, employer eligibility, deadline ও consular checklist যাচাই করুন।"]'::jsonb,
  'https://prefettura.interno.gov.it/it/prefetture/chieti/decreto-flussi-2026-2028',
  'verified',
  '2026-11-03'
)
ON CONFLICT (id) DO UPDATE SET
  country_code = EXCLUDED.country_code,
  route_type = EXCLUDED.route_type,
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  requirements = EXCLUDED.requirements,
  documents = EXCLUDED.documents,
  fees = EXCLUDED.fees,
  steps = EXCLUDED.steps,
  official_url = EXCLUDED.official_url,
  review_status = EXCLUDED.review_status,
  last_verified = EXCLUDED.last_verified,
  updated_at = now();

INSERT INTO public.source_pages (country_code, url, ai_extract, changed)
VALUES
(
  'IT',
  'https://integrazionemigranti.gov.it/it-it/Dettaglio-approfondimento/id/64/Flussi-2026',
  '{"extraction_status":"manual_verified","source_type":"official_quota_schedule","reviewed_at":"2026-11-03","data":{"facts":["2026 applications may be submitted through 31 December subject to remaining quotas.","The 2026 decree covers seasonal and non-seasonal work categories."]},"problems":[]}'::jsonb,
  false
),
(
  'IT',
  'https://prefettura.interno.gov.it/it/prefetture/chieti/decreto-flussi-2026-2028',
  '{"extraction_status":"manual_verified","source_type":"official_country_rules","reviewed_at":"2026-11-03","data":{"facts":["Bangladesh appears on the eligible-country list for quota-based work routes.","Bangladesh applications require favorable Questura input and prior INL verification; AGEA is involved for agriculture."]},"problems":[]}'::jsonb,
  false
),
(
  'IT',
  'https://www.esteri.it/en/ministero/sportello_info/domandefrequenti/sezione_visti_entrare_in_italia/',
  '{"extraction_status":"manual_verified","source_type":"official_visa_procedure","reviewed_at":"2026-11-03","data":{"facts":["An employer must obtain work clearance before the worker applies for an entry visa.","Visa applications are submitted to the Italian mission responsible for the applicant’s registered residence."]},"problems":[]}'::jsonb,
  false
),
(
  'IT',
  'https://home-affairs.ec.europa.eu/policies/migration-and-asylum/eu-immigration-portal/employed-worker-italy_en',
  '{"extraction_status":"manual_verified","source_type":"european_commission_immigration_portal","reviewed_at":"2026-11-03","data":{"facts":["Work authorization and visa are required before entry for employed work.","A residence permit application is required within eight days of arrival in Italy.","Annual quota restrictions apply to quota-based work routes."]},"problems":[]}'::jsonb,
  false
),
(
  'IT',
  'https://www.integrazionemigranti.gov.it/it-it/Ricerca-news/Dettaglio-news/id/4549',
  '{"extraction_status":"manual_verified","source_type":"official_seasonal_worker_list","reviewed_at":"2026-11-03","data":{"facts":["Bangladesh is listed for 2026 seasonal agricultural work quotas.","The 2026 seasonal route is subject to the published quota and application procedure."]},"problems":[]}'::jsonb,
  false
)
ON CONFLICT (url) DO UPDATE SET
  country_code = EXCLUDED.country_code,
  ai_extract = EXCLUDED.ai_extract,
  changed = false,
  fetched_at = now();

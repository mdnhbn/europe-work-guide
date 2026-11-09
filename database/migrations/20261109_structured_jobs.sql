-- Additive structured fields for manually reviewed job listings and future official connectors.
-- Apply this migration before storing any non-empty structured job fields.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS salary_min numeric(12, 2),
  ADD COLUMN IF NOT EXISTS salary_max numeric(12, 2),
  ADD COLUMN IF NOT EXISTS salary_currency text,
  ADD COLUMN IF NOT EXISTS salary_period text,
  ADD COLUMN IF NOT EXISTS application_deadline date,
  ADD COLUMN IF NOT EXISTS isco08_code text,
  ADD COLUMN IF NOT EXISTS language_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualification_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS duplicate_fingerprint text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_salary_min_nonnegative') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_salary_min_nonnegative CHECK (salary_min IS NULL OR salary_min >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_salary_max_nonnegative') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_salary_max_nonnegative CHECK (salary_max IS NULL OR salary_max >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_salary_range_valid') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_salary_range_valid CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_salary_currency_format') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_salary_currency_format CHECK (salary_currency IS NULL OR salary_currency ~ '^[A-Z]{3}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_salary_period_valid') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_salary_period_valid CHECK (salary_period IS NULL OR salary_period IN ('hourly', 'weekly', 'monthly', 'annual'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_salary_fields_consistent') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_salary_fields_consistent CHECK (
      (salary_min IS NULL AND salary_max IS NULL AND salary_currency IS NULL AND salary_period IS NULL) OR
      ((salary_min IS NOT NULL OR salary_max IS NOT NULL) AND salary_currency IS NOT NULL AND salary_period IS NOT NULL)
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_isco08_format') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_isco08_format CHECK (isco08_code IS NULL OR isco08_code ~ '^[0-9]{4}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_language_requirements_array') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_language_requirements_array CHECK (jsonb_typeof(language_requirements) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_qualification_requirements_array') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_qualification_requirements_array CHECK (jsonb_typeof(qualification_requirements) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.jobs'::regclass AND conname = 'jobs_duplicate_fingerprint_format') THEN
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_duplicate_fingerprint_format CHECK (duplicate_fingerprint IS NULL OR duplicate_fingerprint ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS jobs_duplicate_fingerprint_unique_idx
  ON public.jobs (duplicate_fingerprint) WHERE duplicate_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_expiry_review_idx
  ON public.jobs (application_deadline, expires_at) WHERE active = true AND review_status = 'verified';
CREATE INDEX IF NOT EXISTS jobs_isco08_idx
  ON public.jobs (isco08_code) WHERE isco08_code IS NOT NULL;

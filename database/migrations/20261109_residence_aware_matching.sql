-- Add current-residence-aware visa matching while keeping existing rows explicitly generic.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS current_residence_country text NOT NULL DEFAULT 'Bangladesh',
  ADD COLUMN IF NOT EXISTS target_countries text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE public.country_access
  ADD COLUMN IF NOT EXISTS residence_country text NOT NULL DEFAULT 'ANY';

ALTER TABLE public.visa_routes
  ADD COLUMN IF NOT EXISTS nationality text NOT NULL DEFAULT 'ANY',
  ADD COLUMN IF NOT EXISTS residence_country text NOT NULL DEFAULT 'ANY';

DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.country_access'::regclass
      AND contype = 'u'
      AND regexp_replace(pg_get_constraintdef(oid), '\s+', '', 'g') = 'UNIQUE(country_code,nationality)'
  LOOP
    EXECUTE format('ALTER TABLE public.country_access DROP CONSTRAINT %I', item.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS country_access_destination_nationality_residence_key
  ON public.country_access (country_code, nationality, residence_country);

CREATE INDEX IF NOT EXISTS visa_routes_residence_match_idx
  ON public.visa_routes (country_code, nationality, residence_country, review_status);

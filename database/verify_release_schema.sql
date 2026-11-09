-- Read-only checks for account deletion and the residence and structured-job migrations.
-- Run verify_admin_audit.sql separately to inspect the audit grants and triggers.
WITH required_columns (feature, table_name, column_name) AS (
  VALUES
    ('residence', 'profiles', 'current_residence_country'),
    ('residence', 'profiles', 'target_countries'),
    ('residence', 'country_access', 'residence_country'),
    ('residence', 'visa_routes', 'nationality'),
    ('residence', 'visa_routes', 'residence_country'),
    ('jobs', 'jobs', 'salary_min'),
    ('jobs', 'jobs', 'salary_max'),
    ('jobs', 'jobs', 'salary_currency'),
    ('jobs', 'jobs', 'salary_period'),
    ('jobs', 'jobs', 'application_deadline'),
    ('jobs', 'jobs', 'isco08_code'),
    ('jobs', 'jobs', 'language_requirements'),
    ('jobs', 'jobs', 'qualification_requirements'),
    ('jobs', 'jobs', 'expires_at'),
    ('jobs', 'jobs', 'last_seen_at'),
    ('jobs', 'jobs', 'duplicate_fingerprint')
), missing AS (
  SELECT expected.*
  FROM required_columns AS expected
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
    AND actual.table_name = expected.table_name
    AND actual.column_name = expected.column_name
  WHERE actual.column_name IS NULL
)
SELECT
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.profiles')
      AND confrelid = to_regclass('auth.users')
      AND conname = 'profiles_user_id_fkey'
      AND confdeltype = 'c'
      AND convalidated
  ) AS profile_deletes_with_auth_user,
  NOT EXISTS (SELECT 1 FROM missing WHERE feature = 'residence') AS residence_columns_present,
  EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = to_regclass('public.country_access_destination_nationality_residence_key')
      AND indisunique AND indisvalid
  ) AS residence_unique_index_valid,
  NOT EXISTS (SELECT 1 FROM missing WHERE feature = 'jobs') AS structured_job_columns_present,
  EXISTS (
    SELECT 1 FROM pg_index
    WHERE indexrelid = to_regclass('public.jobs_duplicate_fingerprint_unique_idx')
      AND indisunique AND indisvalid
  ) AS job_fingerprint_index_valid;

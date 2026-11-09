-- Append-only audit events for privileged admin and backup operations.
-- Apply this migration in the Supabase SQL editor before relying on the audit UI/API.
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_user_id uuid,
  admin_email text,
  action text NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  entity text NOT NULL CHECK (length(entity) BETWEEN 1 AND 160),
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_log FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.admin_audit_log TO service_role;
REVOKE ALL ON SEQUENCE public.admin_audit_log_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.admin_audit_log_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_admin_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_log_no_update ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_no_update
BEFORE UPDATE OR DELETE ON public.admin_audit_log
FOR EACH ROW EXECUTE FUNCTION public.prevent_admin_audit_log_mutation();

DROP TRIGGER IF EXISTS admin_audit_log_no_truncate ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_no_truncate
BEFORE TRUNCATE ON public.admin_audit_log
FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_admin_audit_log_mutation();

-- Read-only checks for the admin audit migration. This script makes no changes.
WITH target AS (
  SELECT to_regclass('public.admin_audit_log') AS relation_oid
)
SELECT
  relation_oid IS NOT NULL AS table_exists,
  COALESCE((SELECT relrowsecurity FROM pg_class WHERE oid = target.relation_oid), false) AS row_level_security_enabled,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = target.relation_oid
      AND tgname = 'admin_audit_log_no_update'
      AND NOT tgisinternal
      AND tgenabled <> 'D'
  ) AS append_only_trigger_enabled,
  EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'admin_audit_log'
      AND grantee = 'service_role'
      AND privilege_type = 'SELECT'
  ) AS service_role_can_read,
  EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'admin_audit_log'
      AND grantee = 'service_role'
      AND privilege_type = 'INSERT'
  ) AS service_role_can_insert,
  NOT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name = 'admin_audit_log'
      AND grantee IN ('PUBLIC', 'anon', 'authenticated')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ) AS browser_roles_cannot_write
FROM target;

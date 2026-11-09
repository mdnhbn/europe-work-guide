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
      AND tgenabled IN ('O', 'A')
  ) AS append_only_trigger_enabled,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = target.relation_oid
      AND tgname = 'admin_audit_log_no_truncate'
      AND NOT tgisinternal
      AND tgenabled IN ('O', 'A')
  ) AS truncate_trigger_enabled,
  COALESCE(has_table_privilege('service_role', relation_oid::oid, 'SELECT'), false) AS service_role_can_read,
  COALESCE(has_table_privilege('service_role', relation_oid::oid, 'INSERT'), false) AS service_role_can_insert,
  COALESCE(NOT has_table_privilege('service_role', relation_oid::oid, 'UPDATE,DELETE,TRUNCATE'), false)
    AS service_role_cannot_change_existing_events,
  COALESCE(
    NOT has_table_privilege('anon', relation_oid::oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
      AND NOT has_table_privilege('authenticated', relation_oid::oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),
    false
  ) AS browser_roles_cannot_access
FROM target;

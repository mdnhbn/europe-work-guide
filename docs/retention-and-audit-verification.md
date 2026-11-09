# Account deletion, retention, and audit verification

## Account deletion

`POST /api/account-delete` requires the signed-in user's bearer token and an explicit `{ "confirm": true }` body. The handler verifies the session with Supabase Auth, removes the linked profile, then deletes the Auth user. If the Auth deletion fails after the profile removal, it attempts to restore the profile and returns an error instead of claiming success.

The endpoint has mock-based tests in `api/account-delete.test.js`. These validate request ordering and rollback handling without touching a real account. Live verification still requires the server-only `SUPABASE_SERVICE_KEY` in Vercel and a dedicated test account in a non-production Supabase project. Do not test deletion with a real user's production account.

## Retention policy

There is no scheduled purge. The operator must first decide the lawful purpose, data categories, retention period, notice/consent wording, and any legal holds with the responsible privacy/legal reviewer. Until those decisions exist, do not configure automatic deletion based on an invented inactivity cutoff. Self-service deletion is separate from an automated retention schedule.

## Audit migration checks

1. Apply `database/migrations/20261109_admin_backup_audit.sql` in the intended Supabase project.
2. Run the read-only query in `database/verify_admin_audit.sql`. Expect `table_exists`, `row_level_security_enabled`, `append_only_trigger_enabled`, `service_role_can_read`, `service_role_can_insert`, and `browser_roles_cannot_write` to be true.
3. Configure `SUPABASE_SERVICE_KEY` and `ADMIN_EMAILS` server-side, merge/deploy the admin MFA change, enroll an allowlisted test admin in TOTP, then read `GET /api/admin?resource=admin_audit_log`.
4. In a non-production Supabase project, perform a known admin action and confirm its audit event is present. Confirm direct UPDATE/DELETE attempts are rejected by the append-only trigger. Do not use production for mutation probes.

The status query checks database structure and grants only. It does not prove that a live API mutation created an audit row. The current admin API logs audit-write failures and may still complete the underlying mutation; end-to-end audit enforcement remains a follow-up before relying on the log for compliance.

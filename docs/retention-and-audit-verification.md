# Account deletion, retention, and audit verification

## Account deletion

`POST /api/account-delete` requires the signed-in user's bearer token and an explicit `{ "confirm": true }` body. The handler verifies the session with Supabase Auth and deletes only the verified Auth user. The database removes the linked profile in the same operation via `profiles_user_id_fkey` (`ON DELETE CASCADE`). This constraint was confirmed on the connected project. Check the same constraint on staging before enabling deletion there.

The endpoint has mock-based tests in `tests/server/account-delete.test.js`. These validate identity verification, the Auth deletion request and failure handling without touching a real account. Live verification still requires the server-only `SUPABASE_SERVICE_KEY` in Vercel and a dedicated test account in a non-production Supabase project. Do not test deletion with a real user's production account.

## Retention policy

There is no scheduled purge. The operator must first decide the lawful purpose, data categories, retention period, notice/consent wording, and any legal holds with the responsible privacy/legal reviewer. Until those decisions exist, do not configure automatic deletion based on an invented inactivity cutoff. Self-service deletion is separate from an automated retention schedule.

## Audit migration checks

1. Apply `database/migrations/20261109_admin_backup_audit.sql` in the intended Supabase project.
2. Run the read-only query in `database/verify_admin_audit.sql`. Expect `table_exists`, `row_level_security_enabled`, `append_only_trigger_enabled`, `truncate_trigger_enabled`, `service_role_can_read`, `service_role_can_insert`, `service_role_cannot_change_existing_events`, and `browser_roles_cannot_access` to be true.
3. Configure `SUPABASE_SERVICE_KEY` and `ADMIN_EMAILS` server-side, merge/deploy the admin MFA change, enroll an allowlisted test admin in TOTP, then read `GET /api/admin?resource=admin_audit_log`.
4. In a non-production Supabase project, perform a known admin mutation and confirm its `*_requested` and completion events appear in the log. Confirm that direct `UPDATE`, `DELETE`, and `TRUNCATE` are blocked. Run destructive probes only against an isolated test database.

The admin API returns HTTP 503 before a mutation if it cannot write its `*_requested` event. It also requires an audit entry before returning an encrypted backup. The request event records an attempt. A completion event is written separately after a successful downstream response. If that audit write fails, the API logs the failure and returns the mutation's actual result. Check the downstream system when an attempt has no completion event. The schema query does not exercise the live API.

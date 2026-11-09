# PRD acceptance status — 9 November 2026

This file tracks implementation evidence separately from items that still need credentials, database migrations, source connectors, or end-to-end verification. A successful Vercel build is not treated as proof of live feature readiness.

## Verified in repository / production build

- [x] Responsive React/Vite web app deployed to Vercel; production homepage returned HTTP 200.
- [x] Supabase-based sign-in/profile flow exists; Google/Facebook/phone providers still depend on Supabase configuration.
- [x] Profile completeness indicator and JSON export.
- [x] Country and visa-route pages display only records marked `verified`.
- [x] Country comparison for verified access, visa routes, and active verified jobs.
- [x] Current residence and target-country profile fields plus matching predicate; database migration is required before the new fields persist.
- [x] Explainable heuristic job-match score based on preferred occupation, skill words in job text, target country, and experience wording.
- [x] Editable Bengali/English cover-letter draft and print-to-PDF browser flow.
- [x] Admin UI code for countries, country access, visa routes, jobs, ads, dashboard counts, source registry, and conservative banner controls.
- [x] Admin API source registry and manual scraper workflow dispatch code.
- [x] AES-256-GCM + gzip backup export, validation/preview, merge restore, and empty-database-only full restore code, with 3 MB transfer limit.
- [x] Append-only admin audit log schema and API write/read code.
- [x] Account deletion endpoint verifies the signed-in user and has mock-based tests for profile and Auth deletion. Live verification is pending.
- [x] GitHub Actions run `42567214613` for main commit `91c147ea82e3407a657b03feb030bfca2906eec9`: all four Ubuntu/Windows frontend, API syntax, and scraper validation jobs passed.
- [x] Vercel production deployment for main commit `91c147ea82e3407a657b03feb030bfca2906eec9` reached READY; the production homepage returned HTTP 200 on 9 November 2026.

## Required before admin/backup/source features can operate live

A live Vercel environment-variable inventory was checked on 9 November 2026 without decrypting secret values:

- `SUPABASE_SERVICE_KEY`, `ADMIN_EMAILS`, and `GITHUB_TOKEN` are absent from the project configuration for production, preview, and development.
- A sensitive `BACKUP_ENCRYPTION_KEY` entry exists. Its value was not decrypted, so its format and usability have not been verified; confirm it is a valid 32-byte key before relying on backup export/restore.
- The configured public Supabase URL and publishable key are present; they do not replace the missing server-side service key.

The project owner must add these server-only values in Vercel. Never put the service key, GitHub token, or backup key in client-side `VITE_*` variables or commit them to Git.

## Database migrations still need to be applied in Supabase SQL Editor

1. `database/migrations/20261109_admin_backup_audit.sql` — creates the append-only audit log table.
2. `database/migrations/20261109_residence_aware_matching.sql` — adds residence and target-country fields and the scoped uniqueness/indexes.
3. `database/migrations/20261109_structured_jobs.sql` — adds optional salary, deadline, ISCO-08, language, qualification, expiry, and deduplication fields.

The connected Supabase project currently reports only these applied migrations: `initial_schema`, `index_source_pages_country_code`, and `profiles_contact_details`. The audit, residence-aware, and structured-jobs migrations above are still unapplied; the live `public` table inventory also has no `admin_audit_log` table. Do not treat audit logging, residence/target-country persistence, or structured job fields as operational until the owner applies the migrations and verifies the schema.

## PRD gaps still open

- Admin TOTP code is implemented on branch `codex/admin-totp-gate-2026-11-09`: the UI supports enrollment/challenge, and non-check admin APIs require a Supabase-validated `aal2` JWT with `amr` method `totp`. It is not in production yet; merge/deploy, configure the missing environment variables, enroll the allowlisted admin, and verify the live flow before marking it accepted.
- The self-service account deletion endpoint exists, but live verification is blocked by the missing `SUPABASE_SERVICE_KEY`. Retention periods, scheduled deletion workflows, legal operator/contact details, and a production deletion verification remain open.
- Scheduled encrypted daily backups, retention rotation, remote storage, and tested restore on an empty database are not yet operational.
- The source scraper currently gathers official immigration pages for configured countries and has bounded GET retries for transient connection failures and HTTP 429/5xx responses. The official job connector, source-health dashboard, and required country connectors remain incomplete.
- The structured job migration, admin fields, validation, duplicate fingerprint, and public expiry filtering are ready in PR #9, but the migration is not applied. The official job connector, source-backed structured data, and automatic expiry processing remain open; job dates must come from the official source.
- Italy-specific verified roadmaps for every required nationality/residence combination and all other country roadmaps remain incomplete; no visa rule should be inferred or fabricated.
- CV country-specific conventions, PDF upload, generated-document version history, and ReportLab/WeasyPrint server-side PDF generation are incomplete; the current browser flow uses print-to-PDF.
- Ad network script units, pop-under runtime, and full session frequency controls are not implemented. Current release uses safe banner ads, a global switch, banner interval, and optional suppression on warning pages.
- Complete user management, privacy-safe analytics, full settings, and an end-to-end audit verification pass remain open. The audit migration is not applied. See the [read-only schema check and audit runbook](retention-and-audit-verification.md).
- The deployed architecture is currently React/Vite + Supabase + Vercel serverless APIs, rather than the PRD's preferred FastAPI/SQLAlchemy backend. A full migration to the PRD stack has not been done.

## Safe launch rule

Never mark scraped immigration content as verified solely because a crawler extracted it. Review the official source URL, current date, fee details, nationality, residence country, and procedure before approval. No automated visa-approval claims are permitted.

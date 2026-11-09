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
- [x] Account deletion endpoint verifies the signed-in user, removes the linked profile and Auth user, and has mock-based API tests; live-project verification remains pending.
- [x] GitHub Actions matrix for Windows and Ubuntu; Linux frontend tests/build and Python syntax checks passed for the main commit. Windows frontend job was still finishing at the last status check.
- [x] Vercel production build for commit `0ce093f2bd3dff6fc12bf1f00e0c8540b4b7d671` reached READY.

## Required before admin/backup/source features can operate live

The Vercel project currently does **not** have these environment variable names configured:

- `SUPABASE_SERVICE_KEY` — Supabase service-role/secret key, server-side only.
- `ADMIN_EMAILS` — comma-separated email allowlist for authorized admins.
- `GITHUB_TOKEN` — repository-scoped token; source editing requires Contents read/write, manual scraper trigger additionally requires Actions: write.

`BACKUP_ENCRYPTION_KEY` has been created as a sensitive Vercel environment variable. Do not put it in client-side variables or commit it to Git.

## Database migrations still need to be applied in Supabase SQL Editor

1. `database/migrations/20261109_admin_backup_audit.sql` — creates the append-only audit log table.
2. `database/migrations/20261109_residence_aware_matching.sql` — adds residence and target-country fields and the scoped uniqueness/indexes.

These migrations have been committed, but were not applied to the live database by this workflow. Until the residence migration is applied, the UI will preserve basic profile saves where possible and show a warning that residence/target-country preferences are not persisted.

## PRD gaps still open

- Mandatory per-admin TOTP 2FA is not yet implemented.
- Live account-deletion verification and legal operator/contact details remain incomplete. Automated retention is not implemented; the operator must define a lawful retention period before a purge schedule can be enabled.
- Scheduled encrypted daily backups, retention rotation, remote storage, and tested restore on an empty database are not yet operational.
- The source scraper currently gathers official immigration pages for configured countries; it does not yet provide a complete official job connector, robust source health/retry dashboard, or all required country connectors.
- The current database/job model does not yet provide complete structured salary, deadline, ISCO-08, language, qualification, expiry-cycle, and duplicate-fingerprint support.
- Italy-specific verified roadmaps for every required nationality/residence combination and all other country roadmaps remain incomplete; no visa rule should be inferred or fabricated.
- CV country-specific conventions, PDF upload, generated-document version history, and ReportLab/WeasyPrint server-side PDF generation are incomplete; the current browser flow uses print-to-PDF.
- Ad network script units, pop-under runtime, and full session frequency controls are not implemented. Current release uses safe banner ads, a global switch, banner interval, and optional suppression on warning pages.
- Admin 2FA, complete user management, privacy-safe analytics, and full settings remain open. A read-only audit-schema verification query and runbook are provided; end-to-end audit write/read verification still requires the audit migration and server-side credentials.
- The deployed architecture is currently React/Vite + Supabase + Vercel serverless APIs, rather than the PRD's preferred FastAPI/SQLAlchemy backend. A full migration to the PRD stack has not been done.

## Safe launch rule

Never mark scraped immigration content as verified solely because a crawler extracted it. Review the official source URL, current date, fee details, nationality, residence country, and procedure before approval. No automated visa-approval claims are permitted.

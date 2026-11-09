# Europe Work Guide

Mobile-first Bengali web application that helps Bangladeshi workers compare official work-immigration information, keep a CV-style profile, review verified country access and visa routes, search verified jobs, and prepare a printable CV. It uses the existing Supabase tables. The migration `database/migrations/20261103_profiles_contact_details.sql` adds three nullable contact fields to `profiles`; it adds no tables or policies. Live app: https://europe-work-guide.vercel.app

## Current production features (November 2026)

The production UI now includes:
- Side-by-side comparison of two countries using only rows marked verified.
- Editable cover-letter drafts in Bengali or English, with print-to-PDF support.
- Privacy, terms, and visa-disclaimer information plus a profile JSON export.
- Regression tests for route/profile matching and a GitHub Actions workflow intended to build the frontend and validate scraper syntax.

The latest production commit also passed the Vercel production build. Automated GitHub Actions status should be checked under the repository's Actions tab; the connector did not return a workflow-run record during this update.

The privacy/terms content is a first-release draft and must be completed with the operator's legal identity and support contact before treating it as final. Profile JSON export and a self-service account deletion endpoint are implemented, but deletion must be tested against the live Supabase project and the server-only service key must be configured. Automated retention/deletion is still not implemented.

## Latest implementation update

The production branch now includes country comparison, an editable cover-letter draft (English/Bengali), profile-completeness guidance, privacy/terms/disclaimer content with profile JSON export, admin dashboard record counts, and confirmation-protected deletion for admin-managed visa routes, country-access records, jobs, and ads. The Vercel production build passed for the latest application commit.

These changes extend the existing Supabase/Vercel app rather than replacing its backend. Google/Facebook/phone authentication depends on provider credentials in Supabase. Admin endpoints depend on server-only Vercel environment variables. The scheduled official-source scraper depends on GitHub Actions secrets.

**Still not fully implemented or not independently verified:** production-ready retention/deletion policy, current-residence-specific matching, every PRD admin module, a fully encrypted restore/preview workflow, all country-specific CV conventions, and full end-to-end authentication/admin testing against live Supabase. Self-service account deletion code is included, but it requires the server-only `SUPABASE_SERVICE_KEY` environment variable and must be verified against the live Supabase project. The latest Vercel build is not proof that external provider credentials or all live data operations are configured correctly. Encrypted full-backup export/preview/restore code is now included, with a 3 MB encrypted-payload safety limit; it requires `BACKUP_ENCRYPTION_KEY`, `SUPABASE_SERVICE_KEY`, GitHub Contents write access, and the audit migration below.

## Admin source registry and job matching

The admin panel can edit country source-registry JSON files in `scrapers/countries/`, inspect recent `source_pages` fetch metadata, request a manual scraper run through GitHub Actions, and control the global banner switch/frequency. The token used for source editing needs repository Contents read/write; manual run also needs Actions: write. Banner ads use localStorage frequency control. Pop-under and arbitrary third-party script injection intentionally remain disabled. Source URLs must use HTTPS. This registry currently covers only configured country files; a working connector must still be implemented for each source type.

Verified job cards now show an explainable heuristic profile-match score based on exact preferred-occupation matches, skill words appearing in the job text, target-country preference, and experience wording. This is not an AI hiring prediction or a visa eligibility assessment. Because the current database/job connector does not yet supply structured required skills, salary, language levels, deadlines, or employment types for every job, those fields are not fabricated.

## Current-residence-aware matching

The profile now includes current country of residence and target countries. The country access and visa-route admin forms can scope records to a nationality/residence combination; `ANY` means the reviewed record is general rather than residence-specific. Apply `database/migrations/20261109_residence_aware_matching.sql` in the Supabase SQL Editor before deploying this profile change. Existing access records receive `ANY` so they remain generic rather than being incorrectly treated as verified for one residence. Existing routes are also tagged `ANY` by default. Do not claim a residence-specific route is verified until a reviewer checks the official source for that exact combination.

## Advertising controls

`app/public/ads-config.json` stores the global ad switch, banner frequency in minutes, and an option to suppress ads on legal/immigration-warning pages. The browser tracks the last banner display in localStorage. The admin can edit these settings from the admin panel. Pop-under settings are fixed off because the current release does not implement a compliant pop-under runtime; arbitrary HTML/script execution from ad entries is not supported.

## Encrypted backup and audit log

The admin panel includes an encrypted JSON export, backup validation/preview, merge restore, and full restore only when the supported database tables are empty. The backup is gzip-compressed and encrypted with AES-256-GCM. Transfers are limited to 3 MB of encrypted payload because serverless request/response bodies have size limits. Larger production datasets need direct object storage (S3-compatible or Supabase Storage) rather than this API transfer route.

Before using these features:
1. Set a random 32-byte `BACKUP_ENCRYPTION_KEY` in Vercel server-only environment variables (64 hex characters or base64). Keep it outside the database and retain it securely; losing it makes old backups unrecoverable.
2. Apply `database/migrations/20261109_admin_backup_audit.sql` in the Supabase SQL Editor. It creates an append-only audit log table with no browser-user access.
3. Ensure `SUPABASE_SERVICE_KEY` and the repository-scoped `GITHUB_TOKEN` are configured. Backups include the current ad configuration, so the GitHub token is required.
4. After changing environment variables, redeploy Vercel.

Restore uses merge-upsert semantics for supported tables. A restore may partially import earlier batches if a later database operation fails; inspect the database and audit log before retrying. Immigration records remain subject to human review before public use.

## Production activation checklist

The app code and deployment do not provide third-party credentials. Before all live workflows can run, configure these in their respective dashboards:

- **Supabase Auth:** set Site URL to `https://europe-work-guide.vercel.app` and allow `https://europe-work-guide.vercel.app/**` as a redirect. Configure custom SMTP for public email confirmations; Supabase's default SMTP only sends to project team addresses. Enable Google, Facebook, and Phone only after adding their provider credentials and SMS delivery settings. OAuth callback: `https://fpuxzekbqfipxusyxsao.supabase.co/auth/v1/callback`.
- **GitHub Actions scraper:** add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, and `ANTHROPIC_API_KEY` as repository Actions secrets. The workflow now reports all missing secret names without printing values.
- **Vercel admin panel:** add `SUPABASE_SERVICE_KEY`, `ADMIN_EMAILS`, and a repository-scoped `GITHUB_TOKEN` with Contents read/write access. Admin review is required before scraped routes become visible; country access by nationality and job listings remain manually verified data.

The scraper never auto-publishes by default. Do not mark immigration data verified until a reviewer has checked its current official source.
## Folder tree

```text
.
├── .env.example
├── .env.server.example
├── .github/
│   └── workflows/
│       └── scrape.yml
├── .gitignore
├── README.md
├── api/
│   └── admin.js
├── database/
│   ├── migrations/
│   │   ├── 20261103_profiles_contact_details.sql
│   │   └── 20261103_source_pages_country_code_index.sql
│   └── seed_italy_bangladesh_2026.sql
├── app/
│   ├── index.html
│   ├── package.json
│   ├── public/
│   │   └── ads.json
│   ├── src/
│   │   ├── App.jsx
│   │   ├── lib/
│   │   │   ├── adminApi.js
│   │   │   ├── matching.js
│   │   │   └── supabase.js
│   │   ├── main.jsx
│   │   └── styles.css
│   └── vite.config.js
├── scrapers/
│   ├── countries/
│   │   └── italy.json
│   ├── engine.py
│   └── requirements.txt
└── vercel.json
```

## 1. GitHub repository

The project is already published as a public repository: [https://github.com/mdnhbn/europe-work-guide](https://github.com/mdnhbn/europe-work-guide). The `main` branch is connected to Vercel and deploys on push.

To get a fresh local copy:

```powershell
git clone https://github.com/mdnhbn/europe-work-guide.git
cd europe-work-guide
```

After installing Node.js 20+, run `./setup.ps1` in PowerShell on Windows or `bash ./setup.sh` on Linux. These scripts install the frontend dependencies from the lockfile. Start development with `cd app` and `npm run dev`.

To publish later changes from the project folder, run:

```powershell
git add .
git commit -m "Describe your change"
git push
```
## 2. Run the app on your computer

1. Install Node.js 20 or later.
2. In PowerShell at the project folder, copy `.env.example` to `app/.env` with `Copy-Item .env.example app/.env`.
3. Open `app/.env` and keep the provided Supabase URL and publishable key, or replace them with the values from your Supabase project's API settings. The publishable/anon key is intended for browser use; never put the service-role key in this file.
4. In PowerShell, run:

   ```powershell
   cd app
   npm install
   npm run dev
   ```

5. Open the local URL Vite prints, usually `http://localhost:5173`.

## 3. Deploy on Vercel

1. Sign in to Vercel and choose **Add New → Project**.
2. Import the GitHub repository you created above.
3. Leave the Root Directory as `./`. The included `vercel.json` builds `app/` and publishes `app/dist/`.
4. In **Settings → Environment Variables**, add these two variables for Production (and Preview/Development if you want those environments too):

   - `VITE_SUPABASE_URL` = `https://fpuxzekbqfipxusyxsao.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = `sb_publishable_xzZkGWjVdRXsk4k9i3OKJw_kNhCYpA1`

5. The production deployment is available at [https://europe-work-guide.vercel.app](https://europe-work-guide.vercel.app). After adding or changing environment variables, redeploy so the build receives them.

## 4. Configure the admin panel

The signed-in account is shown the admin tab only when its Supabase Auth email appears in `ADMIN_EMAILS`. The API checks that allowlist on the server for every request. The admin API adds no tables or RLS policies. Admins can manage countries, country access, visa routes, jobs, and advertisements. Ads are committed to `app/public/ads.json`; when Vercel is connected to the GitHub repository, the new ad appears after that commit deploys.

In Vercel **Settings → Environment Variables**, add these server-only values for the environments where you will use the admin panel:

- `SUPABASE_URL` = your Supabase project URL
- `SUPABASE_ANON_KEY` = your Supabase publishable/anon key
- `SUPABASE_SERVICE_KEY` = your Supabase service-role/secret key
- `ADMIN_EMAILS` = comma-separated Supabase Auth email addresses allowed to administer the app
- `GITHUB_TOKEN` = a fine-grained GitHub token restricted to this repository with **Contents: Read and write** access
- `GITHUB_REPOSITORY` = `mdnhbn/europe-work-guide`
- `GITHUB_BRANCH` = `main`

These values must not use the `VITE_` prefix and must never be committed. `.env.server.example` lists them. In the deployed project, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `GITHUB_REPOSITORY`, and `GITHUB_BRANCH` are already configured; add `SUPABASE_SERVICE_KEY`, `ADMIN_EMAILS`, and `GITHUB_TOKEN` to activate the admin panel. After adding them, redeploy Vercel. The local Vite server does not run the serverless API; use the deployed Vercel app (or `vercel dev`) for admin operations.

## 5. Configure Supabase Auth

1. Open the Supabase dashboard for this project.
2. Go to **Authentication → URL Configuration**.
3. Set **Site URL** to your deployed Vercel URL, for example `https://europe-work-guide.vercel.app`.
4. Add `https://europe-work-guide.vercel.app/**` to **Redirect URLs**. While developing, also add `http://localhost:5173/**`.
5. Save. Sign-up may require opening the email confirmation link before the first login.
6. The app creates one private profile row on a user's first authenticated session and upserts later edits. Existing RLS policies must allow each user to read/write only their own `profiles` row; public reads should expose only verified rows. The contact-field migration adds nullable `contact_email`, `phone`, and `address` columns without changing those policies.

For public email sign-ups, configure a custom SMTP server in **Authentication → Emails → SMTP Settings**. Email confirmation is enabled, and Supabase's built-in SMTP only sends to addresses belonging to the project team; it is not suitable for general users. Keep confirmation enabled for production. See the [Supabase SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp).

### Enable Google, Facebook, and phone sign-in

The app now shows Google and Facebook buttons on both the sign-up and login screens. Phone OTP works as a combined flow: a new number creates an account after OTP verification; an existing number signs in. The phone picker supports international country codes and sends the number to Supabase in E.164 format.

Provider credentials are managed in Supabase, not in this repository or Vercel:

- **Google:** Create a Web OAuth client in Google Cloud. Add `https://europe-work-guide.vercel.app` (and `http://localhost:5173` for local development) as authorized JavaScript origins. Add the Supabase callback URL `https://fpuxzekbqfipxusyxsao.supabase.co/auth/v1/callback` as an authorized redirect URI. In Supabase **Authentication → Sign In / Providers → Google**, enable Google and enter the client ID and secret. Follow the [Supabase Google setup guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
- **Facebook:** Create a Facebook Login app, set the same Supabase callback URL as a valid OAuth redirect URI, and add the app ID and secret under Supabase **Authentication → Sign In / Providers → Facebook**. Grant the email permission and switch the Facebook app to Live mode when ready for general users. See the [Supabase Facebook setup guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-facebook).
- **Phone:** Enable the Phone provider in Supabase and configure an SMS provider such as Twilio, Vonage, or MessageBird. The picker accepts numbers from any country; SMS delivery still depends on your provider's country coverage, account settings, and local regulations. SMS messages can incur charges, so set rate limits and CAPTCHA before public use. See the [Supabase phone sign-in guide](https://supabase.com/docs/guides/auth/phone-login).

Keep Google/Facebook client secrets and SMS-provider credentials only in the Supabase dashboard. Add the deployed app URL and your local development URL in Supabase **Authentication → URL Configuration → Redirect URLs** so Supabase can return users to the app after sign-in. See [Supabase redirect URL setup](https://supabase.com/docs/guides/auth/redirect-urls).
## 6. Add GitHub Actions secrets for the scraper

1. In the Supabase dashboard, copy the project URL and the **service_role/secret** key from **Project Settings → API**. The scraper needs that privileged key to write `source_pages` and pending `visa_routes` rows.
2. In Anthropic Console, create an API key for the scraper.
3. In GitHub, open the repository's **Settings → Secrets and variables → Actions → New repository secret**. Add exactly these three secrets:

   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SERVICE_KEY` = your Supabase service-role/secret key
   - `ANTHROPIC_API_KEY` = your Anthropic API key

4. Never add any of these three values to the React app, `.env.example`, Git, or Vercel frontend variables. The GitHub workflow keeps automatic publishing disabled.
5. Open **Actions → Scrape official immigration pages** and choose **Run workflow** to run it once. It will also run daily at 17:00 UTC (20:00 Saudi Arabia time). The scraper first checks each site's `robots.txt`, pauses between requests, stores changed page text and extracted facts, and leaves route records pending human review by default.

## Italy source links: verify before relying on them

The starting Italy config is `scrapers/countries/italy.json` and includes these official-source candidates:

- [Portale Integrazione Migranti — ingresso e soggiorno per lavoro](https://www.integrazionemigranti.gov.it/it-it/Altre-info/e/4/o/6/id/7)
- [Italian Ministry of the Interior — modalità d'ingresso](https://www.interno.gov.it/it/temi/immigrazione-e-asilo/modalita-dingresso)
- [Italian Ministry of Labour — ingresso e soggiorno per lavoro](https://www.lavoro.gov.it/temi-e-priorita/immigrazione/focus-on/ingresso-e-soggiorno-per-lavoro-in-italia/pagine/ingresso-e-soggiorno-per-lavoro-in-italia)

**Verify these links and their current content before you rely on them.** Government page URLs and rules can move. The scraper skips a page when it cannot read `robots.txt` or robots rules disallow fetching. It never decides who may apply by nationality; `country_access` must be entered and verified by a human.

## Review rules and adding another country

- Only rows marked `verified` are shown for country access, visa routes, and jobs. Missing verified access data appears as “যাচাই করা তথ্য নেই”; the app never guesses a status.
- Route matching compares only the requirement fields actually stated. Incomplete profile data yields an unknown check.
- Scraped route data starts as `pending`. Set the optional GitHub Actions repository variable `AUTO_PUBLISH=true` only if you deliberately want routes with no numeric-source problems to publish automatically. It remains `false` in the supplied workflow. Human verification is the safer default.
- To monitor another country, add one JSON file in `scrapers/countries/` with `code`, `name`, `language`, and a `sources` list. The engine automatically loads every JSON file in that folder. Put only appropriate official source URLs there and check their robots policy.
- When the scraper reads a country config, it upserts that country as enabled in the existing `countries` table. Add a JSON file in `scrapers/countries/` to add a country; its status stays unknown until a human adds verified `country_access` data. Verified route and job rows appear as they are reviewed.
## Curated initial Italy data

The existing Supabase project now contains a human-reviewed Italy/Bangladesh access record and two 2026 quota-based work routes. The idempotent SQL seed is `database/seed_italy_bangladesh_2026.sql`; its source links include the Italian government, Ministry of Foreign Affairs, and European Commission. The data is time-sensitive: check remaining quotas and embassy checklists before relying on it.

No individual job listings were fabricated. When the app has no verified active vacancy, it links to the official EURES portal so users can search current postings.


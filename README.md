# Europe Work Guide

Mobile-first Bengali web application that helps Bangladeshi workers compare official work-immigration information, keep a CV-style profile, review verified country access and visa routes, and prepare a printable CV. The React app reads and writes the existing Supabase tables; this project does not create or alter database tables. Live app: https://europe-work-guide.vercel.app

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

The signed-in account is shown the admin tab only when its Supabase Auth email appears in `ADMIN_EMAILS`. The API checks that allowlist on the server for every request. No database tables or RLS policies are added or changed. Admins can manage countries, country access, visa routes, jobs, and advertisements. Ads are committed to `app/public/ads.json`; when Vercel is connected to the GitHub repository, the new ad appears after that commit deploys.

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
6. Check that the existing RLS policies allow users to select/upsert only their own `profiles` row and that public reads expose only verified rows. This app intentionally does not change tables or policies.

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




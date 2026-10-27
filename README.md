# Agency Tracker

Web app for tracking partner agencies: meeting history, automatic follow-ups, AI summaries and next steps, a dashboard, a daily feed, and website intelligence (service gaps, upsell potential, nightly change checks). Requirements are in [docs/BRD.md](docs/BRD.md).

Runs free on Cloudflare (Workers + D1) with the Gemini API free tier.

## First-time setup

You need a free Cloudflare account and a free Gemini API key (Google AI Studio).

```bash
npm install
npx wrangler login                         # opens a browser to log in to Cloudflare
npx wrangler d1 create agency-tracker      # copy the printed database_id into wrangler.toml
npm run db:migrate:remote
npx wrangler secret put GEMINI_API_KEY     # paste the key when asked; it is never stored in the repo
npm run deploy                             # prints the app's URL
```

Then open the URL, go to **Import**, and upload Chabert's tab (Google Sheets: File > Download > Comma-separated values). The import report lists rows to check.

Without access to the app, the same import can be run from the command line (it replaces all data):

```bash
npx esbuild scripts/import-to-sql.ts --bundle --platform=node --format=esm --outfile=/tmp/import-to-sql.mjs
node /tmp/import-to-sql.mjs chabert.csv import.sql
npx wrangler d1 execute agency-tracker --remote --file=import.sql
```

Access is open: anyone with the URL can view and edit. Do not share the URL outside the team.

## Local development

```bash
npm run db:migrate:local
echo "GEMINI_API_KEY=your-key" > .dev.vars   # optional; without it, AI features show a friendly message
npm run dev                                  # http://localhost:8787
npm test
npm run typecheck
npm run build:theme                          # after changing anything in design-system/
```

## The interface

One sidebar, five screens: Today, Dashboard, Agencies, Add agency, Import. Today ranks
the day's work; the Dashboard reports; the agency page splits work on the left from
reference on the right.

It is server-rendered with no client framework. The only JavaScript is three small
inline scripts: the stage and lead-temperature dropdowns stay in step, filters apply on
change, and destructive buttons ask first. Everything works with JavaScript off, and
the filter form keeps an Apply button for that case.

Below 900px the sidebar becomes a bottom tab bar and tables become cards. Light and
dark both come from the same tokens.

## How it works

- `src/rules.ts`: statuses, allowed combinations, follow-up timing, downgrades (BRD section 2)
- `src/import.ts`: CSV import and cleanup, spreading overdue follow-ups over the first working days
- `src/ai.ts`: Gemini calls (note summaries, next steps). `src/redact.ts` strips contact names, emails and phones first
- `src/db.ts`: follow-ups, status changes, suggestions
- `src/reports.ts`: dashboard, daily feed, and the daily job
- `src/views/`: the screens. `layout.tsx` holds the shell and the shared pieces (badges, date cells, follow-up actions), `pages.tsx` the screens themselves, `icons.tsx` the icon set, `theme.ts` the generated stylesheet
- `design-system/`: the design system this UI is built from (`tokens.json`, `bundle.css`, `app-layout.css`). Change these, run `npm run build:theme`, and `src/views/theme.ts` is rebuilt. The stylesheet is served at `/app.css` with a version in the URL, so it is cached once instead of inlined on every page
- The daily job runs at 06:30 IST (`crons` in `wrangler.toml`) and refreshes AI next steps for up to `NEXT_STEPS_DAILY_LIMIT` agencies with something new or due
- `src/web.ts`: fetching agency sites, finding key pages (any language), turning HTML into comparable text, spotting real changes
- `src/intel.ts`: first scan, nightly checks, AI labelling of changes, service gaps and upsell, opportunity suggestions
- Website checks run every 2 minutes overnight (23:30 to 06:30 IST) in small batches (`CRAWL_PAGES_PER_TICK`, `CRAWL_AI_PER_TICK`) to fit the Workers free plan. Background AI use is capped per day by `AI_DAILY_BUDGET`
- The first scan of ~210 sites takes 1 to 2 nights, depending on the AI budget. The first check of each page is a baseline; changes show from the next night on

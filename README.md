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

Access is open: anyone with the URL can view and edit. Do not share the URL outside the team.

## Local development

```bash
npm run db:migrate:local
echo "GEMINI_API_KEY=your-key" > .dev.vars   # optional; without it, AI features show a friendly message
npm run dev                                  # http://localhost:8787
npm test
npm run typecheck
```

## How it works

- `src/rules.ts`: statuses, allowed combinations, follow-up timing, downgrades (BRD section 2)
- `src/import.ts`: CSV import and cleanup, spreading overdue follow-ups over the first working days
- `src/ai.ts`: Gemini calls (note summaries, next steps). `src/redact.ts` strips contact names, emails and phones first
- `src/db.ts`: follow-ups, status changes, suggestions
- `src/reports.ts`: dashboard, daily feed, and the daily job
- `src/views/`: the screens
- The daily job runs at 06:30 IST (`crons` in `wrangler.toml`) and refreshes AI next steps for up to `NEXT_STEPS_DAILY_LIMIT` agencies with something new or due
- `src/web.ts`: fetching agency sites, finding key pages (any language), turning HTML into comparable text, spotting real changes
- `src/intel.ts`: first scan, nightly checks, AI labelling of changes, service gaps and upsell, opportunity suggestions
- Website checks run every 2 minutes overnight (23:30 to 06:30 IST) in small batches (`CRAWL_PAGES_PER_TICK`, `CRAWL_AI_PER_TICK`) to fit the Workers free plan. Background AI use is capped per day by `AI_DAILY_BUDGET`
- The first scan of ~210 sites takes 1 to 2 nights, depending on the AI budget. The first check of each page is a baseline; changes show from the next night on

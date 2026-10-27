# Agency Tracker: Business Requirements (v1)

Status: agreed stage by stage, October 2026. This document is the reference for the build.

---

## 1. Goal and user

**Problem.** About 250 agency conversations live in one Google Sheet tab (Chabert). Follow-ups are tracked by hand in weekly columns. There is no pipeline view and no visibility of what changes at each agency.

**Goal.** One web app where every agency has a single record with its full meeting history, follow-ups are scheduled automatically, AI suggests what to do next, and every morning there is a feed of what to do and what changed.

**User.** Chabert, to track agencies and get the feeds. One other person views it as a regular user.

**Access.** Open for now: anyone with the link can view and edit. A login can be added later at no cost.

**Success after month one**
- Every Hot, Warm and Future fit agency has a next follow-up date
- Logging a meeting takes under 2 minutes
- The daily feed is opened every day
- The Google Sheet is retired

**Out of scope for v1**
- Sending emails from the app
- Connecting to the email sequence tool or a CRM
- The other three tabs (Sheraline, Nigel, Yeshitesh)

---

## 2. Status and follow-up rules

Two fields. **Lead Status** sets the follow-up timing. **Status** drives the dashboard. Only these combinations are allowed:

| Status | Allowed Lead Status |
|---|---|
| Won | Hot |
| Opportunity | Hot, Warm, Education, Future fit |
| Potential (Warm) | Warm, Future fit, Education |
| Email Sequence | Cold, Future fit, Education |
| Not Interested | Disqualified only |

**Follow-up timing**

| Lead Status | Follow-ups |
|---|---|
| Hot, Warm | +7 days, +15 days, +30 days, then monthly |
| Future fit, Education | Every 30 days |
| Cold | Every 90 days (light check; the sequence tool handles emails) |
| Won | None. Won agencies are active partners and do not appear in the daily feed |
| Disqualified | None. The website is still monitored and a big change can prompt a "worth reopening?" suggestion |

**Rules**
- The timer resets when a meeting or note is logged, or a follow-up is marked done. Follow-ups can be snoozed.
- If notes mention a specific date ("meet in May", "check back in 2 weeks"), that date replaces the standard timing.
- Agencies with no meeting date start their timer on the import date.
- No automatic downgrades. After 3 follow-ups with no response, the AI suggests a downgrade with a reason. Chabert moves it manually.

---

## 3. Agency record

**Agency details**
- Agency name, website, country
- Contacts (one or more): name, role, email, LinkedIn
- Status and Lead Status (rules above)
- Framework magazine: Sent / To send / Not needed
- Deal in hand: short description and optional estimated value
- Automatic: last contact date, next follow-up date, follow-ups without reply

**Timeline** (newest first)
- Each entry: date, type (meeting, call, email, note, follow-up done, status change), raw notes, AI summary, next step
- Status changes are logged automatically

**Intelligence tab**
- Their services (read from their website)
- Service gaps: Kilowott services they do not offer, written as a pitch list
- Upsell potential: from their case studies, where they likely need extra capacity
- Activity feed: changes found on their website
- AI next steps
- Last checked date and a refresh button

**Kilowott service list** (benchmark for gaps)

| Service line | Covers |
|---|---|
| Consulting & Strategy | Business strategy, digital transformation, market research, product strategy |
| Software & Applications | .NET, Node.js, PHP/Laravel, React/React Native, Vue, AWS/Azure, QA and testing |
| Web & Ecommerce | WordPress, Shopify, WooCommerce, Webflow, Wix, NopCommerce, automation (Klaviyo, HubSpot), payments, analytics |
| Interaction Design | UX/UI, user research, wireframes, prototyping, usability testing |
| Animation | 2D/3D, explainers, motion graphics |
| Digital Marketing | PPC, SEO, social, email, demand generation, marketing automation |
| GEO | Generative engine optimisation |
| Kilowott Intelligence | AI adoption and automation for teams |
| Kilowott Workforce | On-demand teams and staff augmentation |

Agency engagement models used in upsell suggestions: **Integration** (white-label delivery) and **Collaboration**.

---

## 4. Core features

**A. Log a meeting or note**
- Pick an agency, or create one (name and website). Enter date, type, and paste notes (rough notes, a paragraph or a transcript).
- AI returns: a 3 to 5 line summary, key points (interest level, services needed, projects mentioned, objections), a suggested next step with date, and a suggested status change with reason if warranted.
- Chabert reviews and edits before saving. Saving resets the follow-up timer.
- Contact names, emails and phone numbers are replaced with placeholders before notes are sent to the AI.

**B. Follow-ups**
- List of due today and overdue
- Actions: mark done (optional note), snooze (3 days, 1 week, custom date), reschedule

**C. Manual status change**
- Dropdowns on the agency page. Optional reason. Logged in the timeline.

**D. AI status suggestions**
- Triggered by: a new note, 3 unanswered follow-ups, a website opportunity signal, or a big change at a Disqualified agency
- Shown on the agency page and in a suggestions list. Accept or dismiss.

**E. AI next steps per agency**
- 1 to 3 concrete actions at the top of the agency page, based on timeline, status, timing and the Intelligence tab
- Refreshed only for agencies with something new or due that day (keeps AI usage within free limits)

**F. Agency list**
- Search, and filters by Status, Lead Status, country and overdue

---

## 5. Dashboard and daily feed

**Dashboard** (each block opens the matching filtered list)

| # | Block | Shows |
|---|---|---|
| 1 | Pipeline | Agencies per Status |
| 2 | Country split | Agencies per country, split by Status |
| 3 | Potential deals | Hot agencies or those with a deal in hand: deal, value, next step, total value |
| 4 | Today's actions | Follow-ups due and overdue, plus AI suggestions waiting for a decision |
| 5 | Today's web updates | Website changes in the last 24 hours, opportunities first |

Date filter (this week, month, quarter, all time) on blocks 1 to 3, by meeting date.

**Daily feed** (in-app home page, ready by 7:00 am IST)
1. Overdue follow-ups
2. Due today
3. AI suggestions waiting for a decision
4. Website updates from the last 3 days, opportunities first, only for agencies still being worked (Email Sequence, Opportunity, Potential (Warm), or a Warm lead). Won and Not Interested agencies are left out
5. Yesterday's recap: notes logged and status changes

Every item links to the agency and has quick actions. On a quiet day: "Nothing new today."

---

## 6. Agency intelligence

**First scan per agency**
- Find key pages from the site menu: services, case studies or portfolio, blog or news, careers. Chabert can correct them.
- AI fills in their services, gaps and upsell potential. Websites in any language; output in English.

**Nightly check** (finished before the 7:00 am feed, plus a refresh button per agency)
- Compare each watched page with the previous version. Ignore cosmetic changes.
- Label real changes: new case study, new service, new client, hiring, new website or rebrand, other.
- When services or case studies change, gaps and upsell are updated.

**Opportunity signals** (shown first in the feed, can trigger a status suggestion)

| Signal | Why it matters |
|---|---|
| Hiring developers or designers | Short on capacity |
| Launched a service we deliver | Needs delivery capacity |
| New case study on a platform we cover | Hook for an upsell message |
| New website or rebrand | Natural reason to reconnect |
| Expansion to a new market or new offering | More work than their team can handle |

Changes labelled "other" appear only in the agency's own activity feed, not the daily feed.

Agencies with no website ("Not found") or only a LinkedIn page show "No website, intelligence unavailable" until a site is added. LinkedIn is not monitored.

**Not in v1:** news from outside the agency's own website (press, LinkedIn posts).

---

## 7. Import, phases and setup

**Import of Chabert's tab** (one time; the sheet then becomes a read-only archive)
- Clean country names and parse dates; flag suspicious dates (future years, typos)
- Merge duplicate agencies into one record with all meetings in the timeline
- Mark "Not found" and LinkedIn links as no website
- Convert weekly columns to dated timeline entries (assumption: the Feb, Mar and Aug columns are 2026)
- Import report listing rows to fix: status combinations that break the rules, suspicious dates, duplicates
- Then run the first intelligence scan, spread over several days if free AI limits require

**Build phases**

| Phase | Contents |
|---|---|
| 1. Core tracker | Import, agency records and timeline, meeting log with AI summary, follow-up engine, status dropdowns, AI suggestions and next steps, dashboard blocks 1 to 4, daily feed without web updates |
| 2. Intelligence | Intelligence tab, nightly website checks, opportunity signals, dashboard block 5, web updates in the feed |
| Later | Login, morning email digest, Google Doc transcript links, the other three tabs, outside news |

**Setup (zero cost)**

| Part | Tool |
|---|---|
| App screens | Cloudflare Pages |
| Backend and AI key storage | Cloudflare Workers |
| Database | Cloudflare D1 |
| 7:00 am feed and nightly checks | Cloudflare Workers scheduled jobs |
| AI | Gemini API free tier, called only from the backend |
| Code | Private GitHub repo `salesteam-create/sales-automation` |

**Known limits of the free setup**
- Gemini free tier may use submitted data to improve Google's products. Mitigation: personal details are stripped from notes; website content is public anyway.
- Free AI request limits are tight and change often. Volume is small, but the first scan may take a few days.
- Some agency sites block automated reading. These are marked "couldn't check".
- Upgrade path: switching to a paid AI key later changes nothing else.

**Needed to start**
- A Cloudflare account (free)
- A Gemini API key from Google AI Studio (free)
- Confirmation that the shared sheet's Chabert tab is the source of truth for the import

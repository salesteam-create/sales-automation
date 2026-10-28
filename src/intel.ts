// Agency intelligence (BRD section 6): first scan, nightly checks, change labelling, gaps and upsell.
// Work is split into small units (one page fetch, or one AI call) so each Worker run stays within free-plan limits.

import { AiUnavailableError, KILOWOTT_CONTEXT, generateJson, type AiEnv } from './ai';
import { todayIST } from './dates';
import { createSuggestion, getAgency, type Agency } from './db';
import { statusForLead } from './rules';
import { diffText, discoverPages, extractText, fetchPage, hashText, isMeaningful, type PageKind } from './web';

export interface IntelEnv extends AiEnv {
  AI_DAILY_BUDGET?: string;
  NEXT_STEPS_DAILY_LIMIT?: string;
  CRAWL_PAGES_PER_TICK?: string;
  CRAWL_AI_PER_TICK?: string;
}

export interface WatchedPage {
  id: number;
  agency_id: number;
  kind: PageKind;
  url: string;
  last_checked_at: string | null;
  last_status: string | null;
  last_error: string | null;
  content_hash: string | null;
  content_text: string | null;
}

export interface Gap {
  service: string;
  pitch: string;
}
export interface Upsell {
  finding: string;
  suggestion: string;
}
export interface AgencyIntel {
  agency_id: number;
  summary: string | null;
  their_services: string[];
  platforms: string[];
  gaps: Gap[];
  upsell: Upsell[];
  updated_at: string;
}

export interface WebChange {
  id: number;
  agency_id: number;
  agency_name?: string;
  page_kind: PageKind;
  page_url: string;
  added_text: string;
  change_ratio: number;
  label: string | null;
  title: string | null;
  summary: string | null;
  is_opportunity: number;
  opportunity_reason: string | null;
  detected_at: string;
}

export const CHANGE_LABELS: Record<string, string> = {
  new_case_study: 'New case study',
  new_service: 'New service',
  new_client: 'New client',
  hiring: 'Hiring',
  new_website: 'New website or rebrand',
  expansion: 'Expansion',
  other: 'Other',
};

// ---------- AI budget ----------

// Background work stops at the daily budget; actions Chabert starts himself are always allowed but counted.
// `reserve` keeps calls back for later work the same day (the overnight scan leaves room for the 06:30 next steps).
export async function takeAiCall(db: D1Database, env: IntelEnv, background: boolean, reserve = 0): Promise<boolean> {
  const day = todayIST();
  const budget = Number(env.AI_DAILY_BUDGET ?? '200') || 200;
  if (background) {
    const row = await db.prepare('SELECT calls FROM ai_usage WHERE day = ?').bind(day).first<{ calls: number }>();
    if ((row?.calls ?? 0) >= budget - reserve) return false;
  }
  await db.prepare('INSERT INTO ai_usage (day, calls) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET calls = calls + 1').bind(day).run();
  return true;
}

// ---------- reading ----------

export async function getPages(db: D1Database, agencyId: number): Promise<WatchedPage[]> {
  return (await db.prepare('SELECT * FROM watched_pages WHERE agency_id = ? ORDER BY id').bind(agencyId).all<WatchedPage>()).results;
}

export async function getIntel(db: D1Database, agencyId: number): Promise<AgencyIntel | null> {
  const row = await db.prepare('SELECT * FROM agency_intel WHERE agency_id = ?').bind(agencyId).first<Record<string, string | number | null>>();
  if (!row) return null;
  const arr = <T,>(v: unknown): T[] => {
    try {
      return Array.isArray(JSON.parse(String(v))) ? JSON.parse(String(v)) : [];
    } catch {
      return [];
    }
  };
  return {
    agency_id: Number(row.agency_id),
    summary: (row.summary as string) ?? null,
    their_services: arr<string>(row.their_services),
    platforms: arr<string>(row.platforms),
    gaps: arr<Gap>(row.gaps),
    upsell: arr<Upsell>(row.upsell),
    updated_at: String(row.updated_at),
  };
}

export async function getChanges(db: D1Database, agencyId: number, limit = 30): Promise<WebChange[]> {
  return (
    await db.prepare('SELECT * FROM web_changes WHERE agency_id = ? ORDER BY detected_at DESC LIMIT ?').bind(agencyId, limit).all<WebChange>()
  ).results;
}

// Agencies whose website news goes in the feed: anyone still being worked
// (Email Sequence, Opportunity, Potential (Warm), or a Warm lead). Won and Not Interested are left out.
export const FEED_AGENCIES_SQL = `(a.status IN ('Email Sequence', 'Opportunity', 'Potential (Warm)') OR a.lead_status = 'Warm')`;

// Labelled, non-trivial changes (new services, case studies, hiring, etc.), opportunities first.
// Three days by default so news from the weekend is still there on Monday.
export async function recentChanges(db: D1Database, hours = 72): Promise<WebChange[]> {
  return (
    await db
      .prepare(
        `SELECT c.*, a.name AS agency_name FROM web_changes c JOIN agencies a ON a.id = c.agency_id
         WHERE c.detected_at >= datetime('now', ?) AND c.label IS NOT NULL AND c.label != 'other' AND ${FEED_AGENCIES_SQL}
         ORDER BY c.is_opportunity DESC, c.detected_at DESC`,
      )
      .bind(`-${hours} hours`)
      .all<WebChange>()
  ).results;
}

// ---------- units of work ----------

// Finds the key pages from the homepage. Also stores the homepage snapshot, so it counts as one fetch.
export async function discoverAgencyPages(db: D1Database, agency: Agency): Promise<string> {
  if (!agency.website) return 'No website';
  const res = await fetchPage(agency.website);
  if (!res.ok || !res.html) {
    await db.prepare(`UPDATE agencies SET pages_discovered_at = datetime('now') WHERE id = ?`).bind(agency.id).run();
    await db
      .prepare(
        `INSERT INTO watched_pages (agency_id, kind, url, last_checked_at, last_status, last_error) VALUES (?, 'home', ?, datetime('now'), 'error', ?)
         ON CONFLICT(agency_id, url) DO UPDATE SET last_checked_at = datetime('now'), last_status = 'error', last_error = excluded.last_error`,
      )
      .bind(agency.id, agency.website, res.error ?? 'Could not read the site')
      .run();
    return `Could not read the site: ${res.error}`;
  }
  const pages = discoverPages(res.html, res.url);
  const text = extractText(res.html);
  const hash = await hashText(text);
  const stmts = pages.map((p) =>
    p.kind === 'home'
      ? db
          .prepare(
            `INSERT INTO watched_pages (agency_id, kind, url, last_checked_at, last_status, last_error, content_hash, content_text)
             VALUES (?, 'home', ?, datetime('now'), ?, ?, ?, ?) ON CONFLICT(agency_id, url) DO NOTHING`,
          )
          .bind(agency.id, p.url, text ? 'ok' : 'error', text ? null : NO_TEXT, hash, text || null)
      : db.prepare(`INSERT INTO watched_pages (agency_id, kind, url) VALUES (?, ?, ?) ON CONFLICT(agency_id, url) DO NOTHING`).bind(agency.id, p.kind, p.url),
  );
  stmts.push(db.prepare(`UPDATE agencies SET pages_discovered_at = datetime('now'), intel_stale = 1 WHERE id = ?`).bind(agency.id));
  await db.batch(stmts);
  return `Found ${pages.length} pages`;
}

// Shown when a page loads but has no text we can read, usually because it is built in the browser by JavaScript.
const NO_TEXT = 'No readable text (the page is built with JavaScript)';

// Fetches one page and compares it with the last snapshot. The first snapshot is only a baseline.
export async function checkPage(db: D1Database, page: WatchedPage): Promise<'changed' | 'unchanged' | 'baseline' | 'error'> {
  const res = await fetchPage(page.url);
  if (!res.ok || !res.html) {
    await db
      .prepare(`UPDATE watched_pages SET last_checked_at = datetime('now'), last_status = 'error', last_error = ? WHERE id = ?`)
      .bind(res.error ?? 'Could not read the page', page.id)
      .run();
    return 'error';
  }
  const text = extractText(res.html);
  if (!text) {
    await db
      .prepare(`UPDATE watched_pages SET last_checked_at = datetime('now'), last_status = 'error', last_error = ? WHERE id = ?`)
      .bind(NO_TEXT, page.id)
      .run();
    return 'error';
  }
  const hash = await hashText(text);
  const update = db
    .prepare(`UPDATE watched_pages SET last_checked_at = datetime('now'), last_status = 'ok', last_error = NULL, content_hash = ?, content_text = ? WHERE id = ?`)
    .bind(hash, text, page.id);
  if (!page.content_text) {
    await db.batch([update, db.prepare('UPDATE agencies SET intel_stale = 1 WHERE id = ?').bind(page.agency_id)]);
    return 'baseline';
  }
  if (hash === page.content_hash) {
    await update.run();
    return 'unchanged';
  }
  const diff = diffText(page.content_text, text);
  if (!isMeaningful(diff)) {
    await update.run();
    return 'unchanged';
  }
  const stmts = [
    update,
    db
      .prepare(`INSERT INTO web_changes (agency_id, page_id, page_kind, page_url, added_text, change_ratio) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(page.agency_id, page.id, page.kind, page.url, diff.added.join('\n').slice(0, 6000), diff.ratio),
  ];
  // What they offer or show off has changed, so gaps and upsell need a fresh look.
  if (page.kind === 'services' || page.kind === 'work' || page.kind === 'home') {
    stmts.push(db.prepare('UPDATE agencies SET intel_stale = 1 WHERE id = ?').bind(page.agency_id));
  }
  await db.batch(stmts);
  return 'changed';
}

const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          label: { type: 'string', enum: Object.keys(CHANGE_LABELS) },
          title: { type: 'string', description: 'Under 12 words, e.g. "Published a Shopify case study for a fashion brand"' },
          summary: { type: 'string', description: 'One or two sentences' },
          is_opportunity: { type: 'boolean' },
          opportunity_reason: { type: 'string', nullable: true },
        },
        required: ['id', 'label', 'title', 'summary', 'is_opportunity'],
      },
    },
  },
  required: ['changes'],
};

// One AI call labels all unlabelled changes of an agency.
export async function labelChanges(db: D1Database, env: IntelEnv, agency: Agency): Promise<number> {
  const pending = (
    await db.prepare('SELECT * FROM web_changes WHERE agency_id = ? AND label IS NULL ORDER BY id LIMIT 6').bind(agency.id).all<WebChange>()
  ).results;
  if (!pending.length) return 0;
  const prompt = `${KILOWOTT_CONTEXT}

Below is newly added text found on pages of the website of ${agency.name}, a partner agency. Website content is public.
For each change, label what happened and decide if it is an opportunity for Kilowott. Opportunity signals:
- hiring developers, designers or marketers (they are short on capacity)
- launching a service Kilowott delivers (they will need delivery capacity)
- a new case study on a platform Kilowott covers (Shopify, WordPress, WooCommerce, Webflow, React, Laravel, HubSpot, etc.)
- a new website or rebrand (a natural reason to reconnect)
- expansion into a new market or a new offering
Label "other" for anything minor: wording tweaks, team photos, generic blog posts with no business signal, legal text.
A change_ratio near 1 on the home page usually means a new website.

${pending
  .map(
    (c) => `--- change id ${c.id} | page: ${c.page_kind} (${c.page_url}) | change_ratio: ${c.change_ratio.toFixed(2)}
${c.added_text.slice(0, 3000)}`,
  )
  .join('\n\n')}`;
  const out = await generateJson<{ changes?: { id: number; label: string; title: string; summary: string; is_opportunity: boolean; opportunity_reason?: string | null }[] }>(
    env,
    prompt,
    LABEL_SCHEMA,
  );
  const byId = new Map((out.changes ?? []).map((c) => [Number(c.id), c]));
  const stmts: D1PreparedStatement[] = [];
  let opportunity: string | null = null;
  for (const c of pending) {
    const r = byId.get(c.id);
    const label = r && r.label in CHANGE_LABELS ? r.label : 'other';
    const isOpp = !!r?.is_opportunity && label !== 'other';
    if (isOpp && !opportunity) opportunity = r?.opportunity_reason || r?.title || 'Website change';
    stmts.push(
      db
        .prepare(`UPDATE web_changes SET label = ?, title = ?, summary = ?, is_opportunity = ?, opportunity_reason = ?, labeled_at = datetime('now') WHERE id = ?`)
        .bind(label, r?.title ?? 'Website updated', r?.summary ?? null, isOpp ? 1 : 0, isOpp ? r?.opportunity_reason ?? null : null, c.id),
    );
  }
  if (opportunity) {
    // Next steps should reflect the news tomorrow morning.
    stmts.push(db.prepare('UPDATE agencies SET next_steps_updated_at = NULL WHERE id = ?').bind(agency.id));
  }
  await db.batch(stmts);
  if (opportunity) await suggestFromOpportunity(db, agency, opportunity);
  return pending.length;
}

// Agencies that have gone quiet get a "worth reopening?" suggestion. Engaged ones (Hot, Warm, Won) only get fresh next steps.
async function suggestFromOpportunity(db: D1Database, agency: Agency, reason: string): Promise<void> {
  const pending = await db.prepare(`SELECT id FROM suggestions WHERE agency_id = ? AND state = 'pending'`).bind(agency.id).first();
  if (pending) return;
  const text = reason;
  switch (agency.lead_status) {
    case 'Disqualified':
      await createSuggestion(db, agency, 'Email Sequence', 'Cold', `${text}. Worth reopening?`, 'web');
      break;
    case 'Cold':
    case 'Education':
    case 'Future fit':
      await createSuggestion(db, agency, statusForLead('Warm', agency.status), 'Warm', text, 'web');
      break;
  }
}

const INTEL_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One or two sentences on who they are and who they serve' },
    their_services: { type: 'array', items: { type: 'string' } },
    platforms: { type: 'array', items: { type: 'string' }, description: 'Technologies and platforms visible in their work' },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { service: { type: 'string' }, pitch: { type: 'string', description: 'One sentence on how to pitch it to them' } },
        required: ['service', 'pitch'],
      },
    },
    upsell: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          finding: { type: 'string', description: 'What their case studies or work show' },
          suggestion: { type: 'string', description: 'Where Kilowott can add capacity or resources' },
        },
        required: ['finding', 'suggestion'],
      },
    },
  },
  required: ['summary', 'their_services', 'platforms', 'gaps', 'upsell'],
};

// One AI call: their services, the Kilowott services they lack (pitch list), and upsell from their case studies.
export async function buildIntel(db: D1Database, env: IntelEnv, agency: Agency): Promise<boolean> {
  const pages = (await getPages(db, agency.id)).filter((p) => p.content_text);
  if (!pages.length) {
    // Nothing readable on the site; leave it out of the queue until a page yields text.
    await db.prepare('UPDATE agencies SET intel_stale = 0 WHERE id = ?').bind(agency.id).run();
    return false;
  }
  const order: PageKind[] = ['services', 'work', 'home', 'news', 'careers'];
  pages.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  const prompt = `${KILOWOTT_CONTEXT}

Here is text from the website of ${agency.name}, a partner agency${agency.country ? ` in ${agency.country}` : ''}. Websites may be in
any language; answer in English.

${pages.map((p) => `--- ${p.kind} page (${p.url})\n${(p.content_text ?? '').slice(0, 6000)}`).join('\n\n')}

1. Summarise who they are and who they serve.
2. List the services they offer, in short plain names.
3. List platforms and technologies visible in their work.
4. Gaps: Kilowott services (from the list above) they do NOT appear to offer, as a pitch list. Only include gaps that would make
   sense for this agency's clients. Base this only on the website; it may not list everything they do.
5. Upsell: from their case studies and work, where they likely need extra capacity or resources Kilowott can supply, even within
   services they already offer (e.g. many Shopify builds -> overflow Shopify developers via white-label delivery).
Keep each item short and specific. Use empty lists when the website gives too little to go on.`;
  const out = await generateJson<Record<string, unknown>>(env, prompt, INTEL_SCHEMA);
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const strings = (v: unknown) => list(v).filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, 20);
  const gaps = list(out.gaps).filter((g): g is Gap => !!g && typeof (g as Gap).service === 'string').slice(0, 10);
  const upsell = list(out.upsell).filter((u): u is Upsell => !!u && typeof (u as Upsell).finding === 'string').slice(0, 6);
  await db.batch([
    db
      .prepare(
        `INSERT INTO agency_intel (agency_id, summary, their_services, platforms, gaps, upsell, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(agency_id) DO UPDATE SET summary = excluded.summary, their_services = excluded.their_services, platforms = excluded.platforms,
         gaps = excluded.gaps, upsell = excluded.upsell, updated_at = excluded.updated_at`,
      )
      .bind(agency.id, typeof out.summary === 'string' ? out.summary : null, JSON.stringify(strings(out.their_services)), JSON.stringify(strings(out.platforms)), JSON.stringify(gaps), JSON.stringify(upsell)),
    db.prepare('UPDATE agencies SET intel_stale = 0 WHERE id = ?').bind(agency.id),
  ]);
  return true;
}

// ---------- scheduling ----------

export interface StepResult {
  done: boolean;
  message: string;
}

// One unit of work for a single agency; the Refresh button calls this repeatedly until done.
// `since` is when the refresh started: pages checked after it are not fetched again.
export async function refreshAgencyStep(db: D1Database, env: IntelEnv, agencyId: number, since: string): Promise<StepResult> {
  const agency = await getAgency(db, agencyId);
  if (!agency) return { done: true, message: 'Agency not found' };
  if (!agency.website) return { done: true, message: 'No website to check' };
  if (!agency.pages_discovered_at || agency.pages_discovered_at < since) {
    // A changed website URL or a manual refresh re-runs discovery.
    return { done: false, message: await discoverAgencyPages(db, agency) };
  }
  const page = await db
    .prepare(`SELECT * FROM watched_pages WHERE agency_id = ? AND (last_checked_at IS NULL OR last_checked_at < ?) ORDER BY id LIMIT 1`)
    .bind(agencyId, since)
    .first<WatchedPage>();
  if (page) {
    const r = await checkPage(db, page);
    return { done: false, message: `Checked ${page.kind} page: ${r}` };
  }
  try {
    const unlabeled = await db.prepare('SELECT 1 FROM web_changes WHERE agency_id = ? AND label IS NULL LIMIT 1').bind(agencyId).first();
    if (unlabeled) {
      await takeAiCall(db, env, false);
      return { done: false, message: `Labelled ${await labelChanges(db, env, agency)} changes` };
    }
    if (agency.intel_stale) {
      await takeAiCall(db, env, false);
      const ok = await buildIntel(db, env, agency);
      return { done: true, message: ok ? 'Intelligence updated' : 'Could not read any page' };
    }
  } catch (err) {
    if (err instanceof AiUnavailableError) return { done: true, message: err.message };
    throw err;
  }
  return { done: true, message: 'Up to date' };
}

// Agencies whose AI work failed recently are parked (see crawlTick) and skipped until the park expires.
const NOT_SKIPPED = `NOT EXISTS (SELECT 1 FROM job_locks l WHERE l.name = 'skip:' || a.id AND l.until > datetime('now'))`;

// Returns false when another run holds the lock. The lock expires on its own if a run dies.
async function acquireLock(db: D1Database, name: string, seconds: number): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO job_locks (name, until) VALUES (?, datetime('now', ?))
       ON CONFLICT(name) DO UPDATE SET until = excluded.until WHERE job_locks.until < datetime('now')
       RETURNING name`,
    )
    .bind(name, `+${seconds} seconds`)
    .first();
  return !!row;
}

async function releaseLock(db: D1Database, name: string): Promise<void> {
  await db.prepare('DELETE FROM job_locks WHERE name = ?').bind(name).run();
}

export async function runCrawlTick(db: D1Database, env: IntelEnv): Promise<string> {
  if (!(await acquireLock(db, 'crawl', 600))) return 'previous tick still running';
  try {
    return await crawlTick(db, env);
  } finally {
    await releaseLock(db, 'crawl');
  }
}

// One nightly tick. Order: discover new agencies, check pages not checked today, then AI work.
async function crawlTick(db: D1Database, env: IntelEnv): Promise<string> {
  const pagesPerTick = Number(env.CRAWL_PAGES_PER_TICK ?? '6') || 6;
  const aiPerTick = Number(env.CRAWL_AI_PER_TICK ?? '2') || 2;
  const reserve = Number(env.NEXT_STEPS_DAILY_LIMIT ?? '20') || 20;
  // Start of today's IST night run (18:00 UTC the previous evening) marks "checked tonight".
  const nightStart = new Date(Date.now() - 12 * 3600_000).toISOString().replace('T', ' ').slice(0, 19);
  let fetches = 0;
  const log: string[] = [];

  const toDiscover = (
    await db
      .prepare(`SELECT * FROM agencies WHERE website IS NOT NULL AND pages_discovered_at IS NULL ORDER BY id LIMIT ?`)
      .bind(pagesPerTick)
      .all<Agency>()
  ).results;
  for (const a of toDiscover) {
    log.push(`${a.name}: ${await discoverAgencyPages(db, a)}`);
    fetches++;
  }
  if (fetches < pagesPerTick) {
    const pages = (
      await db
        .prepare(
          `SELECT p.* FROM watched_pages p JOIN agencies a ON a.id = p.agency_id
           WHERE a.website IS NOT NULL AND (p.last_checked_at IS NULL OR p.last_checked_at < ?)
           ORDER BY p.last_checked_at IS NOT NULL, p.last_checked_at LIMIT ?`,
        )
        .bind(nightStart, pagesPerTick - fetches)
        .all<WatchedPage>()
    ).results;
    for (const p of pages) log.push(`page ${p.id}: ${await checkPage(db, p)}`);
  }

  for (let i = 0; i < aiPerTick; i++) {
    const labelFor = await db
      .prepare(
        `SELECT a.* FROM agencies a WHERE EXISTS (SELECT 1 FROM web_changes c WHERE c.agency_id = a.id AND c.label IS NULL)
         AND ${NOT_SKIPPED} LIMIT 1`,
      )
      .first<Agency>();
    const intelFor = labelFor
      ? null
      : await db
          .prepare(
            `SELECT a.* FROM agencies a WHERE a.intel_stale = 1 AND a.website IS NOT NULL
             AND EXISTS (SELECT 1 FROM watched_pages p WHERE p.agency_id = a.id AND p.content_text IS NOT NULL AND p.content_text != '')
             AND NOT EXISTS (SELECT 1 FROM watched_pages p WHERE p.agency_id = a.id AND p.last_checked_at IS NULL)
             AND ${NOT_SKIPPED}
             ORDER BY a.id LIMIT 1`,
          )
          .first<Agency>();
    const target = labelFor ?? intelFor;
    if (!target) break;
    if (!(await takeAiCall(db, env, true, reserve))) {
      log.push('AI daily budget reached (rest kept for the morning next steps)');
      break;
    }
    try {
      if (labelFor) log.push(`${target.name}: labelled ${await labelChanges(db, env, target)}`);
      else log.push(`${target.name}: intel ${(await buildIntel(db, env, target)) ? 'updated' : 'skipped'}`);
    } catch (err) {
      if (err instanceof AiUnavailableError) {
        // Park this agency for a few hours so one failing site cannot use up the night's AI calls.
        await db
          .prepare(`INSERT INTO job_locks (name, until) VALUES (?, datetime('now', '+6 hours')) ON CONFLICT(name) DO UPDATE SET until = excluded.until`)
          .bind(`skip:${target.id}`)
          .run();
        log.push(`${target.name}: ${err.message}`);
        break;
      }
      throw err;
    }
  }
  return log.join('; ') || 'nothing to do';
}

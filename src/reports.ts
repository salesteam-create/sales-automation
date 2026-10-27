// Dashboard, daily feed and the scheduled job (BRD sections 4E and 5).

import { suggestNextSteps, AiUnavailableError, type AiEnv } from './ai';
import { addDays } from './dates';
import { historyForAi, pendingSuggestions, saveNextSteps, type Agency, type Suggestion, type TimelineEntry } from './db';
import { CHANGE_LABELS, getChanges, getIntel, recentChanges, takeAiCall, type IntelEnv, type WebChange } from './intel';
import { STATUSES } from './rules';

export type Range = 'week' | 'month' | 'quarter' | 'all';

// Counts beside the sidebar items. Cheap enough to load on every page.
export interface Nav {
  today: number;
  agencies: number;
  importIssues: number;
}

export async function loadNav(db: D1Database, today: string): Promise<Nav> {
  const row = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM agencies WHERE next_followup_date IS NOT NULL AND next_followup_date <= ?) AS due,
              (SELECT COUNT(*) FROM agencies) AS total,
              (SELECT COUNT(*) FROM import_issues WHERE resolved = 0) AS issues`,
    )
    .bind(today)
    .first<{ due: number; total: number; issues: number }>();
  return { today: row?.due ?? 0, agencies: row?.total ?? 0, importIssues: row?.issues ?? 0 };
}

export function rangeStart(range: Range, today: string): string | null {
  switch (range) {
    case 'week':
      return addDays(today, -7);
    case 'month':
      return addDays(today, -30);
    case 'quarter':
      return addDays(today, -91);
    case 'all':
      return null;
  }
}

// "First met" = earliest meeting in the timeline; the dashboard date filter uses it.
const FIRST_MET = `(SELECT MIN(t.date) FROM timeline t WHERE t.agency_id = a.id AND t.type = 'meeting')`;

export interface Dashboard {
  pipeline: { status: string; count: number }[];
  countries: { country: string; total: number; byStatus: Record<string, number> }[];
  deals: Agency[];
  dealTotal: number;
  overdue: Agency[];
  dueToday: Agency[];
  suggestions: Suggestion[];
  webUpdates: WebChange[];
  activity: (TimelineEntry & { agency_name: string })[];
  total: number;
}

export async function loadDashboard(db: D1Database, range: Range, today: string): Promise<Dashboard> {
  const start = rangeStart(range, today);
  const rangeSql = start ? `WHERE ${FIRST_MET} >= ?` : '';
  const rangeBinds = start ? [start] : [];

  const [statusRows, countryRows, deals, overdue, dueToday, suggestions, webUpdates, activity] = await Promise.all([
    db.prepare(`SELECT a.status, COUNT(*) AS n FROM agencies a ${rangeSql} GROUP BY a.status`).bind(...rangeBinds).all<{ status: string; n: number }>(),
    db
      .prepare(`SELECT COALESCE(a.country, 'Unknown') AS country, a.status, COUNT(*) AS n FROM agencies a ${rangeSql} GROUP BY 1, 2`)
      .bind(...rangeBinds)
      .all<{ country: string; status: string; n: number }>(),
    db
      .prepare(
        `SELECT a.* FROM agencies a WHERE (a.lead_status = 'Hot' OR a.deal_description IS NOT NULL OR a.deal_value IS NOT NULL)
         ${start ? `AND ${FIRST_MET} >= ?` : ''} ORDER BY a.deal_value DESC NULLS LAST, a.name`,
      )
      .bind(...rangeBinds)
      .all<Agency>(),
    db.prepare(`SELECT * FROM agencies WHERE next_followup_date < ? ORDER BY next_followup_date, name`).bind(today).all<Agency>(),
    db.prepare(`SELECT * FROM agencies WHERE next_followup_date = ? ORDER BY name`).bind(today).all<Agency>(),
    pendingSuggestions(db),
    recentChanges(db),
    db
      .prepare(
        `SELECT t.*, a.name AS agency_name FROM timeline t JOIN agencies a ON a.id = t.agency_id
         WHERE t.source = 'app' ORDER BY COALESCE(t.date, substr(t.created_at, 1, 10)) DESC, t.created_at DESC LIMIT 8`,
      )
      .all<TimelineEntry & { agency_name: string }>(),
  ]);

  const counts = new Map(statusRows.results.map((r) => [r.status, r.n]));
  const pipeline = STATUSES.map((status) => ({ status, count: counts.get(status) ?? 0 }));

  const byCountry = new Map<string, { country: string; total: number; byStatus: Record<string, number> }>();
  for (const r of countryRows.results) {
    const c = byCountry.get(r.country) ?? { country: r.country, total: 0, byStatus: {} };
    c.total += r.n;
    c.byStatus[r.status] = r.n;
    byCountry.set(r.country, c);
  }

  return {
    pipeline,
    countries: [...byCountry.values()].sort((a, b) => b.total - a.total || a.country.localeCompare(b.country)),
    deals: deals.results,
    dealTotal: deals.results.reduce((sum, a) => sum + (a.deal_value ?? 0), 0),
    overdue: overdue.results,
    dueToday: dueToday.results,
    suggestions,
    webUpdates,
    activity: activity.results,
    total: pipeline.reduce((sum, p) => sum + p.count, 0),
  };
}

export interface Feed {
  overdue: Agency[];
  dueToday: Agency[];
  // Due in the next seven days, so Today can show what is coming without a second screen.
  upcoming: Agency[];
  completed: number;
  suggestions: Suggestion[];
  webUpdates: WebChange[];
}

export async function loadFeed(db: D1Database, today: string): Promise<Feed> {
  const weekAhead = addDays(today, 7);
  const weekBack = addDays(today, -6);
  const [overdue, dueToday, upcoming, completed, suggestions, webUpdates] = await Promise.all([
    db.prepare(`SELECT * FROM agencies WHERE next_followup_date < ? ORDER BY next_followup_date, name`).bind(today).all<Agency>(),
    db.prepare(`SELECT * FROM agencies WHERE next_followup_date = ? ORDER BY name`).bind(today).all<Agency>(),
    db
      .prepare(`SELECT * FROM agencies WHERE next_followup_date > ? AND next_followup_date <= ? ORDER BY next_followup_date, name`)
      .bind(today, weekAhead)
      .all<Agency>(),
    db.prepare(`SELECT COUNT(*) AS n FROM timeline WHERE type = 'followup' AND date >= ?`).bind(weekBack).first<{ n: number }>(),
    pendingSuggestions(db),
    recentChanges(db),
  ]);
  return {
    overdue: overdue.results,
    dueToday: dueToday.results,
    upcoming: upcoming.results,
    completed: completed?.n ?? 0,
    suggestions,
    webUpdates,
  };
}

// Website intelligence and recent changes, as plain text for the next-steps prompt. Website content is public.
async function intelForAi(db: D1Database, agencyId: number): Promise<string> {
  const [intel, changes] = await Promise.all([getIntel(db, agencyId), getChanges(db, agencyId, 5)]);
  const lines: string[] = [];
  if (intel) {
    if (intel.their_services.length) lines.push(`Their services: ${intel.their_services.join(', ')}`);
    if (intel.gaps.length) lines.push(`Kilowott services they lack: ${intel.gaps.map((g) => g.service).join(', ')}`);
    for (const u of intel.upsell) lines.push(`Upsell: ${u.finding} -> ${u.suggestion}`);
  }
  for (const c of changes.filter((c) => c.label && c.label !== 'other')) {
    lines.push(`${c.detected_at.slice(0, 10)} ${CHANGE_LABELS[c.label!] ?? c.label}: ${c.title}${c.is_opportunity ? ' (opportunity)' : ''}`);
  }
  return lines.join('\n');
}

export async function refreshNextSteps(db: D1Database, env: AiEnv, agency: Agency, today: string): Promise<string[]> {
  const steps = await suggestNextSteps(env, {
    agencyName: agency.name,
    status: agency.status,
    leadStatus: agency.lead_status,
    today,
    lastContact: agency.last_contact_date,
    nextFollowup: agency.next_followup_date,
    unanswered: agency.unanswered_count,
    deal: [agency.deal_description, agency.deal_value != null ? String(agency.deal_value) : null].filter(Boolean).join(', ') || null,
    history: await historyForAi(db, agency.id),
    intel: await intelForAi(db, agency.id),
  });
  await saveNextSteps(db, agency.id, steps);
  return steps;
}

// Daily job: refresh AI next steps only where something is new or due, to stay inside free AI limits.
export async function runDailyJob(db: D1Database, env: IntelEnv & { NEXT_STEPS_DAILY_LIMIT?: string }, today: string): Promise<{ refreshed: number; error?: string }> {
  const limit = Number(env.NEXT_STEPS_DAILY_LIMIT ?? '20') || 20;
  const candidates = await db
    .prepare(
      `SELECT * FROM agencies
       WHERE status != 'Not Interested'
         AND (next_steps_updated_at IS NULL OR (next_followup_date <= ? AND next_steps_updated_at < ?))
       ORDER BY CASE WHEN next_followup_date IS NULL THEN 1 ELSE 0 END, next_followup_date
       LIMIT ?`,
    )
    .bind(today, today, limit)
    .all<Agency>();
  let refreshed = 0;
  for (const agency of candidates.results) {
    if (!(await takeAiCall(db, env, true))) return { refreshed, error: 'AI daily budget reached' };
    try {
      await refreshNextSteps(db, env, agency, today);
      refreshed++;
    } catch (err) {
      if (err instanceof AiUnavailableError) return { refreshed, error: err.message };
      throw err;
    }
  }
  return { refreshed };
}

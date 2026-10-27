// Dashboard, daily feed and the scheduled job (BRD sections 4E and 5).

import { suggestNextSteps, AiUnavailableError, type AiEnv } from './ai';
import { addDays } from './dates';
import { historyForAi, pendingSuggestions, saveNextSteps, type Agency, type Suggestion, type TimelineEntry } from './db';
import { STATUSES } from './rules';

export type Range = 'week' | 'month' | 'quarter' | 'all';

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
}

export async function loadDashboard(db: D1Database, range: Range, today: string): Promise<Dashboard> {
  const start = rangeStart(range, today);
  const rangeSql = start ? `WHERE ${FIRST_MET} >= ?` : '';
  const rangeBinds = start ? [start] : [];

  const [statusRows, countryRows, deals, overdue, dueToday, suggestions] = await Promise.all([
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
  };
}

export interface Feed {
  overdue: Agency[];
  dueToday: Agency[];
  suggestions: Suggestion[];
  yesterday: (TimelineEntry & { agency_name: string })[];
}

// created_at is UTC; an IST day runs from 18:30 UTC the previous day.
function istDayToUtcRange(day: string): [string, string] {
  const start = new Date(Date.parse(day + 'T00:00:00+05:30')).toISOString().replace('T', ' ').slice(0, 19);
  const end = new Date(Date.parse(addDays(day, 1) + 'T00:00:00+05:30')).toISOString().replace('T', ' ').slice(0, 19);
  return [start, end];
}

export async function loadFeed(db: D1Database, today: string): Promise<Feed> {
  const [from, to] = istDayToUtcRange(addDays(today, -1));
  const [overdue, dueToday, suggestions, yesterday] = await Promise.all([
    db.prepare(`SELECT * FROM agencies WHERE next_followup_date < ? ORDER BY next_followup_date, name`).bind(today).all<Agency>(),
    db.prepare(`SELECT * FROM agencies WHERE next_followup_date = ? ORDER BY name`).bind(today).all<Agency>(),
    pendingSuggestions(db),
    db
      .prepare(
        `SELECT t.*, a.name AS agency_name FROM timeline t JOIN agencies a ON a.id = t.agency_id
         WHERE t.source = 'app' AND t.created_at >= ? AND t.created_at < ? ORDER BY t.created_at`,
      )
      .bind(from, to)
      .all<TimelineEntry & { agency_name: string }>(),
  ]);
  return { overdue: overdue.results, dueToday: dueToday.results, suggestions, yesterday: yesterday.results };
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
  });
  await saveNextSteps(db, agency.id, steps);
  return steps;
}

// Daily job: refresh AI next steps only where something is new or due, to stay inside free AI limits.
export async function runDailyJob(db: D1Database, env: AiEnv & { NEXT_STEPS_DAILY_LIMIT?: string }, today: string): Promise<{ refreshed: number; error?: string }> {
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

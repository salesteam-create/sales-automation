// Data access and the business actions that change an agency (follow-ups, status, notes).

import { redact } from './redact';
import {
  UNANSWERED_LIMIT,
  downgrade,
  isAllowedCombo,
  nextFollowupDate,
  statusForLead,
  type LeadStatus,
  type Status,
} from './rules';

export interface Agency {
  id: number;
  name: string;
  website: string | null;
  website_note: string | null;
  country: string | null;
  status: Status;
  lead_status: LeadStatus;
  framework: string | null;
  deal_description: string | null;
  deal_value: number | null;
  last_contact_date: string | null;
  next_followup_date: string | null;
  followup_step: number;
  unanswered_count: number;
  next_steps: string | null;
  next_steps_updated_at: string | null;
  pages_discovered_at: string | null;
  intel_stale: number;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: number;
  agency_id: number;
  name: string;
  role: string | null;
  email: string | null;
  linkedin: string | null;
}

export interface TimelineEntry {
  id: number;
  agency_id: number;
  date: string | null;
  type: string;
  raw_notes: string | null;
  summary: string | null;
  key_points: string | null;
  next_step: string | null;
  source: string;
  created_at: string;
}

export interface Suggestion {
  id: number;
  agency_id: number;
  agency_name?: string;
  from_status: Status;
  from_lead_status: LeadStatus;
  to_status: Status;
  to_lead_status: LeadStatus;
  reason: string;
  source: string;
  state: string;
  created_at: string;
}

export async function getAgency(db: D1Database, id: number): Promise<Agency | null> {
  return db.prepare('SELECT * FROM agencies WHERE id = ?').bind(id).first<Agency>();
}

export async function getContacts(db: D1Database, agencyId: number): Promise<Contact[]> {
  return (await db.prepare('SELECT * FROM contacts WHERE agency_id = ? ORDER BY id').bind(agencyId).all<Contact>()).results;
}

export async function getTimeline(db: D1Database, agencyId: number): Promise<TimelineEntry[]> {
  return (
    await db
      .prepare('SELECT * FROM timeline WHERE agency_id = ? ORDER BY COALESCE(date, \'0000\') DESC, id DESC')
      .bind(agencyId)
      .all<TimelineEntry>()
  ).results;
}

// Redacted history for AI prompts.
export async function historyForAi(db: D1Database, agencyId: number, limit = 10): Promise<string> {
  const [entries, contacts] = await Promise.all([getTimeline(db, agencyId), getContacts(db, agencyId)]);
  const names = contacts.map((c) => c.name);
  return entries
    .slice(0, limit)
    .map((e) => `${e.date ?? 'undated'} [${e.type}] ${redact(e.summary || e.raw_notes || '', names)}`)
    .join('\n');
}

export interface AgencyFilters {
  q?: string;
  status?: string;
  lead?: string;
  country?: string;
  overdue?: boolean;
  today: string;
}

export async function listAgencies(db: D1Database, f: AgencyFilters): Promise<Agency[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (f.q) {
    where.push('(name LIKE ? OR id IN (SELECT agency_id FROM contacts WHERE name LIKE ?))');
    binds.push(`%${f.q}%`, `%${f.q}%`);
  }
  if (f.status) {
    where.push('status = ?');
    binds.push(f.status);
  }
  if (f.lead) {
    where.push('lead_status = ?');
    binds.push(f.lead);
  }
  if (f.country) {
    where.push('country = ?');
    binds.push(f.country);
  }
  if (f.overdue) {
    where.push('next_followup_date < ?');
    binds.push(f.today);
  }
  const sql = `SELECT * FROM agencies ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE WHEN next_followup_date IS NULL THEN 1 ELSE 0 END, next_followup_date, name`;
  return (await db.prepare(sql).bind(...binds).all<Agency>()).results;
}

export async function listCountries(db: D1Database): Promise<string[]> {
  const rows = await db.prepare('SELECT DISTINCT country FROM agencies WHERE country IS NOT NULL ORDER BY country').all<{ country: string }>();
  return rows.results.map((r) => r.country);
}

export interface NewEntry {
  date: string;
  type: string;
  raw_notes: string;
  summary: string | null;
  key_points: object | null;
  next_step: string | null;
  next_step_date: string | null;
}

// Logging a conversation resets the follow-up cycle. A date named in the notes beats the standard timing.
export async function logConversation(db: D1Database, agency: Agency, entry: NewEntry): Promise<void> {
  const lastContact = !agency.last_contact_date || entry.date > agency.last_contact_date ? entry.date : agency.last_contact_date;
  const next = entry.next_step_date ?? nextFollowupDate(lastContact, agency.lead_status, agency.status, 0);
  await db.batch([
    db
      .prepare(
        `INSERT INTO timeline (agency_id, date, type, raw_notes, summary, key_points, next_step) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(agency.id, entry.date, entry.type, entry.raw_notes, entry.summary, entry.key_points ? JSON.stringify(entry.key_points) : null, entry.next_step),
    db
      .prepare(
        `UPDATE agencies SET last_contact_date = ?, next_followup_date = ?, followup_step = 0, unanswered_count = 0,
         next_steps_updated_at = NULL, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(lastContact, next, agency.id),
  ]);
}

export async function changeStatus(
  db: D1Database,
  agency: Agency,
  status: Status,
  lead: LeadStatus,
  reason: string | null,
  today: string,
): Promise<void> {
  if (!isAllowedCombo(status, lead)) throw new Error(`"${status}" + "${lead}" is not an allowed combination.`);
  if (status === agency.status && lead === agency.lead_status) return;
  // A new lead status starts a fresh follow-up cycle from today, but never pushes back a follow-up
  // that is already planned sooner (e.g. a date taken from meeting notes).
  const cycle = nextFollowupDate(today, lead, status, 0);
  const planned = agency.next_followup_date && agency.next_followup_date >= today ? agency.next_followup_date : null;
  const next = cycle && planned && planned < cycle ? planned : cycle;
  const text = `${agency.status} / ${agency.lead_status} → ${status} / ${lead}${reason ? `. Reason: ${reason}` : ''}`;
  await db.batch([
    db.prepare(`INSERT INTO timeline (agency_id, date, type, raw_notes) VALUES (?, ?, 'status_change', ?)`).bind(agency.id, today, text),
    db
      .prepare(
        `UPDATE agencies SET status = ?, lead_status = ?, next_followup_date = ?, followup_step = 0, unanswered_count = 0,
         next_steps_updated_at = NULL, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(status, lead, next, agency.id),
    // Any pending suggestion is now out of date.
    db.prepare(`UPDATE suggestions SET state = 'dismissed', resolved_at = datetime('now') WHERE agency_id = ? AND state = 'pending'`).bind(agency.id),
  ]);
}

export async function markFollowupDone(db: D1Database, agency: Agency, replied: boolean, note: string, today: string): Promise<void> {
  const step = replied ? 0 : agency.followup_step + 1;
  const unanswered = replied ? 0 : agency.unanswered_count + 1;
  const next = nextFollowupDate(today, agency.lead_status, agency.status, step);
  const text = `Follow-up sent${replied ? ', they replied' : ', no reply yet'}${note ? `. ${note}` : ''}`;
  await db.batch([
    db.prepare(`INSERT INTO timeline (agency_id, date, type, raw_notes) VALUES (?, ?, 'followup', ?)`).bind(agency.id, today, text),
    db
      .prepare(
        `UPDATE agencies SET next_followup_date = ?, followup_step = ?, unanswered_count = ?,
         last_contact_date = CASE WHEN ? THEN ? ELSE last_contact_date END, updated_at = datetime('now') WHERE id = ?`,
      )
      .bind(next, step, unanswered, replied ? 1 : 0, today, agency.id),
  ]);
  if (unanswered >= UNANSWERED_LIMIT) await suggestDowngrade(db, { ...agency, unanswered_count: unanswered });
}

export async function suggestDowngrade(db: D1Database, agency: Agency): Promise<void> {
  const lead = downgrade(agency.lead_status);
  if (!lead) return;
  const pending = await db
    .prepare(`SELECT id FROM suggestions WHERE agency_id = ? AND state = 'pending' AND source = 'no_reply'`)
    .bind(agency.id)
    .first();
  if (pending) return;
  await createSuggestion(db, agency, statusForLead(lead, agency.status), lead, `${agency.unanswered_count} follow-ups with no reply.`, 'no_reply');
}

export async function createSuggestion(
  db: D1Database,
  agency: Agency,
  status: Status,
  lead: LeadStatus,
  reason: string,
  source: 'ai_note' | 'no_reply' | 'web',
): Promise<void> {
  if (!isAllowedCombo(status, lead)) status = statusForLead(lead, status);
  if (status === agency.status && lead === agency.lead_status) return;
  await db
    .prepare(
      `INSERT INTO suggestions (agency_id, from_status, from_lead_status, to_status, to_lead_status, reason, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(agency.id, agency.status, agency.lead_status, status, lead, reason, source)
    .run();
}

export async function pendingSuggestions(db: D1Database, agencyId?: number): Promise<Suggestion[]> {
  const sql = `SELECT s.*, a.name AS agency_name FROM suggestions s JOIN agencies a ON a.id = s.agency_id
    WHERE s.state = 'pending' ${agencyId ? 'AND s.agency_id = ?' : ''} ORDER BY s.created_at`;
  const stmt = agencyId ? db.prepare(sql).bind(agencyId) : db.prepare(sql);
  return (await stmt.all<Suggestion>()).results;
}

export async function resolveSuggestion(db: D1Database, id: number, accept: boolean, today: string): Promise<number | null> {
  const s = await db.prepare(`SELECT * FROM suggestions WHERE id = ? AND state = 'pending'`).bind(id).first<Suggestion>();
  if (!s) return null;
  if (accept) {
    const agency = await getAgency(db, s.agency_id);
    if (agency) await changeStatus(db, agency, s.to_status, s.to_lead_status, `Accepted suggestion: ${s.reason}`, today);
  }
  await db
    .prepare(`UPDATE suggestions SET state = ?, resolved_at = datetime('now') WHERE id = ?`)
    .bind(accept ? 'accepted' : 'dismissed', id)
    .run();
  return s.agency_id;
}

export async function setNextFollowup(db: D1Database, agencyId: number, day: string | null): Promise<void> {
  await db.prepare(`UPDATE agencies SET next_followup_date = ?, updated_at = datetime('now') WHERE id = ?`).bind(day, agencyId).run();
}

export async function saveNextSteps(db: D1Database, agencyId: number, steps: string[]): Promise<void> {
  await db
    .prepare(`UPDATE agencies SET next_steps = ?, next_steps_updated_at = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(steps), agencyId)
    .run();
}

// After a timeline entry is edited or deleted, last contact follows the latest real conversation.
export async function recomputeLastContact(db: D1Database, agencyId: number): Promise<void> {
  await db
    .prepare(
      `UPDATE agencies SET last_contact_date = (
         SELECT MAX(date) FROM timeline WHERE agency_id = ? AND type != 'status_change' AND date IS NOT NULL
       ), updated_at = datetime('now') WHERE id = ?`,
    )
    .bind(agencyId, agencyId)
    .run();
}

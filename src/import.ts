// One-time import of Chabert's tab, exported from Google Sheets as CSV (BRD section 7).

import { addDays, isValidDay } from './dates';
import {
  LEAD_PRIORITY,
  isAllowedCombo,
  nextFollowupDate,
  statusForLead,
  type LeadStatus,
  type Status,
} from './rules';

export interface ImportEntry {
  date: string | null;
  type: 'meeting' | 'note';
  raw_notes: string;
}

export interface ImportedAgency {
  key: string;
  name: string;
  website: string | null;
  website_note: string | null;
  country: string | null;
  status: Status;
  lead_status: LeadStatus;
  framework: string | null;
  contacts: string[];
  entries: ImportEntry[];
  rows: number[];
  last_contact_date: string | null;
  next_followup_date: string | null;
}

export interface ImportIssue {
  agency_key: string | null;
  row_number: number;
  kind: 'bad_combo' | 'bad_date' | 'future_date' | 'duplicate' | 'unknown_value';
  detail: string;
}

export interface ImportPlan {
  agencies: ImportedAgency[];
  issues: ImportIssue[];
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const STATUS_MAP: Record<string, Status> = {
  won: 'Won',
  opportunity: 'Opportunity',
  'potential (warm)': 'Potential (Warm)',
  'potential warm': 'Potential (Warm)',
  'email sequence': 'Email Sequence',
  'not interested': 'Not Interested',
};

const LEAD_MAP: Record<string, LeadStatus> = {
  'hot lead': 'Hot',
  hot: 'Hot',
  'warm lead': 'Warm',
  warm: 'Warm',
  'education lead': 'Education',
  education: 'Education',
  'future fit lead': 'Future fit',
  'future fit': 'Future fit',
  'cold lead': 'Cold',
  cold: 'Cold',
  disqualified: 'Disqualified',
};

const COUNTRY_FIXES: Record<string, string> = {
  netherland: 'Netherlands',
  nz: 'New Zealand',
  uk: 'UK',
  usa: 'USA',
  us: 'USA',
};

export function normalizeCountry(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t) return null;
  const fixed = COUNTRY_FIXES[t.toLowerCase()];
  if (fixed) return fixed;
  return t
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

export function agencyKey(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "Mar week 2" -> 2026-03-08. The sheet's week columns have no year; BRD assumes 2026.
export function weekColumnDate(header: string, year: number): string | null {
  const m = /^\s*([a-z]{3})[a-z]*\s+week\s+(\d)\s*$/i.exec(header);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  const day = 1 + (Number(m[2]) - 1) * 7;
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export interface ParsedDate {
  day: string | null;
  note?: string; // set when the value was corrected or unusable
  kind?: 'bad_date' | 'future_date';
}

// Sheet dates are day/month/year. Typos in the year are corrected when the intent is clear.
export function parseSheetDate(raw: string, today: string): ParsedDate {
  const parts = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const last = parts.at(-1);
  if (!last) return { day: null };
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(last);
  if (!m) return { day: null, note: `Unreadable date "${raw.trim()}"`, kind: 'bad_date' };
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let yStr = m[3];
  let note: string | undefined;
  let kind: ParsedDate['kind'];
  const thisYear = Number(today.slice(0, 4));
  if (yStr.length === 2) yStr = '20' + yStr;
  else if (yStr.length === 3) {
    note = `Year "${m[3]}" looks like a typo, read as ${thisYear}`;
    kind = 'bad_date';
    yStr = String(thisYear);
  }
  let day = `${yStr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!isValidDay(day)) return { day: null, note: `Invalid date "${raw.trim()}"`, kind: 'bad_date' };
  if (day > today) {
    const corrected = `${thisYear}${day.slice(4)}`;
    if (corrected <= today) {
      note = `Future date ${day} read as ${corrected}`;
      kind = 'future_date';
      day = corrected;
    } else {
      return { day: null, note: `Date ${day} is in the future`, kind: 'future_date' };
    }
  }
  if (parts.length > 1) {
    note = (note ? note + '; ' : '') + 'Several dates in one cell, used the last one';
    kind ??= 'bad_date';
  }
  return { day, note, kind };
}

interface Columns {
  agency: number;
  date: number;
  country: number;
  name: number;
  comment: number;
  status: number;
  lead: number;
  framework: number;
  website: number;
  weeks: { index: number; date: string; header: string }[];
}

function findColumns(header: string[], year: number): Columns {
  const norm = header.map((h) => h.trim().toLowerCase());
  const find = (...names: string[]) => norm.findIndex((h) => names.includes(h));
  const weeks: Columns['weeks'] = [];
  header.forEach((h, index) => {
    const date = weekColumnDate(h, year);
    if (date) weeks.push({ index, date, header: h.trim() });
  });
  const cols = {
    agency: find('agency'),
    date: find('meeting date', 'date'),
    country: find('country'),
    name: find('name'),
    comment: find('comment'),
    status: find('status'),
    lead: find('lead status'),
    framework: find('framework'),
    website: find('website'),
    weeks,
  };
  if (cols.agency < 0 || cols.status < 0 || cols.lead < 0) {
    throw new Error('CSV must have Agency, Status and Lead Status columns. Export the Chabert tab as CSV.');
  }
  return cols;
}

export interface PlanOptions {
  today: string;
  weekYear?: number;
  catchUpPerDay?: number;
}

export function buildImportPlan(csv: string, opts: PlanOptions): ImportPlan {
  const { today } = opts;
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error('The CSV has no data rows.');
  const cols = findColumns(rows[0], opts.weekYear ?? 2026);
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');

  const byKey = new Map<string, ImportedAgency & { latestRowDate: string | null }>();
  // The same website under a slightly different name ("LD Media" vs "LD Media - Agentur") is the same agency.
  const keyByHost = new Map<string, string>();
  const issues: ImportIssue[] = [];

  rows.slice(1).forEach((row, i) => {
    const rowNumber = i + 2; // spreadsheet row number
    const name = cell(row, cols.agency).replace(/\s+/g, ' ');
    if (!name) return;
    const key = agencyKey(name);

    const rawStatus = cell(row, cols.status);
    const rawLead = cell(row, cols.lead);
    let status = STATUS_MAP[rawStatus.toLowerCase()];
    let lead = LEAD_MAP[rawLead.toLowerCase()];
    if (!lead) {
      lead = status === 'Not Interested' ? 'Disqualified' : 'Future fit';
      issues.push({ agency_key: key, row_number: rowNumber, kind: 'unknown_value', detail: `Lead Status "${rawLead}" not recognised, set to ${lead}` });
    }
    if (!status) {
      status = statusForLead(lead, 'Potential (Warm)');
      issues.push({ agency_key: key, row_number: rowNumber, kind: 'unknown_value', detail: `Status "${rawStatus}" not recognised, set to ${status}` });
    }
    if (!isAllowedCombo(status, lead)) {
      const fixed = statusForLead(lead, status);
      issues.push({
        agency_key: key,
        row_number: rowNumber,
        kind: 'bad_combo',
        detail: `"${status}" + "${lead}" is not an allowed combination. Status set to "${fixed}" (Lead Status kept). Please check.`,
      });
      status = fixed;
    }

    const parsed = parseSheetDate(cell(row, cols.date), today);
    if (parsed.note) {
      issues.push({ agency_key: key, row_number: rowNumber, kind: parsed.kind ?? 'bad_date', detail: parsed.note });
    }

    const entries: ImportEntry[] = [];
    const comment = cell(row, cols.comment);
    entries.push({ date: parsed.day, type: 'meeting', raw_notes: comment || '(No comment in sheet)' });
    for (const w of cols.weeks) {
      const v = cell(row, w.index);
      if (v) entries.push({ date: w.date, type: 'note', raw_notes: `Weekly log (${w.header}): ${v}` });
    }

    const rawWebsite = cell(row, cols.website);
    let website: string | null = null;
    let websiteNote: string | null = null;
    if (/linkedin\.com/i.test(rawWebsite)) websiteNote = `LinkedIn only: ${rawWebsite}`;
    else if (/^https?:\/\//i.test(rawWebsite)) website = rawWebsite;
    else if (rawWebsite) websiteNote = rawWebsite;

    const fw = cell(row, cols.framework).toLowerCase();
    const framework = fw === 'sent' ? 'Sent' : fw === 'to send' ? 'To send' : fw === 'not needed' ? 'Not needed' : null;
    const contact = cell(row, cols.name).replace(/\s+/g, ' ');

    const host = website ? websiteHost(website) : null;
    const hostKey = host ? keyByHost.get(host) : undefined;
    const existing = byKey.get(key) ?? (hostKey ? byKey.get(hostKey) : undefined);
    if (existing) {
      issues.push({
        agency_key: existing.key,
        row_number: rowNumber,
        kind: 'duplicate',
        detail: `"${name}" looks like "${existing.name}" in row ${existing.rows[0]} (same name or website). Merged into one record; check country and status.`,
      });
      existing.rows.push(rowNumber);
      existing.entries.push(...entries);
      if (contact && !existing.contacts.includes(contact)) existing.contacts.push(contact);
      existing.website ??= website;
      existing.website_note = existing.website ? null : existing.website_note ?? websiteNote;
      existing.framework ??= framework;
      existing.country ??= normalizeCountry(cell(row, cols.country));
      // The most recent meeting decides the status.
      if (parsed.day && (!existing.latestRowDate || parsed.day >= existing.latestRowDate)) {
        existing.status = status;
        existing.lead_status = lead;
        existing.latestRowDate = parsed.day;
      }
      return;
    }

    if (host) keyByHost.set(host, key);
    byKey.set(key, {
      key,
      name,
      website,
      website_note: website ? null : websiteNote,
      country: normalizeCountry(cell(row, cols.country)),
      status,
      lead_status: lead,
      framework,
      contacts: contact ? [contact] : [],
      entries,
      rows: [rowNumber],
      last_contact_date: null,
      next_followup_date: null,
      latestRowDate: parsed.day,
    });
  });

  const agencies = [...byKey.values()].map(({ latestRowDate: _ignored, ...a }) => a);
  for (const a of agencies) {
    const dates = a.entries.map((e) => e.date).filter((d): d is string => !!d).sort();
    a.last_contact_date = dates.at(-1) ?? null;
  }
  scheduleImportFollowups(agencies, today, opts.catchUpPerDay ?? 10);
  return { agencies, issues };
}

function websiteHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function isWeekend(day: string): boolean {
  const dow = new Date(day + 'T00:00:00Z').getUTCDay();
  return dow === 0 || dow === 6;
}

// Follow-ups that would already be overdue on import day are spread over the coming working days,
// most valuable first, so day one is not a wall of 150 overdue items.
export function scheduleImportFollowups(agencies: ImportedAgency[], today: string, perDay: number): void {
  const overdue: ImportedAgency[] = [];
  for (const a of agencies) {
    const natural = nextFollowupDate(a.last_contact_date ?? today, a.lead_status, a.status, 0);
    if (natural === null) a.next_followup_date = null;
    else if (natural >= today) a.next_followup_date = natural;
    else overdue.push(a);
  }
  overdue.sort(
    (x, y) =>
      Number(y.status === 'Won') - Number(x.status === 'Won') ||
      LEAD_PRIORITY[x.lead_status] - LEAD_PRIORITY[y.lead_status] ||
      (x.last_contact_date ?? '').localeCompare(y.last_contact_date ?? ''),
  );
  let day = today;
  let usedToday = 0;
  for (const a of overdue) {
    while (isWeekend(day) || usedToday >= perDay) {
      day = addDays(day, 1);
      usedToday = 0;
    }
    a.next_followup_date = day;
    usedToday++;
  }
}

// Statements that write a plan into an empty database.
export function planStatements(db: D1Database, plan: ImportPlan): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  const idByKey = new Map<string, number>();
  plan.agencies.forEach((a, i) => {
    const id = i + 1;
    idByKey.set(a.key, id);
    stmts.push(
      db
        .prepare(
          `INSERT INTO agencies (id, name, website, website_note, country, status, lead_status, framework, last_contact_date, next_followup_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, a.name, a.website, a.website_note, a.country, a.status, a.lead_status, a.framework, a.last_contact_date, a.next_followup_date),
    );
    for (const c of a.contacts) {
      stmts.push(db.prepare('INSERT INTO contacts (agency_id, name) VALUES (?, ?)').bind(id, c));
    }
    for (const e of a.entries) {
      stmts.push(
        db
          .prepare(`INSERT INTO timeline (agency_id, date, type, raw_notes, source) VALUES (?, ?, ?, ?, 'import')`)
          .bind(id, e.date, e.type, e.raw_notes),
      );
    }
  });
  for (const issue of plan.issues) {
    stmts.push(
      db
        .prepare('INSERT INTO import_issues (agency_id, row_number, kind, detail) VALUES (?, ?, ?, ?)')
        .bind(issue.agency_key ? idByKey.get(issue.agency_key) ?? null : null, issue.row_number, issue.kind, issue.detail),
    );
  }
  return stmts;
}

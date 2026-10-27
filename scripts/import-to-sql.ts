// Turns an exported Chabert tab (CSV) into a SQL file for `wrangler d1 execute --file`,
// for when uploading through the app's Import page is not possible. It replaces all existing data.
// Usage: node scripts/import-to-sql.mjs <file.csv> <out.sql> [today YYYY-MM-DD]

import { readFileSync, writeFileSync } from 'node:fs';
import { buildImportPlan } from '../src/import';
import { todayIST } from '../src/dates';

const [csvPath, outPath, todayArg] = process.argv.slice(2);
if (!csvPath || !outPath) {
  console.error('Usage: node scripts/import-to-sql.mjs <file.csv> <out.sql> [today]');
  process.exit(1);
}

const sql = (v: string | number | null) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);
const plan = buildImportPlan(readFileSync(csvPath, 'utf8'), { today: todayArg ?? todayIST() });

const lines: string[] = [];
for (const t of ['web_changes', 'agency_intel', 'watched_pages', 'import_issues', 'suggestions', 'timeline', 'contacts', 'agencies']) {
  lines.push(`DELETE FROM ${t};`);
}
const idByKey = new Map<string, number>();
plan.agencies.forEach((a, i) => {
  const id = i + 1;
  idByKey.set(a.key, id);
  lines.push(
    `INSERT INTO agencies (id, name, website, website_note, country, status, lead_status, framework, last_contact_date, next_followup_date) VALUES (${[
      id, a.name, a.website, a.website_note, a.country, a.status, a.lead_status, a.framework, a.last_contact_date, a.next_followup_date,
    ].map(sql).join(', ')});`,
  );
  for (const c of a.contacts) lines.push(`INSERT INTO contacts (agency_id, name) VALUES (${id}, ${sql(c)});`);
  for (const e of a.entries) {
    lines.push(`INSERT INTO timeline (agency_id, date, type, raw_notes, source) VALUES (${id}, ${sql(e.date)}, ${sql(e.type)}, ${sql(e.raw_notes)}, 'import');`);
  }
});
for (const i of plan.issues) {
  const agencyId = i.agency_key ? idByKey.get(i.agency_key) ?? null : null;
  lines.push(`INSERT INTO import_issues (agency_id, row_number, kind, detail) VALUES (${sql(agencyId)}, ${i.row_number}, ${sql(i.kind)}, ${sql(i.detail)});`);
}
writeFileSync(outPath, lines.join('\n') + '\n');

const count = (f: (a: (typeof plan.agencies)[number]) => boolean) => plan.agencies.filter(f).length;
const kinds: Record<string, number> = {};
for (const i of plan.issues) kinds[i.kind] = (kinds[i.kind] ?? 0) + 1;
console.log(JSON.stringify({
  agencies: plan.agencies.length,
  withWebsite: count((a) => !!a.website),
  noWebsite: count((a) => !a.website),
  timelineEntries: plan.agencies.reduce((n, a) => n + a.entries.length, 0),
  issues: kinds,
  followupsByDay: Object.fromEntries(
    Object.entries(plan.agencies.reduce<Record<string, number>>((m, a) => ((m[a.next_followup_date ?? 'none'] = (m[a.next_followup_date ?? 'none'] ?? 0) + 1), m), {}))
      .sort()
      .slice(0, 12),
  ),
}, null, 1));

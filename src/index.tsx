import { Hono, type Context } from 'hono';
import { AiUnavailableError, analyzeNote, type NoteAnalysis } from './ai';
import { addDays, isValidDay, todayIST } from './dates';
import {
  changeStatus,
  createSuggestion,
  getAgency,
  getContacts,
  getTimeline,
  historyForAi,
  listAgencies,
  listCountries,
  logConversation,
  markFollowupDone,
  pendingSuggestions,
  resolveSuggestion,
  setNextFollowup,
} from './db';
import { buildImportPlan, planStatements } from './import';
import { getChanges, getIntel, getPages, refreshAgencyStep, runCrawlTick, type IntelEnv } from './intel';
import { redact } from './redact';
import { loadDashboard, loadFeed, refreshNextSteps, runDailyJob, type Range } from './reports';
import { PAGE_KINDS } from './web';
import { FRAMEWORK_OPTIONS, isAllowedCombo, isLeadStatus, isStatus, nextFollowupDate, statusForLead } from './rules';
import {
  AgencyListPage,
  AgencyPage,
  DashboardPage,
  FeedPage,
  ImportPage,
  ImportReportPage,
  LogPage,
  NewAgencyPage,
  ReviewPage,
  type ImportIssueRow,
} from './views/pages';

export interface Env extends IntelEnv {
  DB: D1Database;
  CURRENCY: string;
  NEXT_STEPS_DAILY_LIMIT?: string;
}

// Must match the crons in wrangler.toml.
const CRAWL_CRON = '*/2 18-23,0 * * *';

const app = new Hono<{ Bindings: Env }>();

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const orNull = (v: unknown) => str(v) || null;

// Only allow redirects back into this app.
function back(c: Context, fallback: string, value: unknown, msg?: string): Response {
  const target = str(value).startsWith('/') && !str(value).startsWith('//') ? str(value) : fallback;
  const url = msg ? `${target}${target.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : target;
  return c.redirect(url, 303);
}

async function loadAgencyOr404(c: Context<{ Bindings: Env }>) {
  const id = Number(c.req.param('id'));
  return Number.isInteger(id) ? getAgency(c.env.DB, id) : null;
}

// ---------- pages ----------

app.get('/', async (c) => {
  const today = todayIST();
  return c.html(<FeedPage feed={await loadFeed(c.env.DB, today)} today={today} msg={c.req.query('msg')} />);
});

app.get('/dashboard', async (c) => {
  const today = todayIST();
  const q = c.req.query('range');
  const range: Range = q === 'week' || q === 'month' || q === 'quarter' ? q : 'all';
  return c.html(<DashboardPage d={await loadDashboard(c.env.DB, range, today)} range={range} today={today} currency={c.env.CURRENCY} />);
});

app.get('/agencies', async (c) => {
  const today = todayIST();
  const filters = {
    q: c.req.query('q') || undefined,
    status: c.req.query('status') || undefined,
    lead: c.req.query('lead') || undefined,
    country: c.req.query('country') || undefined,
    overdue: c.req.query('overdue') === '1',
  };
  const [agencies, countries] = await Promise.all([listAgencies(c.env.DB, { ...filters, today }), listCountries(c.env.DB)]);
  return c.html(<AgencyListPage agencies={agencies} countries={countries} filters={filters} today={today} />);
});

app.get('/agencies/new', (c) => c.html(<NewAgencyPage />));

app.post('/agencies', async (c) => {
  const f = await c.req.parseBody();
  const name = str(f.name);
  const status = f.status;
  const lead = f.lead_status;
  if (!name || !isStatus(status) || !isLeadStatus(lead) || !isAllowedCombo(status, lead)) {
    return c.html(<NewAgencyPage error="Please give a name and an allowed Status / Lead Status combination." />, 400);
  }
  const today = todayIST();
  const row = await c.env.DB.prepare(
    `INSERT INTO agencies (name, website, country, status, lead_status, next_followup_date) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(name, orNull(f.website), orNull(f.country), status, lead, nextFollowupDate(today, lead, status, 0))
    .first<{ id: number }>();
  if (str(f.contact_name)) {
    await c.env.DB.prepare('INSERT INTO contacts (agency_id, name) VALUES (?, ?)').bind(row!.id, str(f.contact_name)).run();
  }
  return c.redirect(`/agencies/${row!.id}/log`, 303);
});

app.get('/agencies/:id', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const db = c.env.DB;
  const [contacts, timeline, suggestions, issues, intel, pages, changes] = await Promise.all([
    getContacts(db, agency.id),
    getTimeline(db, agency.id),
    pendingSuggestions(db, agency.id),
    db
      .prepare(`SELECT i.*, NULL AS agency_name FROM import_issues i WHERE agency_id = ? AND resolved = 0 ORDER BY id`)
      .bind(agency.id)
      .all<ImportIssueRow>(),
    getIntel(db, agency.id),
    getPages(db, agency.id),
    getChanges(db, agency.id),
  ]);
  return c.html(
    <AgencyPage
      agency={agency}
      contacts={contacts}
      timeline={timeline}
      suggestions={suggestions}
      issues={issues.results}
      intel={intel}
      pages={pages}
      changes={changes}
      today={todayIST()}
      currency={c.env.CURRENCY}
      msg={c.req.query('msg')}
      error={c.req.query('error')}
    />,
  );
});

app.post('/agencies/:id/edit', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const f = await c.req.parseBody();
  const framework = (FRAMEWORK_OPTIONS as readonly string[]).includes(str(f.framework)) ? str(f.framework) : null;
  const value = str(f.deal_value) === '' ? null : Number(f.deal_value);
  const website = orNull(f.website);
  if (website !== agency.website) {
    // A new website means new pages to find and a fresh scan.
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM watched_pages WHERE agency_id = ?').bind(agency.id),
      c.env.DB.prepare('UPDATE agencies SET pages_discovered_at = NULL, intel_stale = 1 WHERE id = ?').bind(agency.id),
    ]);
  }
  await c.env.DB.prepare(
    `UPDATE agencies SET name = ?, website = ?, country = ?, framework = ?, deal_description = ?, deal_value = ?,
     updated_at = datetime('now') WHERE id = ?`,
  )
    .bind(str(f.name) || agency.name, website, orNull(f.country), framework, orNull(f.deal_description), Number.isFinite(value) ? value : null, agency.id)
    .run();
  return back(c, `/agencies/${agency.id}`, '', 'Details saved.');
});

app.post('/agencies/:id/contacts', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const f = await c.req.parseBody();
  if (str(f.name)) {
    await c.env.DB.prepare('INSERT INTO contacts (agency_id, name, role, email, linkedin) VALUES (?, ?, ?, ?, ?)')
      .bind(agency.id, str(f.name), orNull(f.role), orNull(f.email), orNull(f.linkedin))
      .run();
  }
  return back(c, `/agencies/${agency.id}`, '', 'Contact added.');
});

app.post('/contacts/:cid/delete', async (c) => {
  const row = await c.env.DB.prepare('DELETE FROM contacts WHERE id = ? RETURNING agency_id').bind(Number(c.req.param('cid'))).first<{ agency_id: number }>();
  return back(c, row ? `/agencies/${row.agency_id}` : '/agencies', '', 'Contact removed.');
});

app.post('/agencies/:id/status', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const f = await c.req.parseBody();
  if (!isStatus(f.status) || !isLeadStatus(f.lead_status) || !isAllowedCombo(f.status, f.lead_status)) {
    return c.redirect(`/agencies/${agency.id}?error=${encodeURIComponent('That Status / Lead Status combination is not allowed.')}`, 303);
  }
  await changeStatus(c.env.DB, agency, f.status, f.lead_status, orNull(f.reason), todayIST());
  return back(c, `/agencies/${agency.id}`, '', 'Status updated.');
});

app.post('/agencies/:id/followup', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const f = await c.req.parseBody();
  const today = todayIST();
  const fallback = `/agencies/${agency.id}`;
  switch (str(f.action)) {
    case 'done':
      await markFollowupDone(c.env.DB, agency, str(f.replied) === '1', str(f.note), today);
      return back(c, fallback, f.back, `Follow-up logged for ${agency.name}.`);
    case 'snooze': {
      const days = Number(f.days) || 3;
      await setNextFollowup(c.env.DB, agency.id, addDays(today, days));
      return back(c, fallback, f.back, `${agency.name} snoozed ${days} days.`);
    }
    case 'reschedule':
      if (isValidDay(str(f.date))) await setNextFollowup(c.env.DB, agency.id, str(f.date));
      return back(c, fallback, f.back, 'Follow-up rescheduled.');
  }
  return back(c, fallback, f.back);
});

app.post('/agencies/:id/next-steps', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  try {
    await refreshNextSteps(c.env.DB, c.env, agency, todayIST());
    return back(c, `/agencies/${agency.id}`, '', 'Next steps refreshed.');
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return c.redirect(`/agencies/${agency.id}?error=${encodeURIComponent(err.message)}`, 303);
  }
});

// ---------- website intelligence ----------

app.post('/agencies/:id/web/step', async (c) => {
  const id = Number(c.req.param('id'));
  const f = await c.req.parseBody();
  // Same format as SQLite datetime('now'), so it compares with last_checked_at.
  const since = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str(f.since)) ? str(f.since) : new Date().toISOString().replace('T', ' ').slice(0, 19);
  const r = await refreshAgencyStep(c.env.DB, c.env, id, since);
  return c.json({ ...r, since });
});

app.post('/agencies/:id/pages', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const f = await c.req.parseBody();
  const kind = str(f.kind);
  let url: string | null = null;
  try {
    url = /^https?:$/.test(new URL(str(f.url)).protocol) ? new URL(str(f.url)).toString() : null;
  } catch {
    url = null;
  }
  if (url && (PAGE_KINDS as readonly string[]).includes(kind)) {
    await c.env.DB.prepare('INSERT INTO watched_pages (agency_id, kind, url) VALUES (?, ?, ?) ON CONFLICT(agency_id, url) DO UPDATE SET kind = excluded.kind')
      .bind(agency.id, kind, url)
      .run();
    return back(c, `/agencies/${agency.id}`, '', 'Page added. It is checked tonight, or use Refresh now.');
  }
  return c.redirect(`/agencies/${agency.id}?error=${encodeURIComponent('Please enter a full web address starting with https://')}`, 303);
});

app.post('/pages/:pid/delete', async (c) => {
  const row = await c.env.DB.prepare('DELETE FROM watched_pages WHERE id = ? RETURNING agency_id').bind(Number(c.req.param('pid'))).first<{ agency_id: number }>();
  return back(c, row ? `/agencies/${row.agency_id}` : '/agencies', '', 'Page no longer watched.');
});

// ---------- logging a meeting ----------

app.get('/agencies/:id/log', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  return c.html(<LogPage agency={agency} today={todayIST()} />);
});

app.post('/agencies/:id/log/analyze', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const f = await c.req.parseBody();
  const today = todayIST();
  const date = isValidDay(str(f.date)) && str(f.date) <= today ? str(f.date) : today;
  const type = str(f.type) || 'meeting';
  const notes = str(f.notes);
  if (!notes) return c.html(<LogPage agency={agency} today={today} error="Please paste some notes." />, 400);

  let analysis: NoteAnalysis | null = null;
  let aiError: string | null = null;
  if (str(f.skip_ai) !== '1') {
    try {
      const contacts = await getContacts(c.env.DB, agency.id);
      analysis = await analyzeNote(c.env, {
        agencyName: agency.name,
        status: agency.status,
        leadStatus: agency.lead_status,
        today,
        history: await historyForAi(c.env.DB, agency.id, 6),
        notes: redact(notes, contacts.map((x) => x.name)),
      });
    } catch (err) {
      if (!(err instanceof AiUnavailableError)) throw err;
      aiError = err.message;
    }
  }
  return c.html(<ReviewPage agency={agency} date={date} type={type} notes={notes} analysis={analysis} aiError={aiError} />);
});

app.post('/agencies/:id/log/save', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const f = await c.req.parseBody();
  const today = todayIST();
  const date = isValidDay(str(f.date)) ? str(f.date) : today;
  const nextDate = isValidDay(str(f.next_step_date)) && str(f.next_step_date) > today ? str(f.next_step_date) : null;
  let keyPoints: object | null = null;
  try {
    keyPoints = str(f.key_points) ? JSON.parse(str(f.key_points)) : null;
  } catch {
    keyPoints = null;
  }
  await logConversation(c.env.DB, agency, {
    date,
    type: str(f.type) || 'meeting',
    raw_notes: str(f.notes),
    summary: orNull(f.summary),
    key_points: keyPoints,
    next_step: orNull(f.next_step),
    next_step_date: nextDate,
  });

  const toLead = f.suggested_lead_status;
  const toStatus = f.suggested_status;
  if (isLeadStatus(toLead) && isStatus(toStatus)) {
    const status = isAllowedCombo(toStatus, toLead) ? toStatus : statusForLead(toLead, toStatus);
    const fresh = (await getAgency(c.env.DB, agency.id))!;
    if (str(f.apply_suggestion) === '1') {
      await changeStatus(c.env.DB, fresh, status, toLead, str(f.suggestion_reason) || 'From meeting notes', today);
    } else {
      await createSuggestion(c.env.DB, fresh, status, toLead, str(f.suggestion_reason) || 'From meeting notes', 'ai_note');
    }
  }
  return back(c, `/agencies/${agency.id}`, '', 'Saved to the timeline.');
});

// ---------- suggestions ----------

app.post('/suggestions/:sid/:action{accept|dismiss}', async (c) => {
  const f = await c.req.parseBody();
  const agencyId = await resolveSuggestion(c.env.DB, Number(c.req.param('sid')), c.req.param('action') === 'accept', todayIST());
  return back(c, agencyId ? `/agencies/${agencyId}` : '/', f.back, c.req.param('action') === 'accept' ? 'Status changed.' : 'Suggestion dismissed.');
});

// ---------- import ----------

async function hasData(db: D1Database): Promise<boolean> {
  return !!(await db.prepare('SELECT 1 FROM agencies LIMIT 1').first());
}

app.get('/import', async (c) => c.html(<ImportPage hasData={await hasData(c.env.DB)} />));

app.post('/import', async (c) => {
  const db = c.env.DB;
  const f = await c.req.parseBody();
  const exists = await hasData(db);
  if (exists && str(f.replace) !== '1') return c.html(<ImportPage hasData error="Tick the box to confirm replacing existing data." />, 400);
  const file = f.file;
  if (!(file instanceof File)) return c.html(<ImportPage hasData={exists} error="Please choose the CSV file." />, 400);
  let plan;
  try {
    plan = buildImportPlan(await file.text(), { today: todayIST() });
  } catch (err) {
    return c.html(<ImportPage hasData={exists} error={(err as Error).message} />, 400);
  }
  const wipe = ['web_changes', 'agency_intel', 'watched_pages', 'import_issues', 'suggestions', 'timeline', 'contacts', 'agencies'].map((t) =>
    db.prepare(`DELETE FROM ${t}`),
  );
  await db.batch([...wipe, ...planStatements(db, plan)]);
  return c.redirect(
    `/import/report?msg=${encodeURIComponent(`Imported ${plan.agencies.length} agencies. ${plan.issues.length} rows need a look.`)}`,
    303,
  );
});

app.get('/import/report', async (c) => {
  const issues = await c.env.DB.prepare(
    `SELECT i.*, a.name AS agency_name FROM import_issues i LEFT JOIN agencies a ON a.id = i.agency_id
     WHERE i.resolved = 0 ORDER BY i.row_number, i.id`,
  ).all<ImportIssueRow>();
  return c.html(<ImportReportPage issues={issues.results} msg={c.req.query('msg')} />);
});

app.post('/import-issues/:iid/resolve', async (c) => {
  const f = await c.req.parseBody();
  await c.env.DB.prepare('UPDATE import_issues SET resolved = 1 WHERE id = ?').bind(Number(c.req.param('iid'))).run();
  return back(c, '/import/report', f.back);
});

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === CRAWL_CRON) {
      ctx.waitUntil(runCrawlTick(env.DB, env).then((log) => console.log(`Crawl tick: ${log}`)));
      return;
    }
    ctx.waitUntil(
      runDailyJob(env.DB, env, todayIST()).then((r) => console.log(`Daily job: refreshed ${r.refreshed} agencies${r.error ? `, stopped: ${r.error}` : ''}`)),
    );
  },
} satisfies ExportedHandler<Env>;

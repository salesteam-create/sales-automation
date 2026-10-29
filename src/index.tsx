import { Hono, type Context } from 'hono';
import { AiUnavailableError, analyzeNote, type NoteAnalysis } from './ai';
import { dateFromText, addDays, isValidDay, todayIST } from './dates';
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
  isSort,
  recomputeLastContact,
  resolveSuggestion,
  setNextFollowup,
  type Sort,
} from './db';
import { buildImportPlan, planStatements } from './import';
import { getChanges, getIntel, getPages, refreshAgencyStep, runCrawlTick, type IntelEnv } from './intel';
import { redact } from './redact';
import { loadDashboard, loadFeed, loadNav, refreshNextSteps, runDailyJob, type Range } from './reports';
import { PAGE_KINDS } from './web';
import { FRAMEWORK_OPTIONS, isAllowedCombo, isLeadStatus, isStatus, nextFollowupDate, statusForLead } from './rules';
import { CSS, CSS_VERSION } from './views/theme';
import {
  AgencyListPage,
  AgencyPage,
  DashboardPage,
  EditAgencyPage,
  FeedPage,
  ImportPage,
  ImportReportPage,
  LogPage,
  NewAgencyPage,
  ReviewPage,
  type FeedTab,
  type ImportIssueRow,
  ALL_ROWS,
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
  const [path, hash] = target.split('#');
  const url = msg ? `${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}${hash ? '#' + hash : ''}` : target;
  return c.redirect(url, 303);
}

async function loadAgencyOr404(c: Context<{ Bindings: Env }>) {
  const id = Number(c.req.param('id'));
  return Number.isInteger(id) ? getAgency(c.env.DB, id) : null;
}

// ---------- stylesheet ----------

// Versioned in the URL, so it can be cached hard and still change the moment the design system does.
app.get('/app.css', (c) =>
  c.body(CSS, 200, {
    'content-type': 'text/css; charset=utf-8',
    'cache-control': c.req.query('v') === CSS_VERSION ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
  }),
);

// ---------- pages ----------

const FEED_TABS = ['all', 'overdue', 'today', 'upcoming'] as const;

app.get('/', async (c) => {
  const today = todayIST();
  const q = c.req.query('tab');
  const tab: FeedTab = (FEED_TABS as readonly string[]).includes(q ?? '') ? (q as FeedTab) : 'all';
  const [feed, nav] = await Promise.all([loadFeed(c.env.DB, today), loadNav(c.env.DB, today)]);
  return c.html(<FeedPage feed={feed} tab={tab} today={today} nav={nav} msg={c.req.query('msg')} />);
});

app.get('/dashboard', async (c) => {
  const today = todayIST();
  const q = c.req.query('range');
  const range: Range = q === 'week' || q === 'month' || q === 'quarter' ? q : 'all';
  const [d, nav] = await Promise.all([loadDashboard(c.env.DB, range, today), loadNav(c.env.DB, today)]);
  return c.html(<DashboardPage d={d} range={range} today={today} nav={nav} currency={c.env.CURRENCY} />);
});

app.get('/agencies', async (c) => {
  const today = todayIST();
  const filters = {
    q: c.req.query('q') || undefined,
    status: c.req.query('status') || undefined,
    lead: c.req.query('lead') || undefined,
    country: c.req.query('country') || undefined,
    overdue: c.req.query('overdue') === '1',
    deal: c.req.query('deal') === '1',
    // Rows per page: 25 by default, grown by "Show more" or "Show all" so the list extends in place.
    per: Math.min(ALL_ROWS, Math.max(25, Number(c.req.query('per')) || 25)),
  };
  const sortParam = c.req.query('sort');
  const sort: Sort = isSort(sortParam) ? sortParam : 'next';
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const [list, countries, nav] = await Promise.all([
    listAgencies(c.env.DB, { ...filters, today, sort, page, pageSize: filters.per }),
    listCountries(c.env.DB),
    loadNav(c.env.DB, today),
  ]);
  return c.html(
    <AgencyListPage
      agencies={list.agencies}
      countries={countries}
      filters={filters}
      sort={sort}
      page={list.page}
      pageSize={list.pageSize}
      total={list.total}
      grandTotal={nav.agencies}
      today={today}
      nav={nav}
      msg={c.req.query('msg')}
    />,
  );
});

app.get('/agencies/new', async (c) => {
  const today = todayIST();
  return c.html(<NewAgencyPage today={today} nav={await loadNav(c.env.DB, today)} />);
});

app.post('/agencies', async (c) => {
  const f = await c.req.parseBody();
  const name = str(f.name);
  const status = f.status;
  const lead = f.lead_status;
  const today = todayIST();
  if (!name || !isStatus(status) || !isLeadStatus(lead) || !isAllowedCombo(status, lead)) {
    return c.html(
      <NewAgencyPage today={today} nav={await loadNav(c.env.DB, today)} error="Please give a name and an allowed stage and lead temperature." />,
      400,
    );
  }
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
  const today = todayIST();
  const [contacts, timeline, suggestions, issues, intel, pages, changes, nav] = await Promise.all([
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
    loadNav(db, today),
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
      today={today}
      nav={nav}
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
  return back(c, `/agencies/${agency.id}`, f.back, 'Details saved.');
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
  return back(c, `/agencies/${agency.id}`, f.back, 'Contact added.');
});

app.post('/contacts/:cid/delete', async (c) => {
  const row = await c.env.DB.prepare('DELETE FROM contacts WHERE id = ? RETURNING agency_id').bind(Number(c.req.param('cid'))).first<{ agency_id: number }>();
  return back(c, row ? `/agencies/${row.agency_id}/edit` : '/agencies', '', 'Contact removed.');
});

app.post('/contacts/:cid', async (c) => {
  const f = await c.req.parseBody();
  if (!str(f.name)) return back(c, '/agencies', '');
  const row = await c.env.DB.prepare('UPDATE contacts SET name = ?, role = ?, email = ?, linkedin = ? WHERE id = ? RETURNING agency_id')
    .bind(str(f.name), orNull(f.role), orNull(f.email), orNull(f.linkedin), Number(c.req.param('cid')))
    .first<{ agency_id: number }>();
  return back(c, row ? `/agencies/${row.agency_id}/edit` : '/agencies', '', 'Contact saved.');
});

// ---------- full edit page ----------

app.get('/agencies/:id/edit', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const today = todayIST();
  const [contacts, timeline, nav] = await Promise.all([getContacts(c.env.DB, agency.id), getTimeline(c.env.DB, agency.id), loadNav(c.env.DB, today)]);
  return c.html(
    <EditAgencyPage
      agency={agency}
      contacts={contacts}
      timeline={timeline}
      currency={c.env.CURRENCY}
      today={today}
      nav={nav}
      msg={c.req.query('msg')}
      error={c.req.query('error')}
    />,
  );
});

app.post('/agencies/:id/edit-status', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const f = await c.req.parseBody();
  const editUrl = `/agencies/${agency.id}/edit`;
  if (!isStatus(f.status) || !isLeadStatus(f.lead_status) || !isAllowedCombo(f.status, f.lead_status)) {
    return c.redirect(`${editUrl}?error=${encodeURIComponent('That Status / Lead Status combination is not allowed.')}`, 303);
  }
  const today = todayIST();
  await changeStatus(c.env.DB, agency, f.status, f.lead_status, orNull(f.reason), today);
  // Dates typed here override whatever the status change worked out.
  const last = isValidDay(str(f.last_contact_date)) ? str(f.last_contact_date) : null;
  const next = isValidDay(str(f.next_followup_date)) ? str(f.next_followup_date) : null;
  const fresh = (await getAgency(c.env.DB, agency.id))!;
  const nextChanged = next !== agency.next_followup_date;
  await c.env.DB.prepare(`UPDATE agencies SET last_contact_date = ?, next_followup_date = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(last, nextChanged ? next : fresh.next_followup_date, agency.id)
    .run();
  return back(c, editUrl, '', 'Status and dates saved.');
});

app.post('/timeline/:tid', async (c) => {
  const f = await c.req.parseBody();
  const type = str(f.type) || 'note';
  const row = await c.env.DB.prepare(
    `UPDATE timeline SET date = ?, type = ?, summary = ?, raw_notes = ?, next_step = ? WHERE id = ? RETURNING agency_id`,
  )
    .bind(isValidDay(str(f.date)) ? str(f.date) : null, type, orNull(f.summary), orNull(f.raw_notes), orNull(f.next_step), Number(c.req.param('tid')))
    .first<{ agency_id: number }>();
  if (!row) return back(c, '/agencies', '');
  await recomputeLastContact(c.env.DB, row.agency_id);
  return back(c, `/agencies/${row.agency_id}/edit#timeline`, '', 'Entry saved.');
});

app.post('/timeline/:tid/delete', async (c) => {
  const row = await c.env.DB.prepare('DELETE FROM timeline WHERE id = ? RETURNING agency_id').bind(Number(c.req.param('tid'))).first<{ agency_id: number }>();
  if (!row) return back(c, '/agencies', '');
  await recomputeLastContact(c.env.DB, row.agency_id);
  return back(c, `/agencies/${row.agency_id}/edit`, '', 'Entry deleted.');
});

app.post('/agencies/:id/delete', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const f = await c.req.parseBody();
  if (str(f.confirm) !== '1') return c.redirect(`/agencies/${agency.id}/edit`, 303);
  const db = c.env.DB;
  // Child rows are removed explicitly; D1 does not enforce ON DELETE CASCADE unless foreign keys are on.
  await db.batch(
    ['web_changes', 'agency_intel', 'watched_pages', 'import_issues', 'suggestions', 'timeline', 'contacts']
      .map((t) => db.prepare(`DELETE FROM ${t} WHERE agency_id = ?`).bind(agency.id))
      .concat(db.prepare('DELETE FROM agencies WHERE id = ?').bind(agency.id)),
  );
  return c.redirect(`/agencies?msg=${encodeURIComponent(`${agency.name} deleted.`)}`, 303);
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
    case 'snooze3':
    case 'snooze7':
    case 'snooze': {
      const days = str(f.action) === 'snooze7' ? 7 : str(f.action) === 'snooze3' ? 3 : Number(f.days) || 3;
      await setNextFollowup(c.env.DB, agency.id, addDays(today, days));
      return back(c, fallback, f.back, `${agency.name} snoozed ${days} days.`);
    }
    case 'reschedule':
      if (isValidDay(str(f.date))) await setNextFollowup(c.env.DB, agency.id, str(f.date));
      return back(c, fallback, f.back, 'Follow-up rescheduled.');
    case 'clear':
      await setNextFollowup(c.env.DB, agency.id, null);
      return back(c, fallback, f.back, `Follow-up cleared for ${agency.name}.`);
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
  const today = todayIST();
  return c.html(<LogPage agency={agency} today={today} nav={await loadNav(c.env.DB, today)} />);
});

app.post('/agencies/:id/log/analyze', async (c) => {
  const agency = await loadAgencyOr404(c);
  if (!agency) return c.notFound();
  const f = await c.req.parseBody();
  const today = todayIST();
  const date = isValidDay(str(f.date)) && str(f.date) <= today ? str(f.date) : today;
  const type = str(f.type) || 'meeting';
  const notes = str(f.notes);
  if (!notes) {
    return c.html(<LogPage agency={agency} today={today} nav={await loadNav(c.env.DB, today)} error="Please paste some notes." />, 400);
  }

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
  // When the AI gives no date (or is skipped), read one from the notes ("call in two days") so the reminder is not lost.
  const noteDate = dateFromText(notes, today);
  if (analysis && !analysis.next_step_date && noteDate) analysis.next_step_date = noteDate;
  return c.html(
    <ReviewPage
      agency={agency}
      date={date}
      type={type}
      notes={notes}
      analysis={analysis}
      suggestedDate={noteDate}
      aiError={aiError}
      today={today}
      nav={await loadNav(c.env.DB, today)}
    />,
  );
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

app.get('/import', async (c) => {
  const today = todayIST();
  const [has, nav] = await Promise.all([hasData(c.env.DB), loadNav(c.env.DB, today)]);
  return c.html(<ImportPage hasData={has} today={today} nav={nav} />);
});

app.post('/import', async (c) => {
  const db = c.env.DB;
  const today = todayIST();
  const f = await c.req.parseBody();
  const [exists, nav] = await Promise.all([hasData(db), loadNav(db, today)]);
  if (exists && str(f.replace) !== '1') {
    return c.html(<ImportPage hasData today={today} nav={nav} error="Tick the box to confirm replacing existing data." />, 400);
  }
  const file = f.file;
  if (!(file instanceof File)) return c.html(<ImportPage hasData={exists} today={today} nav={nav} error="Please choose the CSV file." />, 400);
  let plan;
  try {
    plan = buildImportPlan(await file.text(), { today });
  } catch (err) {
    return c.html(<ImportPage hasData={exists} today={today} nav={nav} error={(err as Error).message} />, 400);
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
  const today = todayIST();
  const [issues, nav] = await Promise.all([
    c.env.DB.prepare(
      `SELECT i.*, a.name AS agency_name FROM import_issues i LEFT JOIN agencies a ON a.id = i.agency_id
       WHERE i.resolved = 0 ORDER BY i.row_number, i.id`,
    ).all<ImportIssueRow>(),
    loadNav(c.env.DB, today),
  ]);
  return c.html(<ImportReportPage issues={issues.results} today={today} nav={nav} msg={c.req.query('msg')} />);
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

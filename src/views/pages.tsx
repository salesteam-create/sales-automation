import type { FC } from 'hono/jsx';
import type { NoteAnalysis } from '../ai';
import { formatDay } from '../dates';
import type { Agency, Contact, Suggestion, TimelineEntry } from '../db';
import { CHANGE_LABELS, type AgencyIntel, type WatchedPage, type WebChange } from '../intel';
import type { Dashboard, Feed, Range } from '../reports';
import { ALLOWED_COMBOS, FRAMEWORK_OPTIONS, LEAD_STATUSES, STATUSES, TIMELINE_TYPES } from '../rules';
import { PAGE_KINDS, PAGE_KIND_LABELS } from '../web';
import { Due, Layout, Notice, Pill } from './layout';

export interface ImportIssueRow {
  id: number;
  agency_id: number | null;
  agency_name: string | null;
  row_number: number | null;
  kind: string;
  detail: string;
}

const STATUS_COLORS: Record<string, string> = {
  Won: 'var(--red)',
  Opportunity: 'var(--amber)',
  'Potential (Warm)': 'var(--accent)',
  'Email Sequence': 'var(--muted)',
  'Not Interested': 'var(--line)',
};

// ---------- shared pieces ----------

// "Done" means the follow-up was sent and no reply has come in yet. A reply is recorded by logging it
// ("Log meeting or note"), which resets the no-reply count; 3 Dones in a row without one trigger a downgrade suggestion.
const FollowupActions: FC<{ agency: Agency; back: string }> = ({ agency, back }) => (
  <form class="row small" method="post" action={`/agencies/${agency.id}/followup`} style="margin-top:6px">
    <input type="hidden" name="back" value={back} />
    <button type="submit" name="action" value="done" title="You followed up. If they reply, log it with Log meeting or note.">
      Done
    </button>
    <button type="submit" name="action" value="snooze3">
      Snooze 3 days
    </button>
    <button type="submit" name="action" value="snooze7">
      Snooze 1 week
    </button>
  </form>
);

const SuggestionItem: FC<{ s: Suggestion; back: string; showAgency?: boolean }> = ({ s, back, showAgency }) => (
  <div class="item">
    {showAgency && (
      <div>
        <a href={`/agencies/${s.agency_id}`}>
          <b>{s.agency_name}</b>
        </a>
      </div>
    )}
    <div>
      Move <Pill value={s.from_status} /> <Pill value={s.from_lead_status} /> to <Pill value={s.to_status} /> <Pill value={s.to_lead_status} />
    </div>
    <div class="small muted">
      {s.source === 'no_reply' ? 'No-reply rule' : s.source === 'web' ? 'Website signal' : 'AI, from meeting notes'}: {s.reason}
    </div>
    <div class="row small" style="margin-top:6px">
      <form class="inline" method="post" action={`/suggestions/${s.id}/accept`}>
        <input type="hidden" name="back" value={back} />
        <button class="primary">Accept</button>
      </form>
      <form class="inline" method="post" action={`/suggestions/${s.id}/dismiss`}>
        <input type="hidden" name="back" value={back} />
        <button>Dismiss</button>
      </form>
    </div>
  </div>
);

const AgencyLine: FC<{ a: Agency; today: string; back: string }> = ({ a, today, back }) => (
  <div class="item">
    <div class="row">
      <a href={`/agencies/${a.id}`}>
        <b>{a.name}</b>
      </a>
      <span class="muted small">{a.country ?? ''}</span>
      <Pill value={a.status} />
      <Pill value={a.lead_status} />
      <span class="small">
        <Due day={a.next_followup_date} today={today} />
      </span>
      {a.unanswered_count > 0 && <span class="small muted">{a.unanswered_count} without reply</span>}
    </div>
    {a.next_steps && (
      <div class="small muted" style="margin-top:4px">
        Next: {(JSON.parse(a.next_steps) as string[])[0]}
      </div>
    )}
    <FollowupActions agency={a} back={back} />
  </div>
);

const ChangeItem: FC<{ c: WebChange; showAgency?: boolean }> = ({ c, showAgency }) => (
  <div class="item">
    <div class="row small">
      {showAgency && (
        <a href={`/agencies/${c.agency_id}`}>
          <b>{c.agency_name}</b>
        </a>
      )}
      {c.is_opportunity ? <span class="pill ok">Opportunity</span> : null}
      <span class="pill">{c.label ? CHANGE_LABELS[c.label] ?? c.label : 'Not labelled yet'}</span>
      <span class="muted">{c.detected_at.slice(0, 10)}</span>
      <a href={c.page_url} target="_blank" rel="noopener" class="muted">
        {c.page_kind} page
      </a>
    </div>
    <div>{c.title ?? 'Website updated'}</div>
    {c.summary && <div class="small muted">{c.summary}</div>}
    {c.opportunity_reason && <div class="small">Why it matters: {c.opportunity_reason}</div>}
  </div>
);

function Collapsible<T>({ items, limit, render }: { items: T[]; limit: number; render: (t: T) => unknown }) {
  if (items.length <= limit) return <>{items.map(render)}</>;
  return (
    <>
      {items.slice(0, limit).map(render)}
      <details>
        <summary>Show {items.length - limit} more</summary>
        {items.slice(limit).map(render)}
      </details>
    </>
  );
}

// ---------- Today (daily feed) ----------

export const FeedPage: FC<{ feed: Feed; today: string; msg?: string | null }> = ({ feed, today, msg }) => {
  const quiet =
    !feed.overdue.length && !feed.dueToday.length && !feed.suggestions.length && !feed.webUpdates.length && !feed.yesterday.length;
  return (
    <Layout title="Today" active="feed">
      <h1>Today</h1>
      <p class="muted">{formatDay(today)}</p>
      <Notice msg={msg} ok />
      {quiet && <div class="card">Nothing new today.</div>}
      {feed.overdue.length > 0 && (
        <section class="card">
          <h2>Overdue follow-ups ({feed.overdue.length})</h2>
          <Collapsible items={feed.overdue} limit={10} render={(a) => <AgencyLine a={a} today={today} back="/" />} />
        </section>
      )}
      {feed.dueToday.length > 0 && (
        <section class="card">
          <h2>Due today ({feed.dueToday.length})</h2>
          {feed.dueToday.map((a) => (
            <AgencyLine a={a} today={today} back="/" />
          ))}
        </section>
      )}
      {feed.suggestions.length > 0 && (
        <section class="card">
          <h2>Suggestions waiting for you ({feed.suggestions.length})</h2>
          {feed.suggestions.map((s) => (
            <SuggestionItem s={s} back="/" showAgency />
          ))}
        </section>
      )}
      {feed.webUpdates.length > 0 && (
        <section class="card">
          <h2>Website updates ({feed.webUpdates.length})</h2>
          <p class="small muted">New services, case studies, hiring and other news from agencies you are working (last 3 days).</p>
          <Collapsible items={feed.webUpdates} limit={10} render={(c) => <ChangeItem c={c} showAgency />} />
        </section>
      )}
      {feed.yesterday.length > 0 && (
        <section class="card">
          <h2>Yesterday</h2>
          {feed.yesterday.map((e) => (
            <div class="item small">
              <a href={`/agencies/${e.agency_id}`}>{e.agency_name}</a> <span class="muted">· {e.type.replace('_', ' ')}</span>
              <div>{e.summary || e.raw_notes}</div>
            </div>
          ))}
        </section>
      )}
    </Layout>
  );
};

// ---------- Dashboard ----------

const RANGES: [Range, string][] = [
  ['week', 'This week'],
  ['month', 'This month'],
  ['quarter', 'This quarter'],
  ['all', 'All time'],
];

export const DashboardPage: FC<{ d: Dashboard; range: Range; today: string; currency: string }> = ({ d, range, today, currency }) => {
  const total = d.pipeline.reduce((s, p) => s + p.count, 0);
  return (
    <Layout title="Dashboard" active="dashboard">
      <div class="row" style="justify-content:space-between;margin-bottom:12px">
        <h1>Dashboard</h1>
        <div class="row small">
          {RANGES.map(([r, label]) => (r === range ? <b>{label}</b> : <a href={`/dashboard?range=${r}`}>{label}</a>))}
        </div>
      </div>
      <p class="muted small">Blocks 1 to 3 count agencies first met in the selected period. Agencies with no meeting date only show under All time.</p>

      <section class="card">
        <h2>1. Pipeline ({total})</h2>
        <div class="grid g5">
          {d.pipeline.map((p) => (
            <a class="stat" href={`/agencies?status=${encodeURIComponent(p.status)}`}>
              <span class="small muted">{p.status}</span>
              <b>{p.count}</b>
            </a>
          ))}
        </div>
      </section>

      <div class="grid g2">
        <section class="card">
          <h2>2. By country</h2>
          <div class="table-wrap">
            <table>
              <tbody>
                {d.countries.map((c) => (
                  <tr>
                    <td>
                      <a href={`/agencies?country=${encodeURIComponent(c.country)}`}>{c.country}</a>
                    </td>
                    <td style="width:45%">
                      <div class="bar" title={STATUSES.map((s) => `${s}: ${c.byStatus[s] ?? 0}`).join('\n')}>
                        {STATUSES.map((s) =>
                          c.byStatus[s] ? <span style={`width:${(c.byStatus[s] / c.total) * 100}%;background:${STATUS_COLORS[s]}`} /> : null,
                        )}
                      </div>
                    </td>
                    <td style="text-align:right">{c.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div class="row small muted" style="margin-top:8px">
            {STATUSES.map((s) => (
              <span>
                <span style={`display:inline-block;width:10px;height:10px;border-radius:2px;background:${STATUS_COLORS[s]}`} /> {s}
              </span>
            ))}
          </div>
        </section>

        <section class="card">
          <h2>3. Potential deals ({d.deals.length})</h2>
          {d.dealTotal > 0 && (
            <p>
              Estimated total: <b>{currency} {d.dealTotal.toLocaleString('en-GB')}</b>
            </p>
          )}
          {d.deals.length === 0 && <p class="muted">No Hot agencies or deals in hand.</p>}
          <Collapsible
            items={d.deals}
            limit={8}
            render={(a) => (
              <div class="item">
                <div class="row">
                  <a href={`/agencies/${a.id}`}>
                    <b>{a.name}</b>
                  </a>
                  <Pill value={a.lead_status} />
                  {a.deal_value != null && (
                    <span>
                      {currency} {a.deal_value.toLocaleString('en-GB')}
                    </span>
                  )}
                </div>
                {a.deal_description && <div class="small">{a.deal_description}</div>}
                {a.next_steps && <div class="small muted">Next: {(JSON.parse(a.next_steps) as string[])[0]}</div>}
              </div>
            )}
          />
        </section>
      </div>

      <section class="card">
        <h2>4. Today's actions</h2>
        <div class="grid g5" style="margin-bottom:12px">
          <a class="stat" href="/agencies?overdue=1">
            <span class="small muted">Overdue</span>
            <b class={d.overdue.length ? 'overdue' : ''}>{d.overdue.length}</b>
          </a>
          <a class="stat" href="/">
            <span class="small muted">Due today</span>
            <b>{d.dueToday.length}</b>
          </a>
          <a class="stat" href="/">
            <span class="small muted">Suggestions waiting</span>
            <b>{d.suggestions.length}</b>
          </a>
        </div>
        <Collapsible items={[...d.dueToday, ...d.overdue]} limit={5} render={(a) => <AgencyLine a={a} today={today} back="/dashboard" />} />
      </section>

      <section class="card">
        <h2>5. Today's web updates ({d.webUpdates.length})</h2>
        <p class="muted small">
          News from agencies you are working (not Won or Not Interested), last 24 hours.{' '}
          {d.webUpdates.filter((c) => c.is_opportunity).length} flagged as opportunities.
        </p>
        {d.webUpdates.length === 0 && <p class="muted">No website updates in the last 24 hours.</p>}
        <Collapsible items={d.webUpdates} limit={6} render={(c) => <ChangeItem c={c} showAgency />} />
      </section>
    </Layout>
  );
};

// ---------- Agency list ----------

export const AgencyListPage: FC<{
  agencies: Agency[];
  countries: string[];
  filters: { q?: string; status?: string; lead?: string; country?: string; overdue?: boolean };
  today: string;
}> = ({ agencies, countries, filters, today }) => (
  <Layout title="Agencies" active="agencies">
    <h1>Agencies ({agencies.length})</h1>
    <form class="card" method="get" action="/agencies">
      <div class="fields">
        <div>
          <label>Search</label>
          <input type="search" name="q" value={filters.q ?? ''} placeholder="Agency or contact" />
        </div>
        <div>
          <label>Status</label>
          <select name="status">
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option selected={filters.status === s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Lead Status</label>
          <select name="lead">
            <option value="">All</option>
            {LEAD_STATUSES.map((s) => (
              <option selected={filters.lead === s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label>Country</label>
          <select name="country">
            <option value="">All</option>
            {countries.map((c) => (
              <option selected={filters.country === c}>{c}</option>
            ))}
          </select>
        </div>
      </div>
      <div class="row" style="margin-top:10px">
        <label style="margin:0">
          <input type="checkbox" name="overdue" value="1" checked={filters.overdue} /> Overdue only
        </label>
        <button class="primary">Filter</button>
        <a href="/agencies">Clear</a>
      </div>
    </form>
    <div class="card table-wrap">
      <table>
        <thead>
          <tr>
            <th>Agency</th>
            <th>Country</th>
            <th>Status</th>
            <th>Lead</th>
            <th>Last contact</th>
            <th>Next follow-up</th>
          </tr>
        </thead>
        <tbody>
          {agencies.map((a) => (
            <tr>
              <td>
                <a href={`/agencies/${a.id}`}>{a.name}</a>
              </td>
              <td>{a.country ?? ''}</td>
              <td>
                <Pill value={a.status} />
              </td>
              <td>
                <Pill value={a.lead_status} />
              </td>
              <td class="small">{formatDay(a.last_contact_date)}</td>
              <td class="small">
                <Due day={a.next_followup_date} today={today} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {agencies.length === 0 && <p class="muted">No agencies match.</p>}
    </div>
  </Layout>
);

// ---------- Agency forms ----------

// Keeps the Lead Status dropdown limited to combinations allowed for the chosen Status.
const comboScript = `
(function(){var combos=${JSON.stringify(ALLOWED_COMBOS)};
document.querySelectorAll('[data-combo]').forEach(function(f){
var s=f.querySelector('[name=status]'),l=f.querySelector('[name=lead_status]');
function sync(){var ok=combos[s.value]||[];Array.prototype.forEach.call(l.options,function(o){o.disabled=ok.indexOf(o.value)<0});
if(ok.indexOf(l.value)<0)l.value=ok[0];}
s.addEventListener('change',sync);sync();});})();`;

const StatusFields: FC<{ status?: string; lead?: string }> = ({ status, lead }) => (
  <>
    <div>
      <label>Status</label>
      <select name="status">
        {STATUSES.map((s) => (
          <option selected={s === status}>{s}</option>
        ))}
      </select>
    </div>
    <div>
      <label>Lead Status</label>
      <select name="lead_status">
        {LEAD_STATUSES.map((s) => (
          <option selected={s === lead}>{s}</option>
        ))}
      </select>
    </div>
  </>
);

export const NewAgencyPage: FC<{ error?: string | null }> = ({ error }) => (
  <Layout title="New agency" active="new">
    <h1>New agency</h1>
    <Notice msg={error} />
    <form class="card" method="post" action="/agencies" data-combo>
      <div class="fields">
        <div>
          <label>Agency name *</label>
          <input type="text" name="name" required />
        </div>
        <div>
          <label>Website</label>
          <input type="url" name="website" placeholder="https://" />
        </div>
        <div>
          <label>Country</label>
          <input type="text" name="country" />
        </div>
        <div>
          <label>Contact name</label>
          <input type="text" name="contact_name" />
        </div>
        <StatusFields status="Potential (Warm)" lead="Warm" />
      </div>
      <p class="row" style="margin-top:14px">
        <button class="primary">Create and log first meeting</button>
      </p>
    </form>
    <script dangerouslySetInnerHTML={{ __html: comboScript }} />
  </Layout>
);

// ---------- Agency page ----------

const TimelineItem: FC<{ e: TimelineEntry }> = ({ e }) => {
  const kp = e.key_points ? (JSON.parse(e.key_points) as Partial<NoteAnalysis>) : null;
  return (
    <div class="item">
      <div class="row small">
        <b>{formatDay(e.date)}</b>
        <span class="pill">{e.type.replace('_', ' ')}</span>
        {e.source === 'import' && <span class="muted">from sheet</span>}
      </div>
      {e.summary ? (
        <>
          <div style="white-space:pre-wrap">{e.summary}</div>
          {kp && (
            <div class="small muted">
              {kp.interest_level && <>Interest: {kp.interest_level}. </>}
              {kp.services_needed?.length ? <>Needs: {kp.services_needed.join(', ')}. </> : null}
              {kp.projects?.length ? <>Projects: {kp.projects.join(', ')}. </> : null}
              {kp.objections?.length ? <>Objections: {kp.objections.join(', ')}.</> : null}
            </div>
          )}
          {e.next_step && <div class="small">Next step: {e.next_step}</div>}
          {e.raw_notes && (
            <details class="small">
              <summary>Original notes</summary>
              <pre class="notes">{e.raw_notes}</pre>
            </details>
          )}
        </>
      ) : (
        <div style="white-space:pre-wrap">{e.raw_notes}</div>
      )}
    </div>
  );
};

export const AgencyPage: FC<{
  agency: Agency;
  contacts: Contact[];
  timeline: TimelineEntry[];
  suggestions: Suggestion[];
  issues: ImportIssueRow[];
  intel: AgencyIntel | null;
  pages: WatchedPage[];
  changes: WebChange[];
  today: string;
  currency: string;
  msg?: string | null;
  error?: string | null;
}> = ({ agency: a, contacts, timeline, suggestions, issues, intel, pages, changes, today, currency, msg, error }) => {
  const back = `/agencies/${a.id}`;
  const steps = a.next_steps ? (JSON.parse(a.next_steps) as string[]) : [];
  return (
    <Layout title={a.name} active="agencies">
      <div class="row" style="justify-content:space-between">
        <div>
          <h1>{a.name}</h1>
          <div class="row small">
            {a.website ? (
              <a href={a.website} target="_blank" rel="noopener">
                {a.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
              </a>
            ) : (
              <span class="muted">{a.website_note ?? 'No website'}</span>
            )}
            {a.country && <span class="muted">{a.country}</span>}
            <Pill value={a.status} />
            <Pill value={a.lead_status} />
          </div>
        </div>
        <div class="row">
          <a class="btn" href={`/agencies/${a.id}/edit`}>
            Edit
          </a>
          <a class="btn primary" href={`/agencies/${a.id}/log`}>
            Log meeting or note
          </a>
        </div>
      </div>
      <div style="height:12px" />
      <Notice msg={msg} ok />
      <Notice msg={error} />

      <div class="grid g2">
        <section class="card">
          <h2>Follow-up</h2>
          <div>
            <Due day={a.next_followup_date} today={today} />
          </div>
          <div class="small muted">
            Last contact {formatDay(a.last_contact_date)}
            {a.unanswered_count > 0 && <> · {a.unanswered_count} follow-ups without reply</>}
          </div>
          {a.next_followup_date && <FollowupActions agency={a} back={back} />}
          <form class="row small" method="post" action={`/agencies/${a.id}/followup`} style="margin-top:8px">
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="action" value="reschedule" />
            <input type="date" name="date" style="width:auto" required />
            <button>Reschedule</button>
          </form>
        </section>

        <section class="card">
          <div class="row" style="justify-content:space-between">
            <h2>AI next steps</h2>
            <form method="post" action={`/agencies/${a.id}/next-steps`}>
              <button class="small">Refresh</button>
            </form>
          </div>
          {steps.length ? (
            <ol class="steps">
              {steps.map((s) => (
                <li>{s}</li>
              ))}
            </ol>
          ) : (
            <p class="muted small">Not generated yet. They refresh each morning for agencies with something new or due, or use Refresh.</p>
          )}
          {a.next_steps_updated_at && <div class="small muted">Updated {a.next_steps_updated_at.slice(0, 10)}</div>}
        </section>
      </div>

      {suggestions.length > 0 && (
        <section class="card">
          <h2>Suggested status change</h2>
          {suggestions.map((s) => (
            <SuggestionItem s={s} back={back} />
          ))}
        </section>
      )}

      <IntelSection agency={a} intel={intel} pages={pages} changes={changes} />

      {issues.length > 0 && (
        <section class="card">
          <h2>Import checks</h2>
          {issues.map((i) => (
            <div class="item small row">
              <span>
                Row {i.row_number}: {i.detail}
              </span>
              <form class="inline" method="post" action={`/import-issues/${i.id}/resolve`}>
                <input type="hidden" name="back" value={back} />
                <button class="small">Mark checked</button>
              </form>
            </div>
          ))}
        </section>
      )}

      <div class="grid g2">
        <section class="card">
          <h2>Status</h2>
          <form method="post" action={`/agencies/${a.id}/status`} data-combo>
            <div class="fields">
              <StatusFields status={a.status} lead={a.lead_status} />
            </div>
            <label>Reason (optional)</label>
            <input type="text" name="reason" />
            <p>
              <button class="primary">Change status</button>
            </p>
          </form>
        </section>

        <section class="card">
          <div class="row" style="justify-content:space-between">
            <h2>Details</h2>
            <a class="small" href={`/agencies/${a.id}/edit`}>
              Edit
            </a>
          </div>
          <div class="small">
            <div>Framework magazine: {a.framework ?? 'Not set'}</div>
            <div>
              Deal in hand: {a.deal_description ?? 'None'}
              {a.deal_value != null && (
                <>
                  {' '}
                  ({currency} {a.deal_value.toLocaleString('en-GB')})
                </>
              )}
            </div>
          </div>
          <h3 style="margin-top:12px">Contacts</h3>
          {contacts.length === 0 && <p class="small muted">No contacts yet.</p>}
          {contacts.map((c) => (
            <div class="item row small">
              <b>{c.name}</b>
              {c.role && <span class="muted">{c.role}</span>}
              {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
              {c.linkedin && (
                <a href={c.linkedin} target="_blank" rel="noopener">
                  LinkedIn
                </a>
              )}
            </div>
          ))}
        </section>
      </div>

      <section class="card">
        <div class="row" style="justify-content:space-between">
          <h2>Timeline</h2>
          {timeline.length > 0 && (
            <a class="small" href={`/agencies/${a.id}/edit#timeline`}>
              Edit entries
            </a>
          )}
        </div>
        {timeline.length === 0 && <p class="muted">Nothing logged yet.</p>}
        {timeline.map((e) => (
          <TimelineItem e={e} />
        ))}
      </section>
      <script dangerouslySetInnerHTML={{ __html: comboScript }} />
    </Layout>
  );
};

// ---------- Edit agency ----------

const ENTRY_TYPES = ['meeting', 'call', 'email', 'note', 'followup', 'status_change'] as const;

export const EditAgencyPage: FC<{
  agency: Agency;
  contacts: Contact[];
  timeline: TimelineEntry[];
  currency: string;
  msg?: string | null;
  error?: string | null;
}> = ({ agency: a, contacts, timeline, currency, msg, error }) => {
  const back = `/agencies/${a.id}/edit`;
  return (
    <Layout title={`Edit: ${a.name}`} active="agencies">
      <p class="small">
        <a href={`/agencies/${a.id}`}>← Back to {a.name}</a>
      </p>
      <h1>Edit {a.name}</h1>
      <div style="height:12px" />
      <Notice msg={msg} ok />
      <Notice msg={error} />

      <section class="card">
        <h2>Details</h2>
        <form method="post" action={`/agencies/${a.id}/edit`}>
          <input type="hidden" name="back" value={back} />
          <div class="fields">
            <div>
              <label>Agency name *</label>
              <input type="text" name="name" value={a.name} required />
            </div>
            <div>
              <label>Website</label>
              <input type="url" name="website" value={a.website ?? ''} placeholder="https://" />
            </div>
            <div>
              <label>Country</label>
              <input type="text" name="country" value={a.country ?? ''} />
            </div>
            <div>
              <label>Framework magazine</label>
              <select name="framework">
                <option value="">Not set</option>
                {FRAMEWORK_OPTIONS.map((f) => (
                  <option selected={a.framework === f}>{f}</option>
                ))}
              </select>
            </div>
            <div>
              <label>Deal in hand</label>
              <input type="text" name="deal_description" value={a.deal_description ?? ''} />
            </div>
            <div>
              <label>Estimated value ({currency})</label>
              <input type="number" name="deal_value" step="any" min="0" value={a.deal_value ?? ''} />
            </div>
          </div>
          <p class="small muted">Changing the website restarts the website scan for this agency.</p>
          <p>
            <button class="primary">Save details</button>
          </p>
        </form>
      </section>

      <section class="card">
        <h2>Status and follow-up</h2>
        <form method="post" action={`/agencies/${a.id}/edit-status`} data-combo>
          <div class="fields">
            <StatusFields status={a.status} lead={a.lead_status} />
            <div>
              <label>Last contact</label>
              <input type="date" name="last_contact_date" value={a.last_contact_date ?? ''} />
            </div>
            <div>
              <label>Next follow-up (empty = none)</label>
              <input type="date" name="next_followup_date" value={a.next_followup_date ?? ''} />
            </div>
          </div>
          <label>Reason for a status change (optional)</label>
          <input type="text" name="reason" />
          <p class="small muted">
            A status change is logged in the timeline and normally sets a new follow-up date. A date you enter here wins.
          </p>
          <p>
            <button class="primary">Save status and dates</button>
          </p>
        </form>
      </section>

      <section class="card">
        <h2>Contacts</h2>
        {contacts.map((c) => (
          <form class="item" method="post" action={`/contacts/${c.id}`}>
            <div class="fields">
              <div>
                <label>Name *</label>
                <input type="text" name="name" value={c.name} required />
              </div>
              <div>
                <label>Role</label>
                <input type="text" name="role" value={c.role ?? ''} />
              </div>
              <div>
                <label>Email</label>
                <input type="email" name="email" value={c.email ?? ''} />
              </div>
              <div>
                <label>LinkedIn</label>
                <input type="url" name="linkedin" value={c.linkedin ?? ''} />
              </div>
            </div>
            <div class="row" style="margin-top:8px">
              <button>Save contact</button>
              <button formaction={`/contacts/${c.id}/delete`} class="link small">
                Remove
              </button>
            </div>
          </form>
        ))}
        <form class="item" method="post" action={`/agencies/${a.id}/contacts`}>
          <input type="hidden" name="back" value={back} />
          <h3>Add a contact</h3>
          <div class="fields">
            <div>
              <label>Name *</label>
              <input type="text" name="name" required />
            </div>
            <div>
              <label>Role</label>
              <input type="text" name="role" />
            </div>
            <div>
              <label>Email</label>
              <input type="email" name="email" />
            </div>
            <div>
              <label>LinkedIn</label>
              <input type="url" name="linkedin" />
            </div>
          </div>
          <p>
            <button>Add contact</button>
          </p>
        </form>
      </section>

      <section class="card" id="timeline">
        <h2>Timeline entries ({timeline.length})</h2>
        {timeline.length === 0 && <p class="muted">Nothing logged yet.</p>}
        {timeline.map((e) => (
          <form class="item" method="post" action={`/timeline/${e.id}`}>
            <div class="fields">
              <div>
                <label>Date</label>
                <input type="date" name="date" value={e.date ?? ''} />
              </div>
              <div>
                <label>Type</label>
                <select name="type">
                  {ENTRY_TYPES.map((t) => (
                    <option value={t} selected={e.type === t}>
                      {t.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Next step</label>
                <input type="text" name="next_step" value={e.next_step ?? ''} />
              </div>
            </div>
            <label>Summary</label>
            <textarea name="summary" style="min-height:60px">
              {e.summary ?? ''}
            </textarea>
            <label>Notes</label>
            <textarea name="raw_notes" style="min-height:60px">
              {e.raw_notes ?? ''}
            </textarea>
            <div class="row" style="margin-top:8px">
              <button>Save entry</button>
              <button formaction={`/timeline/${e.id}/delete`} class="link small" data-confirm="Delete this timeline entry?">
                Delete entry
              </button>
            </div>
          </form>
        ))}
      </section>

      <section class="card">
        <h2>Delete agency</h2>
        <p class="small muted">Removes the agency with its contacts, timeline, suggestions and website data. This cannot be undone.</p>
        <form method="post" action={`/agencies/${a.id}/delete`}>
          <label style="margin:0 0 8px">
            <input type="checkbox" name="confirm" value="1" required /> Yes, delete {a.name} permanently
          </label>
          <button style="border-color:var(--red);color:var(--red)">Delete agency</button>
        </form>
      </section>
      <script dangerouslySetInnerHTML={{ __html: comboScript + confirmScript }} />
    </Layout>
  );
};

// Asks before buttons marked data-confirm submit.
const confirmScript = `
document.querySelectorAll('[data-confirm]').forEach(function(b){b.addEventListener('click',function(e){
if(!confirm(b.getAttribute('data-confirm')))e.preventDefault();});});`;

// ---------- Intelligence ----------

// Runs the refresh one small step at a time so each request stays within free-plan limits.
const refreshScript = (id: number) => `
(function(){var b=document.getElementById('intel-refresh'),o=document.getElementById('intel-progress');if(!b)return;
b.addEventListener('click',function(){b.disabled=true;var since='';var n=0;
function step(){fetch('/agencies/${id}/web/step',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'since='+encodeURIComponent(since)})
.then(function(r){return r.json()}).then(function(r){since=r.since;o.textContent=r.message;n++;
if(r.done||n>15){location.reload()}else{step()}}).catch(function(){o.textContent='Refresh failed. Try again later.';b.disabled=false})}
o.textContent='Reading website...';step();});})();`;

const IntelSection: FC<{ agency: Agency; intel: AgencyIntel | null; pages: WatchedPage[]; changes: WebChange[] }> = ({ agency: a, intel, pages, changes }) => {
  const lastChecked = pages.map((p) => p.last_checked_at).filter(Boolean).sort().at(-1);
  return (
    <section class="card">
      <div class="row" style="justify-content:space-between">
        <h2>Intelligence</h2>
        {a.website && (
          <div class="row small">
            <span class="muted" id="intel-progress">
              {lastChecked ? `Last checked ${lastChecked.slice(0, 16)} UTC` : 'Not checked yet'}
            </span>
            <button id="intel-refresh" type="button">
              Refresh now
            </button>
          </div>
        )}
      </div>
      {!a.website ? (
        <p class="muted">No website, intelligence unavailable. Add the agency's website under Details to start.</p>
      ) : !intel ? (
        <p class="muted small">Not scanned yet. The first scan runs overnight, or use Refresh now.</p>
      ) : (
        <>
          {intel.summary && <p>{intel.summary}</p>}
          <p class="small muted">Based on their website, checked {intel.updated_at.slice(0, 10)}. Websites rarely list everything an agency does, so treat these as leads to verify.</p>
          <div class="grid g2">
            <div>
              <h3>Their services</h3>
              <p class="small">{intel.their_services.join(', ') || 'Not clear from the website'}</p>
              {intel.platforms.length > 0 && (
                <>
                  <h3>Platforms</h3>
                  <p class="small">{intel.platforms.join(', ')}</p>
                </>
              )}
            </div>
            <div>
              <h3>Service gaps to pitch</h3>
              {intel.gaps.length ? (
                <ul class="small steps">
                  {intel.gaps.map((g) => (
                    <li>
                      <b>{g.service}</b>: {g.pitch}
                    </li>
                  ))}
                </ul>
              ) : (
                <p class="small muted">None found.</p>
              )}
            </div>
          </div>
          <h3>Upsell potential</h3>
          {intel.upsell.length ? (
            <ul class="small steps">
              {intel.upsell.map((u) => (
                <li>
                  {u.finding} <b>→</b> {u.suggestion}
                </li>
              ))}
            </ul>
          ) : (
            <p class="small muted">Nothing specific from their case studies yet.</p>
          )}
        </>
      )}

      {a.website && (
        <>
          <h3 style="margin-top:14px">Website activity</h3>
          {changes.length === 0 ? (
            <p class="small muted">No changes found yet. The first check sets the baseline; changes show from the next check on.</p>
          ) : (
            <Collapsible items={changes} limit={5} render={(c) => <ChangeItem c={c} />} />
          )}
          <details class="small" style="margin-top:10px">
            <summary>Watched pages ({pages.length})</summary>
            {pages.map((p) => (
              <div class="item row">
                <span class="pill">{PAGE_KIND_LABELS[p.kind] ?? p.kind}</span>
                <a href={p.url} target="_blank" rel="noopener">
                  {p.url.replace(/^https?:\/\/(www\.)?/, '')}
                </a>
                {p.last_status === 'error' && <span class="overdue">Couldn't check: {p.last_error}</span>}
                <form class="inline" method="post" action={`/pages/${p.id}/delete`}>
                  <button class="link small">Stop watching</button>
                </form>
              </div>
            ))}
            <form class="row" method="post" action={`/agencies/${a.id}/pages`} style="margin-top:8px">
              <select name="kind" style="width:auto">
                {PAGE_KINDS.map((k) => (
                  <option value={k}>{PAGE_KIND_LABELS[k]}</option>
                ))}
              </select>
              <input type="url" name="url" placeholder="https://..." required style="width:auto;flex:1 1 220px" />
              <button>Watch page</button>
            </form>
          </details>
          <script dangerouslySetInnerHTML={{ __html: refreshScript(a.id) }} />
        </>
      )}
    </section>
  );
};

// ---------- Log meeting ----------

export const LogPage: FC<{ agency: Agency; today: string; error?: string | null; draft?: { date: string; type: string; notes: string } }> = ({
  agency,
  today,
  error,
  draft,
}) => (
  <Layout title={`Log: ${agency.name}`} active="agencies">
    <p class="small">
      <a href={`/agencies/${agency.id}`}>← {agency.name}</a>
    </p>
    <h1>Log meeting or note</h1>
    <Notice msg={error} />
    <form class="card" method="post" action={`/agencies/${agency.id}/log/analyze`}>
      <div class="fields">
        <div>
          <label>Date</label>
          <input type="date" name="date" value={draft?.date ?? today} max={today} required />
        </div>
        <div>
          <label>Type</label>
          <select name="type">
            {TIMELINE_TYPES.map((t) => (
              <option selected={(draft?.type ?? 'meeting') === t}>{t}</option>
            ))}
          </select>
        </div>
      </div>
      <label>Notes (rough notes, a paragraph or a full transcript)</label>
      <textarea name="notes" style="min-height:220px" required>
        {draft?.notes ?? ''}
      </textarea>
      <p class="small muted">Contact names, emails and phone numbers are replaced with placeholders before the notes go to the AI.</p>
      <p class="row">
        <button class="primary">Summarise with AI</button>
        <button name="skip_ai" value="1">Save without AI</button>
      </p>
    </form>
  </Layout>
);

export const ReviewPage: FC<{
  agency: Agency;
  date: string;
  type: string;
  notes: string;
  analysis: NoteAnalysis | null;
  aiError?: string | null;
}> = ({ agency, date, type, notes, analysis: an, aiError }) => (
  <Layout title={`Review: ${agency.name}`} active="agencies">
    <p class="small">
      <a href={`/agencies/${agency.id}`}>← {agency.name}</a>
    </p>
    <h1>Review before saving</h1>
    <Notice msg={aiError ? `${aiError} You can still fill this in yourself and save.` : null} />
    <form class="card" method="post" action={`/agencies/${agency.id}/log/save`}>
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="notes" value={notes} />
      <input type="hidden" name="key_points" value={an ? JSON.stringify({ interest_level: an.interest_level, services_needed: an.services_needed, projects: an.projects, objections: an.objections }) : ''} />
      <p class="small muted">
        {formatDay(date)} · {type}
      </p>
      <label>Summary</label>
      <textarea name="summary">{an?.summary ?? ''}</textarea>
      {an && (
        <div class="small muted" style="margin-top:6px">
          Interest: {an.interest_level}
          {an.services_needed.length > 0 && <> · Needs: {an.services_needed.join(', ')}</>}
          {an.projects.length > 0 && <> · Projects: {an.projects.join(', ')}</>}
          {an.objections.length > 0 && <> · Objections: {an.objections.join(', ')}</>}
        </div>
      )}
      <div class="fields">
        <div>
          <label>Next step</label>
          <input type="text" name="next_step" value={an?.next_step ?? ''} />
        </div>
        <div>
          <label>Next follow-up date (leave empty for standard timing)</label>
          <input type="date" name="next_step_date" value={an?.next_step_date ?? ''} />
        </div>
      </div>
      {an && (an.suggested_status || an.suggested_lead_status) && (
        <div class="card" style="margin-top:14px;background:var(--bg)">
          <h3>AI suggests a status change</h3>
          <div>
            <Pill value={agency.status} /> <Pill value={agency.lead_status} /> to <Pill value={an.suggested_status ?? agency.status} />{' '}
            <Pill value={an.suggested_lead_status ?? agency.lead_status} />
          </div>
          <div class="small muted">{an.suggestion_reason}</div>
          <input type="hidden" name="suggested_status" value={an.suggested_status ?? agency.status} />
          <input type="hidden" name="suggested_lead_status" value={an.suggested_lead_status ?? agency.lead_status} />
          <input type="hidden" name="suggestion_reason" value={an.suggestion_reason ?? ''} />
          <label style="margin-top:8px">
            <input type="checkbox" name="apply_suggestion" value="1" /> Apply this change now (otherwise it waits in your suggestions)
          </label>
        </div>
      )}
      <details class="small" style="margin-top:10px">
        <summary>Original notes</summary>
        <pre class="notes">{notes}</pre>
      </details>
      <p class="row" style="margin-top:14px">
        <button class="primary">Save</button>
        <a href={`/agencies/${agency.id}`}>Cancel</a>
      </p>
    </form>
  </Layout>
);

// ---------- Import ----------

export const ImportPage: FC<{ hasData: boolean; error?: string | null }> = ({ hasData, error }) => (
  <Layout title="Import" active="import">
    <h1>Import Chabert's tab</h1>
    <Notice msg={error} />
    <div class="card">
      <ol>
        <li>Open the Google Sheet and select the Chabert tab.</li>
        <li>File → Download → Comma-separated values (.csv).</li>
        <li>Upload the file here.</li>
      </ol>
      {hasData && <div class="notice">The app already has data. Importing again replaces everything, including notes logged in the app.</div>}
      <form method="post" action="/import" enctype="multipart/form-data">
        <input type="file" name="file" accept=".csv,text/csv" required />
        {hasData && (
          <label>
            <input type="checkbox" name="replace" value="1" required /> Yes, replace all existing data
          </label>
        )}
        <p>
          <button class="primary">Import</button>
        </p>
      </form>
    </div>
  </Layout>
);

export const ImportReportPage: FC<{ issues: ImportIssueRow[]; msg?: string | null }> = ({ issues, msg }) => (
  <Layout title="Import report" active="import">
    <h1>Import report</h1>
    <Notice msg={msg} ok />
    <p class="muted">
      Rows that need a look. Fix them on the agency page, then mark them checked. <a href="/import">Upload a CSV</a>
    </p>
    <div class="card table-wrap">
      {issues.length === 0 ? (
        <p>Nothing left to check.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Row</th>
              <th>Agency</th>
              <th>Issue</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {issues.map((i) => (
              <tr>
                <td>{i.row_number}</td>
                <td>{i.agency_id ? <a href={`/agencies/${i.agency_id}`}>{i.agency_name}</a> : ''}</td>
                <td class="small">{i.detail}</td>
                <td>
                  <form class="inline" method="post" action={`/import-issues/${i.id}/resolve`}>
                    <input type="hidden" name="back" value="/import/report" />
                    <button class="small">Checked</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  </Layout>
);

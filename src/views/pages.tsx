import type { FC } from 'hono/jsx';
import type { NoteAnalysis } from '../ai';
import { formatDay } from '../dates';
import type { Agency, Contact, Suggestion, TimelineEntry } from '../db';
import type { Dashboard, Feed, Range } from '../reports';
import { ALLOWED_COMBOS, FRAMEWORK_OPTIONS, LEAD_STATUSES, STATUSES, TIMELINE_TYPES } from '../rules';
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

const FollowupActions: FC<{ agency: Agency; back: string }> = ({ agency, back }) => (
  <div class="row small" style="margin-top:6px">
    <form class="inline" method="post" action={`/agencies/${agency.id}/followup`}>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="action" value="done" />
      <button type="submit" name="replied" value="0" title="You followed up and are waiting for a reply">Done, no reply</button>
    </form>
    <form class="inline" method="post" action={`/agencies/${agency.id}/followup`}>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="action" value="done" />
      <button type="submit" name="replied" value="1">Done, they replied</button>
    </form>
    <form class="inline" method="post" action={`/agencies/${agency.id}/followup`}>
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="action" value="snooze" />
      <button type="submit" name="days" value="3">Snooze 3d</button>
      <button type="submit" name="days" value="7">Snooze 1w</button>
    </form>
  </div>
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
      {s.source === 'no_reply' ? 'No-reply rule' : 'AI, from meeting notes'}: {s.reason}
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
  const quiet = !feed.overdue.length && !feed.dueToday.length && !feed.suggestions.length && !feed.yesterday.length;
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
      <section class="card">
        <h2>Website updates</h2>
        <p class="muted small">Coming in phase 2: overnight changes on agency websites will appear here.</p>
      </section>
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
        <h2>5. Today's web updates</h2>
        <p class="muted small">Coming in phase 2.</p>
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
  today: string;
  currency: string;
  msg?: string | null;
  error?: string | null;
}> = ({ agency: a, contacts, timeline, suggestions, issues, today, currency, msg, error }) => {
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
        <a class="btn primary" href={`/agencies/${a.id}/log`}>
          Log meeting or note
        </a>
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
          <h2>Details</h2>
          <form method="post" action={`/agencies/${a.id}/edit`}>
            <div class="fields">
              <div>
                <label>Agency name</label>
                <input type="text" name="name" value={a.name} required />
              </div>
              <div>
                <label>Website</label>
                <input type="url" name="website" value={a.website ?? ''} />
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
            <p>
              <button>Save details</button>
            </p>
          </form>
        </section>
      </div>

      <section class="card">
        <h2>Contacts</h2>
        {contacts.map((c) => (
          <div class="item row">
            <b>{c.name}</b>
            {c.role && <span class="muted">{c.role}</span>}
            {c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}
            {c.linkedin && (
              <a href={c.linkedin} target="_blank" rel="noopener">
                LinkedIn
              </a>
            )}
            <form class="inline" method="post" action={`/contacts/${c.id}/delete`}>
              <button class="link small">Remove</button>
            </form>
          </div>
        ))}
        <form method="post" action={`/agencies/${a.id}/contacts`}>
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

      <section class="card">
        <h2>Timeline</h2>
        {timeline.length === 0 && <p class="muted">Nothing logged yet.</p>}
        {timeline.map((e) => (
          <TimelineItem e={e} />
        ))}
      </section>
      <script dangerouslySetInnerHTML={{ __html: comboScript }} />
    </Layout>
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

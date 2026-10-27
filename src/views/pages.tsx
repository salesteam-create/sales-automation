import type { FC } from 'hono/jsx';
import type { NoteAnalysis } from '../ai';
import { followupText, formatDay, formatShort, relativeDay } from '../dates';
import type { Agency, Contact, Sort, Suggestion, TimelineEntry } from '../db';
import { CHANGE_LABELS, type AgencyIntel, type WatchedPage, type WebChange } from '../intel';
import type { Dashboard, Feed, Nav, Range } from '../reports';
import { ALLOWED_COMBOS, FRAMEWORK_OPTIONS, LEAD_STATUSES, STATUSES, TIMELINE_TYPES } from '../rules';
import { PAGE_KINDS, PAGE_KIND_LABELS } from '../web';
import { Avatar, DateCell, Empty, FollowupActions, FollowupButtons, FollowupMenu, Layout, Notice, StageBadge, TempBadge } from './layout';
import { Icon } from './icons';

export interface ImportIssueRow {
  id: number;
  agency_id: number | null;
  agency_name: string | null;
  row_number: number | null;
  kind: string;
  detail: string;
}

interface Base {
  nav: Nav;
  today: string;
  msg?: string | null;
  error?: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  followup: 'Follow-up',
  status_change: 'Status change',
  meeting: 'Meeting',
  call: 'Call',
  email: 'Email',
  note: 'Note',
};
const label = (type: string) => TYPE_LABELS[type] ?? type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ');
const money = (currency: string, n: number) => `${currency} ${n.toLocaleString('en-GB')}`;
const short = (currency: string, n: number) => (n >= 10_000 ? `${currency} ${Math.round(n / 1000)}k` : money(currency, n));
const domain = (url: string | null) => (url ? url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : '');
const steps = (a: Agency): string[] => {
  if (!a.next_steps) return [];
  try {
    return JSON.parse(a.next_steps) as string[];
  } catch {
    return [];
  }
};

// ---------- shared pieces ----------

const AgencyCell: FC<{ a: Agency }> = ({ a }) => (
  <span class="who-cell">
    <Avatar name={a.name} />
    <span style="min-width:0">
      <a class="nm" href={`/agencies/${a.id}`}>
        {a.name}
      </a>
      <span class="dm">{[a.country, domain(a.website)].filter(Boolean).join(' · ') || 'No website'}</span>
    </span>
  </span>
);

const SuggestionRow: FC<{ s: Suggestion; back: string; showAgency?: boolean }> = ({ s, back, showAgency }) => (
  <li>
    <span class="bd">
      <span class="ln">
        {showAgency && (
          <a class="nm" href={`/agencies/${s.agency_id}`} style="font-size:14px;font-weight:600">
            {s.agency_name}
          </a>
        )}
        <span class="meta">move to</span>
        <StageBadge status={s.to_status} />
        <TempBadge lead={s.to_lead_status} />
      </span>
      <span class="sub">
        {s.source === 'no_reply' ? 'No-reply rule' : s.source === 'web' ? 'Website signal' : 'From meeting notes'} · {s.reason}
      </span>
    </span>
    <span class="actions">
      <form method="post" action={`/suggestions/${s.id}/accept`}>
        <input type="hidden" name="back" value={back} />
        <button class="btn btn--primary btn--sm">Accept</button>
      </form>
      <form method="post" action={`/suggestions/${s.id}/dismiss`}>
        <input type="hidden" name="back" value={back} />
        <button class="btn btn--sm btn--quiet">Dismiss</button>
      </form>
    </span>
  </li>
);

const ChangeRow: FC<{ c: WebChange; today: string; showAgency?: boolean }> = ({ c, today, showAgency }) => (
  <li>
    <span class="bd">
      <span class="ln">
        {showAgency && (
          <a class="nm" href={`/agencies/${c.agency_id}`} style="font-size:14px;font-weight:600">
            {c.agency_name}
          </a>
        )}
        <span class={c.is_opportunity ? 'badge badge--opportunity' : 'badge'}>
          {c.label ? (CHANGE_LABELS[c.label] ?? c.label) : 'Not labelled yet'}
        </span>
        <span class="meta">
          {c.page_kind} · {formatShort(c.detected_at.slice(0, 10), today)}
        </span>
      </span>
      <span class="sub">
        {c.title ?? 'Website updated'}
        {c.summary ? ` · ${c.summary}` : ''}
        {c.opportunity_reason ? ` · ${c.opportunity_reason}` : ''}
      </span>
    </span>
    <a class="btn btn--sm btn--icon" href={c.page_url} target="_blank" rel="noopener" aria-label="Open the page">
      <Icon name="website" />
    </a>
  </li>
);

const QueueRow: FC<{ a: Agency; today: string; back: string }> = ({ a, today, back }) => {
  const next = steps(a)[0];
  const bits = [next, a.country, a.unanswered_count > 0 ? `${a.unanswered_count} without reply` : null].filter(Boolean);
  return (
    <li>
      <Avatar name={a.name} />
      <span class="bd">
        <span class="ln">
          <a class="nm" href={`/agencies/${a.id}`} style="font-size:14px;font-weight:600">
            {a.name}
          </a>
          <StageBadge status={a.status} />
          <TempBadge lead={a.lead_status} />
        </span>
        <span class="sub">{bits.join(' · ') || 'No next step yet'}</span>
      </span>
      <span class="date" style="flex:none;width:140px">
        {a.next_followup_date ? formatShort(a.next_followup_date, today) : '—'}
        <span class={`rel${a.next_followup_date && a.next_followup_date < today ? ' overdue' : a.next_followup_date === today ? ' today' : ''}`}>
          {followupText(a.next_followup_date, today)}
        </span>
      </span>
      <FollowupActions agencyId={a.id} hasFollowup={!!a.next_followup_date} back={back} today={today} />
    </li>
  );
};

// ---------- Today ----------

const TABS = [
  ['all', 'All'],
  ['overdue', 'Overdue'],
  ['today', 'Due today'],
  ['upcoming', 'Upcoming'],
] as const;

export type FeedTab = (typeof TABS)[number][0];

export const FeedPage: FC<Base & { feed: Feed; tab: FeedTab }> = ({ feed, tab, today, nav, msg }) => {
  const needs = feed.overdue.length + feed.dueToday.length;
  const rows =
    tab === 'overdue' ? feed.overdue : tab === 'today' ? feed.dueToday : tab === 'upcoming' ? feed.upcoming : [...feed.overdue, ...feed.dueToday];
  const counts: Record<FeedTab, number> = { all: needs, overdue: feed.overdue.length, today: feed.dueToday.length, upcoming: feed.upcoming.length };
  const sub = [
    needs ? `${needs} follow-up${needs === 1 ? '' : 's'} need you` : 'nothing needs you today',
    feed.suggestions.length ? `${feed.suggestions.length} to decide` : null,
    feed.webUpdates.length ? `${feed.webUpdates.length} website update${feed.webUpdates.length === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Layout title="Today" active="feed" nav={nav}>
      <div class="page-hd">
        <div>
          <h1>Today</h1>
          <p class="sub">
            {formatDay(today)} · {sub.charAt(0).toUpperCase() + sub.slice(1)}.
          </p>
        </div>
        <div class="acts">
          <a class="btn btn--primary" href="/agencies/new">
            <Icon name="add" />
            Add agency
          </a>
        </div>
      </div>

      {msg && <Notice msg={msg} kind="ok" />}

      <div class="stats">
        <a class="stat stat--danger" href="/?tab=overdue">
          <span class="ico">
            <Icon name="overdue" lg />
          </span>
          <span>
            <span class="v">{feed.overdue.length}</span>
            <span class="k">Overdue</span>
            <span class="d">Follow-ups past due</span>
          </span>
        </a>
        <a class="stat stat--warning" href="/?tab=today">
          <span class="ico">
            <Icon name="clock" lg />
          </span>
          <span>
            <span class="v">{feed.dueToday.length}</span>
            <span class="k">Due today</span>
            <span class="d">Needs your attention</span>
          </span>
        </a>
        <a class="stat stat--brand" href="/?tab=upcoming">
          <span class="ico">
            <Icon name="calendar" lg />
          </span>
          <span>
            <span class="v">{feed.upcoming.length}</span>
            <span class="k">Upcoming</span>
            <span class="d">Next 7 days</span>
          </span>
        </a>
        <span class="stat">
          <span class="ico">
            <Icon name="done" lg />
          </span>
          <span>
            <span class="v">{feed.completed}</span>
            <span class="k">Completed</span>
            <span class="d">Last 7 days</span>
          </span>
        </span>
      </div>

      <section class="panel">
        <nav class="tabs" style="padding:0 var(--space-4)">
          {TABS.map(([key, label]) => (
            <a href={key === 'all' ? '/' : `/?tab=${key}`} aria-current={tab === key ? 'page' : undefined}>
              {label} <span class="n">{counts[key]}</span>
            </a>
          ))}
        </nav>
        {rows.length === 0 ? (
          <Empty
            icon="done"
            title={tab === 'upcoming' ? 'Nothing scheduled this week' : 'Nothing due'}
            body={
              tab === 'upcoming'
                ? 'No follow-ups fall in the next seven days.'
                : feed.upcoming.length
                  ? `You are clear for today. ${feed.upcoming.length} follow-up${feed.upcoming.length === 1 ? ' is' : 's are'} due in the next seven days.`
                  : 'No follow-ups are due. Log a meeting to schedule the next one.'
            }
          >
            {feed.upcoming.length > 0 && tab !== 'upcoming' && (
              <a class="btn" href="/?tab=upcoming">
                See the week
              </a>
            )}
          </Empty>
        ) : (
          <ul class="queue">
            {rows.slice(0, 25).map((a) => (
              <QueueRow a={a} today={today} back={tab === 'all' ? '/' : `/?tab=${tab}`} />
            ))}
          </ul>
        )}
        {rows.length > 25 && (
          <div class="panel-ft">
            <a class="link" href="/agencies?overdue=1">
              Show the remaining {rows.length - 25} in the full list
            </a>
          </div>
        )}
      </section>

      <div class="cols">
        <section class="panel">
          <div class="panel-hd">
            <h2>Decide</h2>
            <span class="count">{feed.suggestions.length}</span>
          </div>
          {feed.suggestions.length === 0 ? (
            <Empty title="Nothing to decide" body="Status suggestions from the no-reply rule and from meeting notes land here." />
          ) : (
            <ul class="queue queue--wrap">
              {feed.suggestions.slice(0, 6).map((s) => (
                <SuggestionRow s={s} back="/" showAgency />
              ))}
            </ul>
          )}
        </section>

        <section class="panel">
          <div class="panel-hd">
            <h2>Website updates</h2>
            <span class="count">{feed.webUpdates.length}</span>
            <div class="acts">
              {feed.webUpdates.some((c) => c.is_opportunity) && (
                <span class="badge badge--opportunity">{feed.webUpdates.filter((c) => c.is_opportunity).length === 1
                    ? '1 opportunity'
                    : `${feed.webUpdates.filter((c) => c.is_opportunity).length} opportunities`}</span>
              )}
            </div>
          </div>
          {feed.webUpdates.length === 0 ? (
            <Empty title="No changes in the last day" body="Agency websites are checked overnight. The first check of a page sets a baseline." />
          ) : (
            <ul class="queue queue--wrap">
              {feed.webUpdates.slice(0, 5).map((c) => (
                <ChangeRow c={c} today={today} showAgency />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Layout>
  );
};

// ---------- Dashboard ----------

const RANGES: [Range, string][] = [
  ['week', 'Week'],
  ['month', 'Month'],
  ['quarter', 'Quarter'],
  ['all', 'All time'],
];

const STAGE_VAR: Record<string, string> = {
  Won: 'var(--stage-won)',
  Opportunity: 'var(--stage-opportunity)',
  'Potential (Warm)': 'var(--stage-potential)',
  'Email Sequence': 'var(--stage-sequence)',
  'Not Interested': 'var(--stage-out)',
};

const ACTIVITY_ICON: Record<string, 'done' | 'note' | 'trend' | 'website'> = {
  followup: 'done',
  status_change: 'trend',
  meeting: 'note',
  call: 'note',
  email: 'note',
  note: 'note',
};

export const DashboardPage: FC<Base & { d: Dashboard; range: Range; currency: string }> = ({ d, range, today, nav, currency }) => {
  const pct = (n: number) => (d.total ? (n / d.total) * 100 : 0);
  const top = d.countries.slice(0, 6);
  const rest = d.countries.slice(6).reduce((s, c) => s + c.total, 0);
  const max = Math.max(1, ...top.map((c) => c.total), rest);
  const won = d.pipeline.find((p) => p.status === 'Won')?.count ?? 0;
  const opp = d.pipeline.find((p) => p.status === 'Opportunity')?.count ?? 0;

  return (
    <Layout title="Dashboard" active="dashboard" nav={nav}>
      <div class="page-hd">
        <div>
          <h1>Dashboard</h1>
          <p class="sub">Agencies first met in the selected period. Agencies with no meeting date appear under All time only.</p>
        </div>
        <div class="acts chip-row">
          {RANGES.map(([r, label]) =>
            r === range ? (
              <span class="chip" aria-pressed="true">
                {label}
              </span>
            ) : (
              <a class="chip" href={`/dashboard?range=${r}`}>
                {label}
              </a>
            ),
          )}
        </div>
      </div>

      <div class="tiles tiles--6">
        <a class="tile" href="/agencies">
          <span class="ico">
            <Icon name="agencies" />
          </span>
          <span class="v">{d.total}</span>
          <span class="k">Total agencies</span>
          <span class="d">In this period</span>
        </a>
        <a class="tile" href="/agencies?overdue=1">
          <span class="ico">
            <Icon name="overdue" />
          </span>
          <span class="v" style={d.overdue.length ? 'color:var(--danger)' : undefined}>
            {d.overdue.length}
          </span>
          <span class="k">Overdue</span>
          <span class="d">Needs you today</span>
        </a>
        <a class="tile" href="/agencies?status=Won">
          <span class="ico">
            <Icon name="done" />
          </span>
          <span class="v">{won}</span>
          <span class="k">Won</span>
          <span class="d">{Math.round(pct(won))}% of total</span>
        </a>
        <a class="tile" href="/agencies?status=Opportunity">
          <span class="ico">
            <Icon name="trend" />
          </span>
          <span class="v">{opp}</span>
          <span class="k">Opportunity</span>
          <span class="d">{Math.round(pct(opp))}% of total</span>
        </a>
        <a class="tile" href="/agencies?deal=1">
          <span class="ico">
            <Icon name="note" />
          </span>
          <span class="v">{d.deals.length}</span>
          <span class="k">Deals in hand</span>
          <span class="d">{d.dealTotal > 0 ? money(currency, d.dealTotal) : 'No value set'}</span>
        </a>
        <a class="tile" href="/">
          <span class="ico">
            <Icon name="website" />
          </span>
          <span class="v">{d.webUpdates.length}</span>
          <span class="k">Website updates</span>
          <span class="d">{d.webUpdates.filter((c) => c.is_opportunity).length} opportunities</span>
        </a>
      </div>

      <section class="panel">
        <div class="panel-hd">
          <h2>Pipeline</h2>
          <span class="count">{d.total} agencies</span>
        </div>
        <div class="panel-bd">
          {d.total === 0 ? (
            <Empty icon="agencies" title="No agencies in this period" body="Widen the range, or import the sheet to get started." />
          ) : (
            <>
              <div class="pipe" role="img" aria-label={d.pipeline.map((p) => `${p.status} ${p.count}`).join(', ')}>
                {d.pipeline.map((p, i) => (p.count ? <span class={`s${i + 1}`} style={`width:${pct(p.count)}%`} /> : null))}
              </div>
              <ul class="legend">
                {d.pipeline.map((p) => (
                  <li>
                    <i style={`background:${STAGE_VAR[p.status]}`} />
                    <a class="lbl" href={`/agencies?status=${encodeURIComponent(p.status)}`}>
                      {p.status}
                    </a>
                    <span class="v">{p.count}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      <div class="cols">
        <section class="panel">
          <div class="panel-hd">
            <h2>Agencies by country</h2>
          </div>
          <div class="panel-bd">
            {top.length === 0 ? (
              <Empty icon="agencies" title="No countries yet" />
            ) : (
              <div class="hbars">
                {top.map((c) => (
                  <div class="hbar">
                    <span class="nm">
                      <a href={`/agencies?country=${encodeURIComponent(c.country)}`}>{c.country}</a>
                    </span>
                    <span class="bar-track">
                      <span class="bar-fill" style={`width:${(c.total / max) * 100}%`} />
                    </span>
                    <span class="v">{c.total}</span>
                  </div>
                ))}
                {rest > 0 && (
                  <div class="hbar">
                    <span class="nm muted">Others</span>
                    <span class="bar-track">
                      <span
                        class="bar-fill"
                        style={`width:${(rest / max) * 100}%;background:var(--chart-grid);box-shadow:inset 0 0 0 1px var(--chart-axis)`}
                      />
                    </span>
                    <span class="v">{rest}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        <section class="panel">
          <div class="panel-hd">
            <h2>Deals in hand</h2>
            <span class="count">{d.deals.length}</span>
            {d.dealTotal > 0 && (
              <div class="acts">
                <span class="meta">{money(currency, d.dealTotal)}</span>
              </div>
            )}
          </div>
          <div class="panel-bd">
            {d.deals.length === 0 ? (
              <Empty title="No deals in hand" body="An agency appears here once it is Hot or has a deal recorded under Details." />
            ) : (
              d.deals.slice(0, 6).map((a) => (
                <div class="deal">
                  <Avatar name={a.name} sm />
                  <span style="min-width:0">
                    <a class="nm" href={`/agencies/${a.id}`} style="font-size:13px;font-weight:600">
                      {a.name}
                    </a>
                    <span class="meta" style="display:block">
                      {a.deal_description ?? 'No description'}
                    </span>
                  </span>
                  <StageBadge status={a.status} />
                  <span class="amt">{a.deal_value != null ? short(currency, a.deal_value) : '—'}</span>
                </div>
              ))
            )}
          </div>
          {d.deals.length > 6 && (
            <div class="panel-ft">
              <a class="link" href="/agencies?deal=1">
                Show {d.deals.length - 6} more
              </a>
            </div>
          )}
        </section>
      </div>

      <section class="panel">
        <div class="panel-hd">
          <h2>Recent activity</h2>
        </div>
        <div class="panel-bd">
          {d.activity.length === 0 ? (
            <Empty title="Nothing logged yet" body="Follow-ups, notes and status changes made in the app show up here." />
          ) : (
            <ul class="feed">
              {d.activity.map((e) => (
                <li>
                  <span class={e.type === 'followup' || e.type === 'status_change' ? 'ico ok' : 'ico'}>
                    <Icon name={ACTIVITY_ICON[e.type] ?? 'note'} />
                  </span>
                  <span class="bd">
                    <span class="t1">
                      <a href={`/agencies/${e.agency_id}`}>{e.agency_name}</a> · {label(e.type)}
                    </span>
                    <span class="t2">{e.summary || e.raw_notes || 'No detail'}</span>
                  </span>
                  <span class="ago">{e.date ? relativeDay(e.date, today) : e.created_at.slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Layout>
  );
};

// ---------- Agency list ----------

const SORT_LABELS: [Sort, string][] = [
  ['next', 'Next follow-up'],
  ['name', 'Name (A–Z)'],
  ['last', 'Last contact'],
  ['noreply', 'Most without reply'],
];

export interface ListFilters {
  q?: string;
  status?: string;
  lead?: string;
  country?: string;
  overdue?: boolean;
  deal?: boolean;
}

// Keeps every filter when only one of them changes.
function listUrl(f: ListFilters, sort: Sort, page: number, over?: Partial<Record<string, string | undefined>>): string {
  const p = new URLSearchParams();
  const base: Record<string, string | undefined> = {
    q: f.q,
    status: f.status,
    lead: f.lead,
    country: f.country,
    overdue: f.overdue ? '1' : undefined,
    deal: f.deal ? '1' : undefined,
    sort: sort === 'next' ? undefined : sort,
    page: page > 1 ? String(page) : undefined,
    ...over,
  };
  for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/agencies?${s}` : '/agencies';
}

const AgencyCard: FC<{ a: Agency; today: string; back: string }> = ({ a, today, back }) => (
  <div class="rowcard">
    <div class="top">
      <AgencyCell a={a} />
      <span class="right">
        <FollowupMenu agencyId={a.id} hasFollowup={!!a.next_followup_date} back={back} today={today} />
      </span>
    </div>
    <div class="pills">
      <StageBadge status={a.status} />
      <TempBadge lead={a.lead_status} />
      {a.unanswered_count > 0 && <span class="badge">{a.unanswered_count} without reply</span>}
    </div>
    <div class="dates">
      <span>
        <span class="k">Last contact</span>
        <DateCell day={a.last_contact_date} today={today} />
      </span>
      <span>
        <span class="k">Next follow-up</span>
        <DateCell day={a.next_followup_date} today={today} followup />
      </span>
    </div>
    {a.next_followup_date && (
      <div class="row-acts">
        <FollowupButtons agencyId={a.id} back={back} wide />
      </div>
    )}
  </div>
);

export const AgencyListPage: FC<
  Base & {
    agencies: Agency[];
    countries: string[];
    filters: ListFilters;
    sort: Sort;
    page: number;
    pageSize: number;
    total: number;
    grandTotal: number;
  }
> = ({ agencies, countries, filters, sort, page, pageSize, total, grandTotal, today, nav, msg }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const active = [filters.country, filters.status, filters.lead, filters.overdue ? 'overdue only' : null, filters.deal ? 'has a deal' : null, filters.q]
    .filter(Boolean)
    .join(', ');
  const back = listUrl(filters, sort, page);
  const sortLink = (key: Sort) => listUrl(filters, key, 1, { page: undefined });

  return (
    <Layout title="Agencies" active="agencies" nav={nav} search={filters.q}>
      <div class="page-hd">
        <div>
          <h1>Agencies</h1>
          <p class="sub">
            {total === grandTotal ? `${total} agencies` : `Showing ${total} of ${grandTotal}`}
            {active ? ` · ${active}` : ''}
          </p>
        </div>
        <div class="acts">
          <a class="btn btn--primary" href="/agencies/new">
            <Icon name="add" />
            Add agency
          </a>
        </div>
      </div>

      {msg && <Notice msg={msg} kind="ok" />}

      <section class="panel">
        <form class="toolbar" method="get" action="/agencies" data-autosubmit>
          <input type="hidden" name="q" value={filters.q ?? ''} />
          <select class="input input--auto" name="status" aria-label="Stage">
            <option value="">All stages</option>
            {STATUSES.map((s) => (
              <option selected={filters.status === s}>{s}</option>
            ))}
          </select>
          <select class="input input--auto" name="lead" aria-label="Lead temperature">
            <option value="">All lead temperature</option>
            {LEAD_STATUSES.map((s) => (
              <option selected={filters.lead === s}>{s}</option>
            ))}
          </select>
          <select class="input input--auto" name="country" aria-label="Country">
            <option value="">All countries</option>
            {countries.map((c) => (
              <option selected={filters.country === c}>{c}</option>
            ))}
          </select>
          <label class="chip" aria-pressed={filters.overdue ? 'true' : 'false'}>
            <input type="checkbox" name="overdue" value="1" checked={filters.overdue} />
            Overdue only
          </label>
          <label class="chip" aria-pressed={filters.deal ? 'true' : 'false'}>
            <input type="checkbox" name="deal" value="1" checked={filters.deal} />
            Has a deal
          </label>
          <button class="btn btn--sm" data-fallback>Apply</button>
          {active && (
            <a class="btn btn--sm btn--quiet" href="/agencies">
              Clear
            </a>
          )}
          <span class="right">
            <span class="meta">Sort by</span>
            <select class="input input--auto" name="sort" aria-label="Sort by">
              {SORT_LABELS.map(([k, label]) => (
                <option value={k} selected={sort === k}>
                  {label}
                </option>
              ))}
            </select>
          </span>
        </form>

        {agencies.length === 0 ? (
          <Empty
            icon="agencies"
            title={active ? 'No agencies match' : 'No agencies yet'}
            body={active ? 'Try a wider filter, or clear them all.' : 'Import the sheet, or add the first agency by hand.'}
          >
            <a class="btn" href={active ? '/agencies' : '/import'}>
              {active ? 'Clear filters' : 'Go to import'}
            </a>
          </Empty>
        ) : (
          <>
            <div class="table-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>
                      <a href={sortLink('name')}>Agency{sort === 'name' && <Icon name="chevronDown" sm />}</a>
                    </th>
                    <th>Stage</th>
                    <th>Lead temp.</th>
                    <th>
                      <a href={sortLink('last')}>Last contact{sort === 'last' && <Icon name="chevronDown" sm />}</a>
                    </th>
                    <th>
                      <a href={sortLink('next')}>Next follow-up{sort === 'next' && <Icon name="chevronDown" sm />}</a>
                    </th>
                    <th class="num">
                      <a href={sortLink('noreply')}>No reply{sort === 'noreply' && <Icon name="chevronDown" sm />}</a>
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {agencies.map((a) => (
                    <tr>
                      <td>
                        <AgencyCell a={a} />
                      </td>
                      <td>
                        <StageBadge status={a.status} />
                      </td>
                      <td>
                        <TempBadge lead={a.lead_status} />
                      </td>
                      <td>
                        <DateCell day={a.last_contact_date} today={today} />
                      </td>
                      <td>
                        <DateCell day={a.next_followup_date} today={today} followup />
                      </td>
                      <td class="num">{a.unanswered_count}</td>
                      <td>
                        <FollowupActions agencyId={a.id} hasFollowup={!!a.next_followup_date} back={back} today={today} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div class="rowcards">
              {agencies.map((a) => (
                <AgencyCard a={a} today={today} back={back} />
              ))}
            </div>
            <div class="panel-ft" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <span class="meta">
                Showing {from}–{to} of {total}
              </span>
              {pages > 1 && (
                <nav class="pager" style="margin-left:auto" aria-label="Pages">
                  {page > 1 && (
                    <a class="btn btn--sm btn--icon" href={listUrl(filters, sort, page - 1)} aria-label="Previous page">
                      <Icon name="chevronLeft" />
                    </a>
                  )}
                  {Array.from({ length: pages }, (_, i) => i + 1)
                    .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1)
                    .map((n, i, arr) => (
                      <>
                        {i > 0 && arr[i - 1] !== n - 1 && <span class="meta">…</span>}
                        <a class="n" href={listUrl(filters, sort, n)} aria-current={n === page ? 'page' : undefined}>
                          {n}
                        </a>
                      </>
                    ))}
                  {page < pages && (
                    <a class="btn btn--sm btn--icon" href={listUrl(filters, sort, page + 1)} aria-label="Next page">
                      <Icon name="chevronRight" />
                    </a>
                  )}
                </nav>
              )}
            </div>
          </>
        )}
      </section>
      <script dangerouslySetInnerHTML={{ __html: autoSubmitScript }} />
    </Layout>
  );
};

// ---------- forms ----------

// Keeps the Lead Status dropdown limited to combinations allowed for the chosen Status.
const comboScript = `
(function(){var combos=${JSON.stringify(ALLOWED_COMBOS)};
document.querySelectorAll('[data-combo]').forEach(function(f){
var s=f.querySelector('[name=status]'),l=f.querySelector('[name=lead_status]');
if(!s||!l)return;
function sync(){var ok=combos[s.value]||[];Array.prototype.forEach.call(l.options,function(o){o.disabled=ok.indexOf(o.value)<0});
if(ok.indexOf(l.value)<0)l.value=ok[0];}
s.addEventListener('change',sync);sync();});})();`;

// Filters apply as soon as they change. The Apply button is the no-JavaScript fallback and hides itself.
const autoSubmitScript = `
(function(){var f=document.querySelector('[data-autosubmit]');if(!f)return;
f.querySelectorAll('[data-fallback]').forEach(function(b){b.hidden=true});
// Empty fields are dropped so the address bar carries only the filters that are set.
f.addEventListener('submit',function(){Array.prototype.forEach.call(f.elements,function(el){
if((el.type==='text'||el.type==='search'||el.type==='hidden'||el.tagName==='SELECT')&&!el.value)el.disabled=true})});
f.querySelectorAll('select,input[type=checkbox]').forEach(function(el){
el.addEventListener('change',function(){f.requestSubmit?f.requestSubmit():f.submit()})});})();`;

// Asks before buttons marked data-confirm submit.
const confirmScript = `
document.querySelectorAll('[data-confirm]').forEach(function(b){b.addEventListener('click',function(e){
if(!confirm(b.getAttribute('data-confirm')))e.preventDefault();});});`;

const StatusFields: FC<{ status?: string; lead?: string }> = ({ status, lead }) => (
  <>
    <label class="field">
      <span class="lbl">Stage</span>
      <select class="input" name="status">
        {STATUSES.map((s) => (
          <option selected={s === status}>{s}</option>
        ))}
      </select>
    </label>
    <label class="field">
      <span class="lbl">Lead temperature</span>
      <select class="input" name="lead_status">
        {LEAD_STATUSES.map((s) => (
          <option selected={s === lead}>{s}</option>
        ))}
      </select>
    </label>
  </>
);

export const NewAgencyPage: FC<Base> = ({ nav, error }) => (
  <Layout title="New agency" active="new" nav={nav}>
    <div class="page-hd">
      <div>
        <h1>Add an agency</h1>
        <p class="sub">The first meeting is logged straight after, so you can paste notes in one go.</p>
      </div>
    </div>
    <Notice msg={error} />
    <section class="panel">
      <form method="post" action="/agencies" data-combo>
        <div class="panel-bd" style="padding-top:var(--space-4)">
          <div class="form-grid">
            <label class="field">
              <span class="lbl">Agency name *</span>
              <input class="input" type="text" name="name" required autofocus />
            </label>
            <label class="field">
              <span class="lbl">Website</span>
              <input class="input" type="url" name="website" placeholder="https://" />
              <span class="hint">Starts the overnight website scan.</span>
            </label>
            <label class="field">
              <span class="lbl">Country</span>
              <input class="input" type="text" name="country" />
            </label>
            <label class="field">
              <span class="lbl">Contact name</span>
              <input class="input" type="text" name="contact_name" />
            </label>
            <StatusFields status="Potential (Warm)" lead="Warm" />
          </div>
          <div class="form-actions">
            <button class="btn btn--primary">Create and log the first meeting</button>
            <a class="btn btn--quiet" href="/agencies">
              Cancel
            </a>
          </div>
        </div>
      </form>
    </section>
    <script dangerouslySetInnerHTML={{ __html: comboScript }} />
  </Layout>
);

// ---------- Agency page ----------

const TimelineItem: FC<{ e: TimelineEntry; today: string }> = ({ e, today }) => {
  let kp: Partial<NoteAnalysis> | null = null;
  try {
    kp = e.key_points ? (JSON.parse(e.key_points) as Partial<NoteAnalysis>) : null;
  } catch {
    kp = null;
  }
  const points = [
    kp?.interest_level ? `Interest ${kp.interest_level}` : null,
    kp?.services_needed?.length ? `Needs: ${kp.services_needed.join(', ')}` : null,
    kp?.projects?.length ? `Projects: ${kp.projects.join(', ')}` : null,
    kp?.objections?.length ? `Objections: ${kp.objections.join(', ')}` : null,
  ].filter(Boolean);
  return (
    <li>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;flex-wrap:wrap">
        <span class="badge">{label(e.type)}</span>
        <span class="meta">
          {e.date ? `${formatShort(e.date, today)} · ${relativeDay(e.date, today)}` : 'No date'}
          {e.source === 'import' ? ' · from sheet' : ''}
        </span>
      </div>
      {e.summary ? (
        <>
          <p style="white-space:pre-wrap">{e.summary}</p>
          {points.length > 0 && <p class="meta">{points.join(' · ')}</p>}
          {e.next_step && (
            <p style="font-size:13px">
              <b>Next step:</b> {e.next_step}
            </p>
          )}
          {e.raw_notes && (
            <details>
              <summary>Original notes</summary>
              <pre class="notes">{e.raw_notes}</pre>
            </details>
          )}
        </>
      ) : (
        <p style="white-space:pre-wrap">{e.raw_notes}</p>
      )}
    </li>
  );
};

export const AgencyPage: FC<
  Base & {
    agency: Agency;
    contacts: Contact[];
    timeline: TimelineEntry[];
    suggestions: Suggestion[];
    issues: ImportIssueRow[];
    intel: AgencyIntel | null;
    pages: WatchedPage[];
    changes: WebChange[];
    currency: string;
  }
> = ({ agency: a, contacts, timeline, suggestions, issues, intel, pages, changes, today, nav, currency, msg, error }) => {
  const back = `/agencies/${a.id}`;
  const list = steps(a);
  const late = !!a.next_followup_date && a.next_followup_date < today;
  const opportunities = changes.filter((c) => c.is_opportunity).length;

  return (
    <Layout title={a.name} active="agencies" nav={nav}>
      <p class="crumb">
        <a href="/agencies">Agencies</a>
        <Icon name="chevronRight" sm />
        <span>{a.name}</span>
      </p>

      <div class="page-hd">
        <div style="display:flex;gap:14px;align-items:center;min-width:0">
          <Avatar name={a.name} lg />
          <div style="min-width:0">
            <h1>{a.name}</h1>
            <p class="sub" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
              {a.website ? (
                <a class="link" href={a.website} target="_blank" rel="noopener">
                  {domain(a.website)} <Icon name="website" sm />
                </a>
              ) : (
                <span>{a.website_note ?? 'No website'}</span>
              )}
              {a.country && <span>{a.country}</span>}
            </p>
          </div>
        </div>
        <div class="acts">
          <StageBadge status={a.status} />
          <TempBadge lead={a.lead_status} />
          <a class="btn" href={`/agencies/${a.id}/edit`}>
            <Icon name="edit" />
            Edit
          </a>
          <a class="btn btn--primary" href={`/agencies/${a.id}/log`}>
            <Icon name="note" />
            Log meeting
          </a>
        </div>
      </div>

      {msg && <Notice msg={msg} kind="ok" />}
      <Notice msg={error} />

      {suggestions.map((s) => (
        <div class="notice notice--warn">
          <Icon name="trend" />
          <span>
            <b>
              Suggested move to {s.to_status} / {s.to_lead_status}.
            </b>{' '}
            {s.source === 'no_reply' ? 'No-reply rule' : s.source === 'web' ? 'Website signal' : 'From meeting notes'}: {s.reason}
          </span>
          <span class="acts">
            <form method="post" action={`/suggestions/${s.id}/dismiss`}>
              <input type="hidden" name="back" value={back} />
              <button class="btn btn--sm">Dismiss</button>
            </form>
            <form method="post" action={`/suggestions/${s.id}/accept`}>
              <input type="hidden" name="back" value={back} />
              <button class="btn btn--sm btn--primary">Accept</button>
            </form>
          </span>
        </div>
      ))}

      {issues.length > 0 && (
        <div class="notice notice--warn">
          <Icon name="overdue" />
          <span>
            <b>
              {issues.length} import row{issues.length === 1 ? '' : 's'} to check.
            </b>{' '}
            {issues[0].detail}
          </span>
          <span class="acts">
            <a class="btn btn--sm" href="/import/report">
              Open the report
            </a>
          </span>
        </div>
      )}

      <div class="split">
        <div style="display:grid;gap:var(--space-4);align-content:start">
          <section class="panel">
            <div class="panel-hd">
              <h2>Next action</h2>
              <div class="acts">
                <form method="post" action={`/agencies/${a.id}/next-steps`}>
                  <button class="btn btn--sm btn--quiet">Refresh steps</button>
                </form>
              </div>
            </div>
            <div class="panel-bd">
              <div class={late ? 'due-strip late' : 'due-strip'}>
                <span class="date" style={late ? 'color:var(--danger);font-weight:600' : undefined}>
                  {a.next_followup_date ? formatShort(a.next_followup_date, today) : '—'}
                  <span class={`rel${late ? ' overdue' : a.next_followup_date === today ? ' today' : ''}`}>{followupText(a.next_followup_date, today)}</span>
                </span>
                <span class="meta">
                  Last contact {a.last_contact_date ? formatShort(a.last_contact_date, today) : 'never'}
                  {a.unanswered_count > 0 && ` · ${a.unanswered_count} follow-ups without reply`}
                </span>
                <FollowupActions agencyId={a.id} hasFollowup={!!a.next_followup_date} back={back} today={today} />
              </div>
              {list.length ? (
                <ol class="steps">
                  {list.map((s) => (
                    <li>{s}</li>
                  ))}
                </ol>
              ) : (
                <p class="meta" style="margin:0">
                  No steps drafted yet. They refresh each morning for agencies with something new or due, or use Refresh steps.
                </p>
              )}
              {a.next_steps_updated_at && (
                <p class="meta" style="margin:12px 0 0">
                  Drafted from the timeline, refreshed {formatShort(a.next_steps_updated_at.slice(0, 10), today)}.
                </p>
              )}
            </div>
          </section>

          <section class="panel">
            <div class="panel-hd">
              <h2>Timeline</h2>
              <span class="count">{timeline.length}</span>
              <div class="acts">
                {timeline.length > 0 && (
                  <a class="btn btn--sm btn--quiet" href={`/agencies/${a.id}/edit#timeline`}>
                    Edit entries
                  </a>
                )}
              </div>
            </div>
            {timeline.length === 0 ? (
              <Empty title="Nothing logged yet" body="Paste rough notes or a full transcript after a call. The summary and next step are drafted for you.">
                <a class="btn btn--primary" href={`/agencies/${a.id}/log`}>
                  Log the first meeting
                </a>
              </Empty>
            ) : (
              <>
                <ul class="tl">
                  {timeline.slice(0, 6).map((e) => (
                    <TimelineItem e={e} today={today} />
                  ))}
                </ul>
                {timeline.length > 6 && (
                  <details class="panel-ft">
                    <summary>Show {timeline.length - 6} earlier entries</summary>
                    <ul class="tl" style="margin-top:8px">
                      {timeline.slice(6).map((e) => (
                        <TimelineItem e={e} today={today} />
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </section>
        </div>

        <div class="rail">
          <section class="panel">
            <div class="panel-hd">
              <h2>Details</h2>
              <div class="acts">
                <a class="btn btn--sm btn--quiet" href={`/agencies/${a.id}/edit`}>
                  Change
                </a>
              </div>
            </div>
            <div class="panel-bd">
              <dl class="kv">
                <dt>Stage</dt>
                <dd>
                  <StageBadge status={a.status} />
                </dd>
                <dt>Lead temp.</dt>
                <dd>
                  <TempBadge lead={a.lead_status} />
                </dd>
                <dt>Framework</dt>
                <dd>{a.framework ?? 'Not set'}</dd>
                <dt>Deal in hand</dt>
                <dd>
                  {a.deal_description ?? 'None'}
                  {a.deal_value != null && ` · ${money(currency, a.deal_value)}`}
                </dd>
                <dt>Last contact</dt>
                <dd>{a.last_contact_date ? formatDay(a.last_contact_date) : 'Never'}</dd>
              </dl>
            </div>
          </section>

          <section class="panel">
            <div class="panel-hd">
              <h2>Contacts</h2>
              <span class="count">{contacts.length}</span>
              <div class="acts">
                <a class="btn btn--sm btn--quiet" href={`/agencies/${a.id}/edit#contacts`}>
                  Add
                </a>
              </div>
            </div>
            <div class="panel-bd">
              {contacts.length === 0 ? (
                <p class="meta" style="margin:0">
                  No contacts yet.
                </p>
              ) : (
                contacts.map((c) => (
                  <div style="display:flex;align-items:center;gap:10px;padding:7px 0;min-width:0">
                    <Avatar name={c.name} sm />
                    <span style="min-width:0">
                      <span style="display:block;font-size:13px;font-weight:600">{c.name}</span>
                      <span class="meta">
                        {c.role ?? 'No role'}
                        {c.email && (
                          <>
                            {' · '}
                            <a class="link" href={`mailto:${c.email}`}>
                              {c.email}
                            </a>
                          </>
                        )}
                        {c.linkedin && (
                          <>
                            {' · '}
                            <a class="link" href={c.linkedin} target="_blank" rel="noopener">
                              LinkedIn
                            </a>
                          </>
                        )}
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <IntelSection agency={a} intel={intel} pages={pages} changes={changes} opportunities={opportunities} today={today} />
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: comboScript }} />
    </Layout>
  );
};

// ---------- website intelligence ----------

// Runs the refresh one small step at a time so each request stays within free-plan limits.
const refreshScript = (id: number) => `
(function(){var b=document.getElementById('intel-refresh'),o=document.getElementById('intel-progress');if(!b)return;
b.addEventListener('click',function(){b.disabled=true;var since='';var n=0;
function step(){fetch('/agencies/${id}/web/step',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'since='+encodeURIComponent(since)})
.then(function(r){return r.json()}).then(function(r){since=r.since;o.textContent=r.message;n++;
if(r.done||n>15){location.reload()}else{step()}}).catch(function(){o.textContent='Refresh failed. Try again later.';b.disabled=false})}
o.textContent='Reading website...';step();});})();`;

const IntelSection: FC<{
  agency: Agency;
  intel: AgencyIntel | null;
  pages: WatchedPage[];
  changes: WebChange[];
  opportunities: number;
  today: string;
}> = ({ agency: a, intel, pages, changes, opportunities, today }) => {
  const lastChecked = pages
    .map((p) => p.last_checked_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  return (
    <section class="panel">
      <div class="panel-hd">
        <h2>Website</h2>
        <div class="acts">{opportunities > 0 && <span class="badge badge--opportunity">{opportunities === 1 ? '1 opportunity' : `${opportunities} opportunities`}</span>}</div>
      </div>
      <div class="panel-bd">
        {!a.website ? (
          <p class="meta" style="margin:0">
            No website on file, so there is nothing to watch. Add one under Edit to start the scan.
          </p>
        ) : (
          <>
            {!intel ? (
              <p class="meta" style="margin:0 0 10px">
                Not scanned yet. The first scan runs overnight, or refresh it now.
              </p>
            ) : (
              <>
                {intel.summary && <p style="margin:0 0 10px;font-size:13px;line-height:19px">{intel.summary}</p>}
                {intel.gaps.length > 0 && (
                  <p style="margin:0 0 10px;font-size:13px;line-height:19px">
                    <b>Gaps:</b> {intel.gaps.map((g) => g.service).join(', ')}.
                  </p>
                )}
                {intel.upsell.length > 0 && (
                  <ul class="steps" style="font-size:13px;line-height:19px;margin-bottom:10px">
                    {intel.upsell.slice(0, 2).map((u) => (
                      <li>
                        {u.finding} → {u.suggestion}
                      </li>
                    ))}
                  </ul>
                )}
                <details style="margin-bottom:10px">
                  <summary>What they offer</summary>
                  <p class="notes">{intel.their_services.join(', ') || 'Not clear from the website'}</p>
                  {intel.platforms.length > 0 && <p class="notes">Platforms: {intel.platforms.join(', ')}</p>}
                </details>
              </>
            )}

            {changes.length > 0 && (
              <div style="border-top:1px solid var(--border);padding-top:10px">
                {changes.slice(0, 3).map((c) => (
                  <div style="margin-bottom:10px">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                      <span class={c.is_opportunity ? 'badge badge--opportunity' : 'badge'}>
                        {c.label ? (CHANGE_LABELS[c.label] ?? c.label) : 'Change'}
                      </span>
                      <span class="meta">
                        {c.page_kind} · {formatShort(c.detected_at.slice(0, 10), today)}
                      </span>
                    </div>
                    <p style="margin:5px 0 0;font-size:13px;line-height:19px">{c.title ?? 'Website updated'}</p>
                  </div>
                ))}
              </div>
            )}

            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
              <span class="meta" id="intel-progress">
                {pages.length} page{pages.length === 1 ? '' : 's'} watched
                {lastChecked ? ` · last checked ${formatShort(lastChecked.slice(0, 10), today)} ${lastChecked.slice(11, 16)} UTC` : ' · not checked yet'}
              </span>
              <button class="btn btn--sm" id="intel-refresh" type="button" style="margin-left:auto">
                Refresh now
              </button>
            </div>

            <details style="margin-top:10px">
              <summary>Watched pages</summary>
              {pages.map((p) => (
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0;font-size:13px">
                  <span class="badge">{PAGE_KIND_LABELS[p.kind] ?? p.kind}</span>
                  <a class="link" href={p.url} target="_blank" rel="noopener">
                    {domain(p.url)}
                  </a>
                  {p.last_status === 'error' && <span style="color:var(--danger)">Could not check: {p.last_error}</span>}
                  <form method="post" action={`/pages/${p.id}/delete`} style="margin-left:auto">
                    <button class="btn btn--sm btn--quiet">Stop</button>
                  </form>
                </div>
              ))}
              <form method="post" action={`/agencies/${a.id}/pages`} style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
                <select class="input input--auto" name="kind" aria-label="Page kind">
                  {PAGE_KINDS.map((k) => (
                    <option value={k}>{PAGE_KIND_LABELS[k]}</option>
                  ))}
                </select>
                <input class="input" type="url" name="url" placeholder="https://…" required style="flex:1 1 180px;width:auto" />
                <button class="btn btn--sm">Watch</button>
              </form>
            </details>
            <script dangerouslySetInnerHTML={{ __html: refreshScript(a.id) }} />
          </>
        )}
      </div>
    </section>
  );
};

// ---------- Edit ----------

const ENTRY_TYPES = ['meeting', 'call', 'email', 'note', 'followup', 'status_change'] as const;

export const EditAgencyPage: FC<Base & { agency: Agency; contacts: Contact[]; timeline: TimelineEntry[]; currency: string }> = ({
  agency: a,
  contacts,
  timeline,
  currency,
  nav,
  msg,
  error,
}) => {
  const back = `/agencies/${a.id}/edit`;
  return (
    <Layout title={`Edit ${a.name}`} active="agencies" nav={nav}>
      <p class="crumb">
        <a href="/agencies">Agencies</a>
        <Icon name="chevronRight" sm />
        <a href={`/agencies/${a.id}`}>{a.name}</a>
        <Icon name="chevronRight" sm />
        <span>Edit</span>
      </p>

      <div class="page-hd">
        <div>
          <h1>Edit {a.name}</h1>
          <p class="sub">Details, stage, contacts and timeline entries.</p>
        </div>
        <div class="acts">
          <a class="btn" href={`/agencies/${a.id}`}>
            Done
          </a>
        </div>
      </div>

      {msg && <Notice msg={msg} kind="ok" />}
      <Notice msg={error} />

      <section class="panel">
        <div class="panel-hd">
          <h2>Details</h2>
        </div>
        <form method="post" action={`/agencies/${a.id}/edit`}>
          <input type="hidden" name="back" value={back} />
          <div class="panel-bd">
            <div class="form-grid">
              <label class="field">
                <span class="lbl">Agency name *</span>
                <input class="input" type="text" name="name" value={a.name} required />
              </label>
              <label class="field">
                <span class="lbl">Website</span>
                <input class="input" type="url" name="website" value={a.website ?? ''} placeholder="https://" />
                <span class="hint">Changing this restarts the website scan.</span>
              </label>
              <label class="field">
                <span class="lbl">Country</span>
                <input class="input" type="text" name="country" value={a.country ?? ''} />
              </label>
              <label class="field">
                <span class="lbl">Framework magazine</span>
                <select class="input" name="framework">
                  <option value="">Not set</option>
                  {FRAMEWORK_OPTIONS.map((f) => (
                    <option selected={a.framework === f}>{f}</option>
                  ))}
                </select>
              </label>
              <label class="field">
                <span class="lbl">Deal in hand</span>
                <input class="input" type="text" name="deal_description" value={a.deal_description ?? ''} />
              </label>
              <label class="field">
                <span class="lbl">Estimated value</span>
                <input class="input" type="number" name="deal_value" step="any" min="0" value={a.deal_value ?? ''} />
                <span class="hint">{currency}, excluding tax.</span>
              </label>
            </div>
            <div class="form-actions">
              <button class="btn btn--primary">Save details</button>
            </div>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="panel-hd">
          <h2>Stage and follow-up</h2>
        </div>
        <form method="post" action={`/agencies/${a.id}/edit-status`} data-combo>
          <div class="panel-bd">
            <div class="form-grid">
              <StatusFields status={a.status} lead={a.lead_status} />
              <label class="field">
                <span class="lbl">Last contact</span>
                <input class="input" type="date" name="last_contact_date" value={a.last_contact_date ?? ''} />
              </label>
              <label class="field">
                <span class="lbl">Next follow-up</span>
                <input class="input" type="date" name="next_followup_date" value={a.next_followup_date ?? ''} />
                <span class="hint">Leave empty for none.</span>
              </label>
              <label class="field">
                <span class="lbl">Reason for the change</span>
                <input class="input" type="text" name="reason" placeholder="Optional" />
              </label>
            </div>
            <p class="hint" style="margin-top:10px">
              A stage change is logged in the timeline and normally sets a new follow-up date. A date you type here wins.
            </p>
            <div class="form-actions">
              <button class="btn btn--primary">Save stage and dates</button>
            </div>
          </div>
        </form>
      </section>

      <section class="panel" id="contacts">
        <div class="panel-hd">
          <h2>Contacts</h2>
          <span class="count">{contacts.length}</span>
        </div>
        {contacts.map((c) => (
          <form class="edit-block" method="post" action={`/contacts/${c.id}`}>
            <div class="form-grid">
              <label class="field">
                <span class="lbl">Name *</span>
                <input class="input" type="text" name="name" value={c.name} required />
              </label>
              <label class="field">
                <span class="lbl">Role</span>
                <input class="input" type="text" name="role" value={c.role ?? ''} />
              </label>
              <label class="field">
                <span class="lbl">Email</span>
                <input class="input" type="email" name="email" value={c.email ?? ''} />
              </label>
              <label class="field">
                <span class="lbl">LinkedIn</span>
                <input class="input" type="url" name="linkedin" value={c.linkedin ?? ''} />
              </label>
            </div>
            <div class="form-actions">
              <button class="btn">Save contact</button>
              <button class="btn btn--danger btn--sm" formaction={`/contacts/${c.id}/delete`} data-confirm={`Remove ${c.name}?`}>
                Remove
              </button>
            </div>
          </form>
        ))}
        <form class="edit-block" method="post" action={`/agencies/${a.id}/contacts`}>
          <input type="hidden" name="back" value={back} />
          <h3 style="margin:0 0 10px;font-size:13px;font-weight:650">Add a contact</h3>
          <div class="form-grid">
            <label class="field">
              <span class="lbl">Name *</span>
              <input class="input" type="text" name="name" required />
            </label>
            <label class="field">
              <span class="lbl">Role</span>
              <input class="input" type="text" name="role" />
            </label>
            <label class="field">
              <span class="lbl">Email</span>
              <input class="input" type="email" name="email" />
            </label>
            <label class="field">
              <span class="lbl">LinkedIn</span>
              <input class="input" type="url" name="linkedin" />
            </label>
          </div>
          <div class="form-actions">
            <button class="btn">Add contact</button>
          </div>
        </form>
      </section>

      <section class="panel" id="timeline">
        <div class="panel-hd">
          <h2>Timeline entries</h2>
          <span class="count">{timeline.length}</span>
        </div>
        {timeline.length === 0 ? (
          <Empty title="Nothing logged yet" />
        ) : (
          timeline.map((e) => (
            <form class="edit-block" method="post" action={`/timeline/${e.id}`}>
              <div class="form-grid">
                <label class="field">
                  <span class="lbl">Date</span>
                  <input class="input" type="date" name="date" value={e.date ?? ''} />
                </label>
                <label class="field">
                  <span class="lbl">Type</span>
                  <select class="input" name="type">
                    {ENTRY_TYPES.map((t) => (
                      <option value={t} selected={e.type === t}>
                        {t.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label class="field">
                  <span class="lbl">Next step</span>
                  <input class="input" type="text" name="next_step" value={e.next_step ?? ''} />
                </label>
              </div>
              <label class="field" style="margin-top:12px">
                <span class="lbl">Summary</span>
                <textarea class="input" name="summary" style="min-height:70px">
                  {e.summary ?? ''}
                </textarea>
              </label>
              <label class="field" style="margin-top:12px">
                <span class="lbl">Original notes</span>
                <textarea class="input" name="raw_notes" style="min-height:70px">
                  {e.raw_notes ?? ''}
                </textarea>
              </label>
              <div class="form-actions">
                <button class="btn">Save entry</button>
                <button class="btn btn--danger btn--sm" formaction={`/timeline/${e.id}/delete`} data-confirm="Delete this timeline entry?">
                  Delete entry
                </button>
              </div>
            </form>
          ))
        )}
      </section>

      <section class="panel danger-zone">
        <div class="panel-hd">
          <h2>Delete agency</h2>
        </div>
        <form class="panel-bd" method="post" action={`/agencies/${a.id}/delete`}>
          <p class="hint" style="margin:0 0 10px">
            Removes {a.name} with its contacts, timeline, suggestions and website data. This cannot be undone.
          </p>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px">
            <input type="checkbox" name="confirm" value="1" required /> Yes, delete {a.name} permanently
          </label>
          <div class="form-actions">
            <button class="btn btn--danger" data-confirm={`Delete ${a.name} and everything attached to it?`}>
              Delete agency
            </button>
          </div>
        </form>
      </section>

      <script dangerouslySetInnerHTML={{ __html: comboScript + confirmScript }} />
    </Layout>
  );
};

// ---------- logging ----------

export const LogPage: FC<Base & { agency: Agency; draft?: { date: string; type: string; notes: string } }> = ({ agency, today, nav, error, draft }) => (
  <Layout title={`Log: ${agency.name}`} active="agencies" nav={nav}>
    <p class="crumb">
      <a href="/agencies">Agencies</a>
      <Icon name="chevronRight" sm />
      <a href={`/agencies/${agency.id}`}>{agency.name}</a>
      <Icon name="chevronRight" sm />
      <span>Log</span>
    </p>
    <div class="page-hd">
      <div>
        <h1>Log a meeting or note</h1>
        <p class="sub">Paste rough notes or a full transcript. Contact names, emails and phone numbers are replaced before the notes go to the AI.</p>
      </div>
    </div>
    <Notice msg={error} />
    <section class="panel">
      <form method="post" action={`/agencies/${agency.id}/log/analyze`}>
        <div class="panel-bd" style="padding-top:var(--space-4)">
          <div class="form-grid">
            <label class="field">
              <span class="lbl">Date</span>
              <input class="input" type="date" name="date" value={draft?.date ?? today} max={today} required />
            </label>
            <label class="field">
              <span class="lbl">Type</span>
              <select class="input" name="type">
                {TIMELINE_TYPES.map((t) => (
                  <option selected={(draft?.type ?? 'meeting') === t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <label class="field" style="margin-top:12px">
            <span class="lbl">Notes</span>
            <textarea class="input" name="notes" style="min-height:240px" required autofocus>
              {draft?.notes ?? ''}
            </textarea>
          </label>
          <div class="form-actions">
            <button class="btn btn--primary">Summarise with AI</button>
            <button class="btn" name="skip_ai" value="1">
              Save without AI
            </button>
            <a class="btn btn--quiet" href={`/agencies/${agency.id}`}>
              Cancel
            </a>
          </div>
        </div>
      </form>
    </section>
  </Layout>
);

export const ReviewPage: FC<
  Base & { agency: Agency; date: string; type: string; notes: string; analysis: NoteAnalysis | null; aiError?: string | null }
> = ({ agency, date, type, notes, analysis: an, aiError, today, nav }) => (
  <Layout title={`Review: ${agency.name}`} active="agencies" nav={nav}>
    <p class="crumb">
      <a href={`/agencies/${agency.id}`}>{agency.name}</a>
      <Icon name="chevronRight" sm />
      <span>Review</span>
    </p>
    <div class="page-hd">
      <div>
        <h1>Review before saving</h1>
        <p class="sub">
          {formatDay(date)} · {type}
        </p>
      </div>
    </div>
    {aiError && <Notice msg={`${aiError} You can still fill this in yourself and save.`} kind="warn" />}
    <section class="panel">
      <form method="post" action={`/agencies/${agency.id}/log/save`}>
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="type" value={type} />
        <input type="hidden" name="notes" value={notes} />
        <input
          type="hidden"
          name="key_points"
          value={
            an ? JSON.stringify({ interest_level: an.interest_level, services_needed: an.services_needed, projects: an.projects, objections: an.objections }) : ''
          }
        />
        <div class="panel-bd" style="padding-top:var(--space-4)">
          <label class="field">
            <span class="lbl">Summary</span>
            <textarea class="input" name="summary" style="min-height:120px">
              {an?.summary ?? ''}
            </textarea>
          </label>
          {an && (
            <p class="meta" style="margin-top:8px">
              Interest {an.interest_level}
              {an.services_needed.length > 0 && ` · Needs: ${an.services_needed.join(', ')}`}
              {an.projects.length > 0 && ` · Projects: ${an.projects.join(', ')}`}
              {an.objections.length > 0 && ` · Objections: ${an.objections.join(', ')}`}
            </p>
          )}
          <div class="form-grid" style="margin-top:12px">
            <label class="field">
              <span class="lbl">Next step</span>
              <input class="input" type="text" name="next_step" value={an?.next_step ?? ''} />
            </label>
            <label class="field">
              <span class="lbl">Next follow-up date</span>
              <input class="input" type="date" name="next_step_date" value={an?.next_step_date ?? ''} min={today} />
              <span class="hint">Leave empty for the standard timing.</span>
            </label>
          </div>

          {an && (an.suggested_status || an.suggested_lead_status) && (
            <div class="notice notice--warn" style="margin-top:14px">
              <Icon name="trend" />
              <span>
                <b>
                  The AI suggests {an.suggested_status ?? agency.status} / {an.suggested_lead_status ?? agency.lead_status}.
                </b>{' '}
                {an.suggestion_reason}
                <input type="hidden" name="suggested_status" value={an.suggested_status ?? agency.status} />
                <input type="hidden" name="suggested_lead_status" value={an.suggested_lead_status ?? agency.lead_status} />
                <input type="hidden" name="suggestion_reason" value={an.suggestion_reason ?? ''} />
                <label style="display:flex;align-items:center;gap:8px;margin-top:8px">
                  <input type="checkbox" name="apply_suggestion" value="1" /> Apply it now, rather than leaving it to decide later
                </label>
              </span>
            </div>
          )}

          <details style="margin-top:12px">
            <summary>Original notes</summary>
            <pre class="notes">{notes}</pre>
          </details>

          <div class="form-actions">
            <button class="btn btn--primary">Save to the timeline</button>
            <a class="btn btn--quiet" href={`/agencies/${agency.id}`}>
              Cancel
            </a>
          </div>
        </div>
      </form>
    </section>
  </Layout>
);

// ---------- import ----------

export const ImportPage: FC<Base & { hasData: boolean }> = ({ hasData, nav, error }) => (
  <Layout title="Import" active="import" nav={nav}>
    <div class="page-hd">
      <div>
        <h1>Import the sheet</h1>
        <p class="sub">Open the Google Sheet, select the Chabert tab, then File, Download, Comma-separated values.</p>
      </div>
    </div>
    <Notice msg={error} />
    {hasData && (
      <Notice kind="warn">
        <>
          <b>This replaces everything.</b> Notes logged in the app are deleted too.
        </>
      </Notice>
    )}
    <section class="panel">
      <form class="panel-bd" method="post" action="/import" enctype="multipart/form-data" style="padding-top:var(--space-4)">
        <label class="field">
          <span class="lbl">CSV file</span>
          <input class="input" type="file" name="file" accept=".csv,text/csv" required style="height:auto;padding:8px 11px" />
        </label>
        {hasData && (
          <label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px">
            <input type="checkbox" name="replace" value="1" required /> Yes, replace all existing data
          </label>
        )}
        <div class="form-actions">
          <button class="btn btn--primary" data-confirm={hasData ? 'This deletes every agency and note in the app. Continue?' : undefined}>
            Import
          </button>
          <a class="btn btn--quiet" href="/import/report">
            Back to the report
          </a>
        </div>
      </form>
    </section>
    <script dangerouslySetInnerHTML={{ __html: confirmScript }} />
  </Layout>
);

export const ImportReportPage: FC<Base & { issues: ImportIssueRow[] }> = ({ issues, nav, msg }) => (
  <Layout title="Import report" active="import" nav={nav}>
    <div class="page-hd">
      <div>
        <h1>Import report</h1>
        <p class="sub">Rows that need a look. Fix them on the agency page, then mark them checked.</p>
      </div>
      <div class="acts">
        <a class="btn" href="/import">
          <Icon name="import" />
          Upload a CSV
        </a>
      </div>
    </div>
    {msg && <Notice msg={msg} kind="ok" />}
    <section class="panel">
      {issues.length === 0 ? (
        <Empty icon="done" title="Nothing left to check" body="Every imported row has been reviewed." />
      ) : (
        <div class="table-wrap">
          <table class="tbl">
            <thead>
              <tr>
                <th class="num">Row</th>
                <th>Agency</th>
                <th>Issue</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {issues.map((i) => (
                <tr>
                  <td class="num">{i.row_number ?? '—'}</td>
                  <td>{i.agency_id ? <a class="link" href={`/agencies/${i.agency_id}`}>{i.agency_name}</a> : <span class="muted">Not imported</span>}</td>
                  <td class="notes" style="color:var(--ink)">
                    {i.detail}
                  </td>
                  <td>
                    <form method="post" action={`/import-issues/${i.id}/resolve`}>
                      <input type="hidden" name="back" value="/import/report" />
                      <button class="btn btn--sm">Mark checked</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  </Layout>
);

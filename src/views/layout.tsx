import type { Child, FC } from 'hono/jsx';
import { followupText, formatShort, relativeDay } from '../dates';
import type { Nav } from '../reports';
import { Icon, Mark } from './icons';
import { CSS_VERSION } from './theme';

export const EMPTY_NAV: Nav = { today: 0, agencies: 0, importIssues: 0 };

type Active = 'feed' | 'dashboard' | 'agencies' | 'new' | 'import' | '';

const ITEMS: { key: Active; href: string; icon: 'today' | 'dashboard' | 'agencies' | 'add'; label: string }[] = [
  { key: 'feed', href: '/', icon: 'today', label: 'Today' },
  { key: 'dashboard', href: '/dashboard', icon: 'dashboard', label: 'Dashboard' },
  { key: 'agencies', href: '/agencies', icon: 'agencies', label: 'Agencies' },
  { key: 'new', href: '/agencies/new', icon: 'add', label: 'Add agency' },
];

const Sidebar: FC<{ active: Active; nav: Nav }> = ({ active, nav }) => (
  <aside class="side">
    <a class="side-brand" href="/">
      <Mark size={24} />
      Agency Tracker
    </a>
    <nav class="nav">
      {ITEMS.map((it) => (
        <a href={it.href} aria-current={active === it.key ? 'page' : undefined}>
          <Icon name={it.icon} lg />
          {it.label}
          {it.key === 'feed' && nav.today > 0 && <span class={active === 'feed' ? 'tail' : 'tail alert'}>{nav.today}</span>}
          {it.key === 'agencies' && nav.agencies > 0 && <span class="tail muted">{nav.agencies}</span>}
        </a>
      ))}
      <hr />
      <a href="/import/report" aria-current={active === 'import' ? 'page' : undefined}>
        <Icon name="import" lg />
        Import
        {nav.importIssues > 0 && <span class={active === 'import' ? 'tail' : 'tail alert'}>{nav.importIssues}</span>}
      </a>
    </nav>
  </aside>
);

const TabBar: FC<{ active: Active; nav: Nav }> = ({ active, nav }) => (
  <nav class="tabbar" aria-label="Main">
    {ITEMS.map((it) => (
      <a href={it.href} aria-current={active === it.key ? 'page' : undefined}>
        {it.key === 'feed' ? (
          <span class="dotn">
            <Icon name={it.icon} lg />
            {nav.today > 0 && <b>{nav.today}</b>}
          </span>
        ) : (
          <Icon name={it.icon} lg />
        )}
        {it.label === 'Add agency' ? 'Add' : it.label}
      </a>
    ))}
  </nav>
);

export const Layout: FC<{ title: string; active?: Active; nav?: Nav; search?: string; topbar?: Child; children?: Child }> = ({
  title,
  active = '',
  nav = EMPTY_NAV,
  search,
  topbar,
  children,
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="light dark" />
      <title>{title} · Agency Tracker</title>
      <link rel="stylesheet" href={`/app.css?v=${CSS_VERSION}`} />
    </head>
    <body>
      <div class="app">
        <Sidebar active={active} nav={nav} />
        <div class="main">
          <header class="topbar">
            <a class="brand-sm" href="/" aria-label="Agency Tracker">
              <Mark size={22} />
            </a>
            <form class="search grow" method="get" action="/agencies" role="search">
              <Icon name="search" />
              <input class="input" type="search" name="q" value={search ?? ''} placeholder="Search agencies, contacts or notes…" aria-label="Search agencies" />
            </form>
            {topbar}
          </header>
          <div class="content">{children}</div>
        </div>
      </div>
      <TabBar active={active} nav={nav} />
    </body>
  </html>
);

// ---------- shared pieces ----------

export const Avatar: FC<{ name: string; sm?: boolean; lg?: boolean }> = ({ name, sm, lg }) => {
  const initial = (name.match(/\p{L}\p{M}*/u)?.[0] ?? '?').toUpperCase();
  return (
    <span class={sm ? 'avatar sm' : 'avatar'} style={lg ? 'width:44px;height:44px;font-size:17px' : undefined} aria-hidden="true">
      {initial}
    </span>
  );
};

const STAGE_CLASS: Record<string, string> = {
  Won: 'won',
  Opportunity: 'opportunity',
  'Potential (Warm)': 'potential',
  'Email Sequence': 'sequence',
  'Not Interested': 'out',
};

export const StageBadge: FC<{ status: string }> = ({ status }) => (
  <span class={`badge badge--${STAGE_CLASS[status] ?? ''}`}>{status}</span>
);

const TEMP: Record<string, { cls: string; icon: 'hot' | 'warm' | 'cold' | 'note' | 'calendar' | null }> = {
  Hot: { cls: 'badge--hot', icon: 'hot' },
  Warm: { cls: 'badge--warm', icon: 'warm' },
  Cold: { cls: 'badge--cold', icon: 'cold' },
  Education: { cls: '', icon: 'note' },
  'Future fit': { cls: '', icon: 'calendar' },
  Disqualified: { cls: 'badge--out', icon: null },
};

export const TempBadge: FC<{ lead: string }> = ({ lead }) => {
  const t = TEMP[lead] ?? { cls: '', icon: null };
  return (
    <span class={`badge ${t.cls}`.trim()}>
      {t.icon && <Icon name={t.icon} />}
      {lead}
    </span>
  );
};

// Two lines: the date, then how far away it is. The follow-up variant colours lateness.
export const DateCell: FC<{ day: string | null; today: string; followup?: boolean }> = ({ day, today, followup }) => {
  if (!day) {
    return (
      <span class="date date--none">
        —<span class="rel">{followup ? 'No follow-up set' : 'Never'}</span>
      </span>
    );
  }
  const rel = followup ? followupText(day, today) : relativeDay(day, today);
  const tone = followup && day < today ? ' overdue' : followup && day === today ? ' today' : '';
  return (
    <span class="date">
      {formatShort(day, today)}
      <span class={`rel${tone}`}>{rel}</span>
    </span>
  );
};

export const Notice: FC<{ msg?: string | null; kind?: 'ok' | 'warn' | 'err'; children?: Child }> = ({ msg, kind = 'err', children }) => {
  if (!msg && !children) return null;
  const icon = kind === 'ok' ? 'done' : kind === 'warn' ? 'overdue' : 'close';
  return (
    <div class={`notice notice--${kind}`}>
      <Icon name={icon} />
      <span>{children ?? msg}</span>
    </div>
  );
};

export const Empty: FC<{ icon?: 'today' | 'note' | 'agencies' | 'done' | 'import'; title: string; body?: string; children?: Child }> = ({
  icon = 'note',
  title,
  body,
  children,
}) => (
  <div class="empty">
    <span class="ico">
      <Icon name={icon} lg />
    </span>
    <h3>{title}</h3>
    {body && <p>{body}</p>}
    {children}
  </div>
);

// Primary action plus the rest behind the dots, per the design system's ActionRow.
// Split in two so a mobile row card can place the menu and the buttons apart.

const Hidden: FC<{ back: string; action: string }> = ({ back, action }) => (
  <>
    <input type="hidden" name="back" value={back} />
    <input type="hidden" name="action" value={action} />
  </>
);

export const FollowupButtons: FC<{ agencyId: number; back: string; wide?: boolean }> = ({ agencyId, back, wide }) => (
  <>
    <form method="post" action={`/agencies/${agencyId}/followup`} style={wide ? 'flex:1 1 0' : undefined}>
      <Hidden back={back} action="done" />
      <button class={wide ? 'btn btn--primary' : 'btn btn--primary btn--sm'} title="You sent the follow-up. Log a reply separately if they answer.">
        <Icon name="check" />
        Done
      </button>
    </form>
    <form method="post" action={`/agencies/${agencyId}/followup`} style={wide ? 'flex:1 1 0' : undefined}>
      <Hidden back={back} action="snooze3" />
      <button class={wide ? 'btn' : 'btn btn--sm'}>
        <Icon name="clock" />
        Snooze
      </button>
    </form>
  </>
);

export const FollowupMenu: FC<{ agencyId: number; hasFollowup: boolean; back: string; today: string }> = ({ agencyId, hasFollowup, back, today }) => (
  <details class="menu">
    <summary class="btn btn--sm btn--icon" aria-label="More actions" role="button">
      <Icon name="more" />
    </summary>
    <div class="menu-list">
      {hasFollowup && (
        <>
          <form method="post" action={`/agencies/${agencyId}/followup`}>
            <Hidden back={back} action="snooze3" />
            <button>
              <Icon name="clock" />
              Snooze 3 days
            </button>
          </form>
          <form method="post" action={`/agencies/${agencyId}/followup`}>
            <Hidden back={back} action="snooze7" />
            <button>
              <Icon name="clock" />
              Snooze 1 week
            </button>
          </form>
          <div class="menu-form">
            <form method="post" action={`/agencies/${agencyId}/followup`}>
              <Hidden back={back} action="reschedule" />
              <label class="field">
                <span class="lbl">Pick a date</span>
                <input class="input" type="date" name="date" min={today} required />
              </label>
              <button class="btn btn--sm">Reschedule</button>
            </form>
          </div>
        </>
      )}
      <hr />
      <a href={`/agencies/${agencyId}/log`}>
        <Icon name="note" />
        Log a meeting
      </a>
      {hasFollowup && (
        <form method="post" action={`/agencies/${agencyId}/followup`}>
          <Hidden back={back} action="clear" />
          <button class="danger">
            <Icon name="close" />
            Clear follow-up
          </button>
        </form>
      )}
    </div>
  </details>
);

export const FollowupActions: FC<{ agencyId: number; hasFollowup: boolean; back: string; today: string }> = ({ agencyId, hasFollowup, back, today }) => (
  <span class="actions">
    {hasFollowup && <FollowupButtons agencyId={agencyId} back={back} />}
    <FollowupMenu agencyId={agencyId} hasFollowup={hasFollowup} back={back} today={today} />
  </span>
);

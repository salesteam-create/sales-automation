import type { Child, FC } from 'hono/jsx';
import { formatDay } from '../dates';

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--text:#1d2330;--muted:#667085;--line:#e4e7ec;--accent:#2563eb;--accent-soft:#e8efff;
--red:#c0352b;--red-soft:#fdecea;--amber:#b54708;--amber-soft:#fef0c7;--green:#067647;--green-soft:#dcfae6;--grey-soft:#f2f4f7}
@media (prefers-color-scheme:dark){:root{--bg:#0f1218;--card:#171b23;--text:#e6e8ec;--muted:#98a2b3;--line:#2a303b;--accent:#6b9bff;
--accent-soft:#1c2840;--red:#f97066;--red-soft:#3a1c1a;--amber:#fdb022;--amber-soft:#3a2c12;--green:#47cd89;--green-soft:#123224;--grey-soft:#222833}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header{background:var(--card);border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
nav{max-width:1100px;margin:0 auto;padding:10px 16px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
nav .brand{font-weight:700;color:var(--text);margin-right:auto}nav a.active{font-weight:600;text-decoration:underline}
main{max-width:1100px;margin:0 auto;padding:20px 16px 60px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:0 0 10px}h3{font-size:15px;margin:0 0 6px}
.muted{color:var(--muted)}.small{font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:16px}
.grid{display:grid;gap:16px}.g2{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}.g5{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.stat{display:block;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--text)}
.stat b{display:block;font-size:26px}.stat:hover{border-color:var(--accent);text-decoration:none}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);font-weight:600}
.table-wrap{overflow-x:auto}
.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;background:var(--grey-soft);white-space:nowrap}
.pill.Hot,.pill.Won{background:var(--red-soft);color:var(--red)}.pill.Warm,.pill.Opportunity{background:var(--amber-soft);color:var(--amber)}
.pill.Education,.pill.Future{background:var(--accent-soft);color:var(--accent)}.pill.ok{background:var(--green-soft);color:var(--green)}
.overdue{color:var(--red);font-weight:600}
form.inline{display:inline}
input,select,textarea,button{font:inherit;color:inherit}
input[type=text],input[type=url],input[type=date],input[type=number],input[type=email],input[type=search],select,textarea{
width:100%;padding:7px 9px;border:1px solid var(--line);border-radius:7px;background:var(--bg)}
textarea{min-height:90px}label{display:block;font-size:13px;color:var(--muted);margin:8px 0 3px}
button,.btn{display:inline-block;padding:6px 12px;border-radius:7px;border:1px solid var(--line);background:var(--card);cursor:pointer;color:var(--text);font-size:14px}
button.primary,.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}button:hover,.btn:hover{border-color:var(--accent);text-decoration:none}
button.link{border:0;background:none;padding:0;color:var(--accent)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.row>*{flex:0 1 auto;min-width:0;overflow-wrap:anywhere}
.fields{display:grid;gap:0 12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.item{padding:10px 0;border-bottom:1px solid var(--line)}.item:last-child{border-bottom:0}
.notice{padding:10px 12px;border-radius:8px;background:var(--amber-soft);color:var(--amber);margin-bottom:16px}
.notice.ok{background:var(--green-soft);color:var(--green)}
.bar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--grey-soft);min-width:80px}
.bar span{display:block;height:100%}
.steps li{margin-bottom:4px}
details summary{cursor:pointer;color:var(--accent)}
pre.notes{white-space:pre-wrap;font:inherit;margin:4px 0 0;color:var(--muted)}
`;

export const Layout: FC<{ title: string; active?: string; children?: Child }> = ({ title, active, children }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · Agency Tracker</title>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </head>
    <body>
      <header>
        <nav>
          <a class="brand" href="/">Agency Tracker</a>
          <a href="/" class={active === 'feed' ? 'active' : ''}>Today</a>
          <a href="/dashboard" class={active === 'dashboard' ? 'active' : ''}>Dashboard</a>
          <a href="/agencies" class={active === 'agencies' ? 'active' : ''}>Agencies</a>
          <a href="/agencies/new" class={active === 'new' ? 'active' : ''}>+ Agency</a>
          <a href="/import/report" class={active === 'import' ? 'active small' : 'small'}>Import</a>
        </nav>
      </header>
      <main>{children}</main>
    </body>
  </html>
);

export const Pill: FC<{ value: string }> = ({ value }) => <span class={`pill ${value.split(' ')[0]}`}>{value}</span>;

export const Due: FC<{ day: string | null; today: string }> = ({ day, today }) => {
  if (!day) return <span class="muted">No follow-up</span>;
  if (day < today) return <span class="overdue">Overdue · {formatDay(day)}</span>;
  if (day === today) return <span class="overdue">Due today</span>;
  return <span>{formatDay(day)}</span>;
};

export const Notice: FC<{ msg?: string | null; ok?: boolean }> = ({ msg, ok }) =>
  msg ? <div class={ok ? 'notice ok' : 'notice'}>{msg}</div> : null;

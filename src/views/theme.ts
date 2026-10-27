// The application stylesheet, generated from the Agency Tracker design system
// (design-system/). Do not edit by hand: run `npm run build:theme`.
// Served at /app.css so it is cached once rather than inlined on every page.

export const CSS_VERSION = '1cc631f1c1';

export const CSS = String.raw`
/* Generated from the Agency Tracker design system: tokens.json + components/bundle.css. */
/* Edit the design system, not this file. */
:root, [data-theme="light"] {
  --canvas: #eceeed;
  --surface: #ffffff;
  --surface-raised: #ffffff;
  --surface-muted: #f6f7f6;
  --border: #e5e8e6;
  --border-strong: #d2d7d4;
  --ink: #1a1d1b;
  --ink-muted: #697170;
  --brand: #146c43;
  --brand-hover: #0f5231;
  --brand-soft: #e4f4ec;
  --brand-ink: #0f6a43;
  --on-brand: #ffffff;
  --focus: #146c43;
  --danger: #b3261e;
  --danger-soft: #fdeceb;
  --warning: #8a5a04;
  --warning-soft: #fcf1d9;
  --info: #1d4f9e;
  --info-soft: #e6edfa;
  --neutral-soft: #f0f2f1;
  --avatar-bg: #1f2623;
  --avatar-ink: #ffffff;
  --stage-won: #053f27;
  --stage-opportunity: #0b653f;
  --stage-potential: #158858;
  --stage-sequence: #41a97e;
  --stage-out: #80c3a5;
  --chart-bar: #158858;
  --chart-grid: #eceeed;
  --chart-axis: #cfd4d1;
  --shadow-card: 0 1px 2px rgba(16,24,22,0.05);
  --shadow-shell: 0 1px 3px rgba(16,24,22,0.06), 0 8px 24px rgba(16,24,22,0.06);
  --shadow-overlay: 0 10px 32px rgba(16,24,22,0.16);
}
[data-theme="dark"] {
  --canvas: #0d1013;
  --surface: #161a1f;
  --surface-raised: #1c2127;
  --surface-muted: #1b2026;
  --border: #272d35;
  --border-strong: #39414b;
  --ink: #e8ebe9;
  --ink-muted: #99a3a0;
  --brand: #3fae7a;
  --brand-hover: #58c08e;
  --brand-soft: #11291f;
  --brand-ink: #6fd2a2;
  --on-brand: #0c1210;
  --focus: #6fd2a2;
  --danger: #f2857b;
  --danger-soft: #3a1b19;
  --warning: #e9b04a;
  --warning-soft: #332810;
  --info: #7aa9ef;
  --info-soft: #16203a;
  --neutral-soft: #232a31;
  --avatar-bg: #2e3a35;
  --avatar-ink: #e8ebe9;
  --stage-won: #9ae3c0;
  --stage-opportunity: #6cc89e;
  --stage-potential: #46a87d;
  --stage-sequence: #2a855f;
  --stage-out: #1a6346;
  --chart-bar: #46a87d;
  --chart-grid: #242b32;
  --chart-axis: #3a424a;
  --shadow-card: 0 1px 2px rgba(0,0,0,0.5);
  --shadow-shell: 0 8px 24px rgba(0,0,0,0.55);
  --shadow-overlay: 0 10px 32px rgba(0,0,0,0.7);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --canvas: #0d1013;
    --surface: #161a1f;
    --surface-raised: #1c2127;
    --surface-muted: #1b2026;
    --border: #272d35;
    --border-strong: #39414b;
    --ink: #e8ebe9;
    --ink-muted: #99a3a0;
    --brand: #3fae7a;
    --brand-hover: #58c08e;
    --brand-soft: #11291f;
    --brand-ink: #6fd2a2;
    --on-brand: #0c1210;
    --focus: #6fd2a2;
    --danger: #f2857b;
    --danger-soft: #3a1b19;
    --warning: #e9b04a;
    --warning-soft: #332810;
    --info: #7aa9ef;
    --info-soft: #16203a;
    --neutral-soft: #232a31;
    --avatar-bg: #2e3a35;
    --avatar-ink: #e8ebe9;
    --stage-won: #9ae3c0;
    --stage-opportunity: #6cc89e;
    --stage-potential: #46a87d;
    --stage-sequence: #2a855f;
    --stage-out: #1a6346;
    --chart-bar: #46a87d;
    --chart-grid: #242b32;
    --chart-axis: #3a424a;
    --shadow-card: 0 1px 2px rgba(0,0,0,0.5);
    --shadow-shell: 0 8px 24px rgba(0,0,0,0.55);
    --shadow-overlay: 0 10px 32px rgba(0,0,0,0.7);
  }
}
:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 18px;
  --radius-pill: 999px;
  --font-sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
}

/* Agency Tracker — application stylesheet. Loads after tokens.css, which declares every --token used here. */

*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }

body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 21px;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

a { color: inherit; text-decoration: none; }
a:hover { text-decoration: none; }
.link { color: var(--brand-ink); }
.link:hover { text-decoration: underline; }

:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: var(--radius-sm); }

.tnum { font-variant-numeric: tabular-nums; }
.muted { color: var(--ink-muted); }
.meta { font-size: 12px; line-height: 17px; color: var(--ink-muted); }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

svg.i { width: 16px; height: 16px; flex: none; stroke: currentColor; fill: none; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
svg.i.lg { width: 20px; height: 20px; }

/* ================= shell ================= */

.app {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  min-height: 100%;
  background: var(--surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-shell);
  overflow: hidden;
}

.side {
  display: flex; flex-direction: column;
  background: var(--surface-muted);
  border-right: 1px solid var(--border);
  padding: var(--space-4) var(--space-3);
}
.side-brand { display: flex; align-items: center; gap: var(--space-2); padding: 4px 8px var(--space-6); font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
.side-brand .mark { width: 24px; height: 24px; flex: none; }

.nav { display: flex; flex-direction: column; gap: 2px; }
.nav a {
  display: flex; align-items: center; gap: 10px;
  height: 38px; padding: 0 10px; border-radius: var(--radius-sm);
  font-size: 13px; line-height: 18px; font-weight: 550; color: var(--ink-muted);
}
.nav a:hover { background: var(--brand-soft); color: var(--brand-ink); }
.nav a[aria-current="page"] { background: var(--brand); color: var(--on-brand); }
.nav a .tail { margin-left: auto; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.nav a[aria-current="page"] .tail { color: var(--on-brand); }
.nav a .tail.alert { color: var(--danger); }
.nav hr { margin: var(--space-3) 10px; border: 0; border-top: 1px solid var(--border-strong); }

.side-foot { margin-top: auto; padding-top: var(--space-4); }
.who { display: flex; align-items: center; gap: var(--space-2); padding: 6px 8px; border-radius: var(--radius-sm); width: 100%; border: 0; background: none; cursor: pointer; font: inherit; text-align: left; }
.who:hover { background: var(--brand-soft); }
.who .nm { font-size: 13px; font-weight: 550; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.main { display: flex; flex-direction: column; min-width: 0; }

.topbar {
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--border);
}
.topbar .grow { flex: 1 1 auto; min-width: 0; }
.burger { display: none; }

.search { position: relative; max-width: 360px; width: 100%; }
.search svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--ink-muted); }
.search input { padding-left: 34px; }

.content { padding: var(--space-6); }
.content > * + * { margin-top: var(--space-4); }

.page-hd { display: flex; align-items: flex-start; gap: var(--space-4); }
.page-hd h1 { margin: 0; font-size: 24px; line-height: 30px; font-weight: 650; letter-spacing: -0.02em; }
.page-hd .sub { margin: 2px 0 0; font-size: 14px; line-height: 20px; color: var(--ink-muted); }
.page-hd .acts { margin-left: auto; display: flex; flex-wrap: wrap; gap: var(--space-2); flex: 0 1 auto; align-items: center; justify-content: flex-end; }

/* ================= buttons ================= */

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  height: 36px; padding: 0 14px;
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--ink);
  font-family: inherit; font-size: 13px; line-height: 18px; font-weight: 550;
  white-space: nowrap; cursor: pointer;
}
.btn:hover { background: var(--surface-muted); }
.btn--primary { background: var(--brand); border-color: var(--brand); color: var(--on-brand); }
.btn--primary:hover { background: var(--brand-hover); border-color: var(--brand-hover); }
.btn--quiet { background: transparent; border-color: transparent; color: var(--ink-muted); }
.btn--quiet:hover { background: var(--surface-muted); color: var(--ink); }
.btn--danger { color: var(--danger); }
.btn--danger:hover { background: var(--danger-soft); border-color: var(--danger); }
.btn--sm { height: 30px; padding: 0 10px; font-size: 12px; gap: 5px; }
.btn--icon { width: 30px; height: 30px; padding: 0; }
.btn[disabled] { opacity: 0.5; cursor: not-allowed; }
.actions { display: flex; align-items: center; gap: 6px; }
.actions > form { display: flex; }

.menu { position: relative; }
.menu > summary { list-style: none; display: inline-flex; }
.menu > summary::-webkit-details-marker { display: none; }
.menu-list {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 20;
  min-width: 190px; padding: 5px;
  background: var(--surface-raised); border: 1px solid var(--border-strong);
  border-radius: var(--radius-md); box-shadow: var(--shadow-overlay);
}
.menu-list > button, .menu-list > a, .menu-list > form > button {
  display: flex; align-items: center; gap: 9px; width: 100%; text-align: left;
  padding: 8px 10px; border: 0; border-radius: var(--radius-sm);
  background: none; color: var(--ink); font: inherit; font-size: 13px; cursor: pointer;
}
.menu-list > button:hover, .menu-list > a:hover, .menu-list > form > button:hover { background: var(--surface-muted); }
.menu-list form { margin: 0; }
.menu-form { padding: 8px 10px 4px; }
.menu-form .btn { width: 100%; margin-top: 8px; }
.menu-list hr { margin: 5px 0; border: 0; border-top: 1px solid var(--border); }
.menu-list .danger, .menu-list > form > button.danger { color: var(--danger); }

/* ================= fields ================= */

.input {
  width: 100%; height: 36px; padding: 0 11px;
  border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
  background: var(--surface); color: var(--ink);
  font-family: inherit; font-size: 13px; line-height: 18px;
}
textarea.input { height: auto; min-height: 110px; padding: 9px 11px; line-height: 21px; resize: vertical; }
select.input { padding-right: 28px; cursor: pointer; }
.input::placeholder { color: var(--ink-muted); }
.input:focus-visible { border-color: var(--focus); outline-offset: 1px; }
.input--auto { width: auto; }

.field .lbl { display: block; margin-bottom: 5px; font-size: 13px; line-height: 18px; font-weight: 550; color: var(--ink); }
.field .hint { margin-top: 5px; font-size: 12px; line-height: 17px; color: var(--ink-muted); }
.fieldset { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }

.chip {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 12px;
  border: 1px solid var(--border-strong); border-radius: var(--radius-pill);
  background: var(--surface); color: var(--ink);
  font: inherit; font-size: 13px; font-weight: 550; cursor: pointer; white-space: nowrap;
}
.chip:hover { background: var(--surface-muted); }
.chip[aria-pressed="true"], .chip:has(input:checked) { background: var(--brand-soft); border-color: var(--brand-ink); color: var(--brand-ink); }
.chip input[type="checkbox"] { width: 14px; height: 14px; }

/* ================= stat cards ================= */

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: var(--space-3); }
.stat {
  display: flex; align-items: flex-start; gap: var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--surface); color: var(--ink);
}
.stat:hover { border-color: var(--border-strong); }
.stat .ico {
  display: grid; place-items: center; flex: none;
  width: 34px; height: 34px; border-radius: var(--radius-pill);
  background: var(--neutral-soft); color: var(--ink-muted);
}
.stat .v { display: block; font-size: 28px; line-height: 34px; font-weight: 680; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.stat .k { display: block; font-size: 13px; line-height: 18px; font-weight: 600; }
.stat .d { display: block; margin-top: 1px; font-size: 12px; line-height: 17px; color: var(--ink-muted); }

.stat--danger  { background: var(--danger-soft);  border-color: var(--danger-soft); }
.stat--danger .ico  { background: var(--surface); color: var(--danger); }
.stat--danger .v    { color: var(--danger); }
.stat--warning { background: var(--warning-soft); border-color: var(--warning-soft); }
.stat--warning .ico { background: var(--surface); color: var(--warning); }
.stat--warning .v   { color: var(--warning); }
.stat--brand   { background: var(--brand-soft);   border-color: var(--brand-soft); }
.stat--brand .ico   { background: var(--surface); color: var(--brand-ink); }
.stat--brand .v     { color: var(--brand-ink); }

/* compact tile used on the dashboard */
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-3); }
.tiles--6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.tile {
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border); border-radius: var(--radius-md);
  background: var(--surface); color: var(--ink); box-shadow: var(--shadow-card);
}
.tile .ico { display: grid; place-items: center; width: 26px; height: 26px; border-radius: var(--radius-sm); background: var(--neutral-soft); color: var(--ink-muted); margin-bottom: 10px; }
.tile .v { display: block; font-size: 24px; line-height: 30px; font-weight: 680; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.tile .k { display: block; font-size: 13px; line-height: 18px; font-weight: 550; color: var(--ink); }
.tile .d { display: block; margin-top: 2px; font-size: 12px; line-height: 17px; color: var(--ink-muted); }
.tile:hover { border-color: var(--border-strong); }

/* ================= panel ================= */

.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-card); }
.panel-hd { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-4) var(--space-4) var(--space-3); }
.panel-hd h2 { margin: 0; font-size: 15px; line-height: 22px; font-weight: 650; }
.panel-hd .count { font-size: 13px; font-weight: 600; color: var(--ink-muted); font-variant-numeric: tabular-nums; }
.panel-hd .acts { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); }
.panel-bd { padding: 0 var(--space-4) var(--space-4); }
.panel-ft { padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border); }
.cols { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); align-items: start; }

/* ================= tabs ================= */

.tabs { display: flex; align-items: center; gap: var(--space-2); border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs a {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 10px 2px; margin-right: var(--space-4);
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  font-size: 13px; font-weight: 550; color: var(--ink-muted); white-space: nowrap;
}
.tabs a:hover { color: var(--ink); }
.tabs a[aria-current="page"] { color: var(--ink); border-bottom-color: var(--brand); }
.tabs .n { padding: 1px 7px; border-radius: var(--radius-pill); background: var(--neutral-soft); font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
.tabs a[aria-current="page"] .n { background: var(--brand-soft); color: var(--brand-ink); }
.tabs .right { margin-left: auto; display: flex; gap: var(--space-2); padding-bottom: 6px; }

/* ================= badges ================= */

.badge {
  display: inline-flex; align-items: center; gap: 5px;
  height: 24px; padding: 0 9px; border: 1px solid transparent; border-radius: var(--radius-pill);
  background: var(--neutral-soft); color: var(--ink);
  font-size: 12px; line-height: 16px; font-weight: 600; white-space: nowrap;
}
.badge svg.i { width: 13px; height: 13px; stroke-width: 1.8; }
.badge--won         { background: var(--brand);      color: var(--on-brand); }
.badge--opportunity { background: var(--brand-soft); color: var(--brand-ink); }
.badge--potential   { background: var(--warning-soft); color: var(--warning); }
.badge--sequence    { background: var(--info-soft);  color: var(--info); }
.badge--out         { background: transparent; color: var(--ink-muted); border-color: var(--border-strong); }
.badge--hot         { background: var(--danger-soft);  color: var(--danger); }
.badge--warm        { background: var(--warning-soft); color: var(--warning); }
.badge--cold        { background: var(--info-soft);    color: var(--info); }

.avatar {
  display: grid; place-items: center; flex: none;
  width: 32px; height: 32px; border-radius: var(--radius-pill);
  background: var(--avatar-bg); color: var(--avatar-ink);
  font-size: 13px; font-weight: 650; letter-spacing: 0.01em;
}
.avatar.sm { width: 26px; height: 26px; font-size: 11px; }

.who-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
.who-cell .nm { font-size: 14px; line-height: 20px; font-weight: 600; color: var(--ink); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.who-cell .nm:hover { text-decoration: underline; }
.who-cell .dm { display: block; font-size: 12px; line-height: 17px; color: var(--ink-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.flag { width: 18px; height: 13px; border-radius: 2px; flex: none; display: inline-block; vertical-align: -1px; }

/* ================= dates ================= */

.date { font-size: 13px; line-height: 18px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.date .rel { display: block; font-size: 12px; line-height: 17px; font-weight: 400; color: var(--ink-muted); }
.date .rel.overdue { color: var(--danger); font-weight: 600; }
.date .rel.today   { color: var(--warning); font-weight: 600; }
.date--none { color: var(--ink-muted); }

/* ================= table ================= */

.table-wrap { overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; }
.tbl th {
  position: sticky; top: 0; z-index: 1;
  background: var(--surface-muted); text-align: left; white-space: nowrap;
  padding: 10px;
  border-bottom: 1px solid var(--border-strong);
  font-size: 12px; line-height: 16px; font-weight: 600; color: var(--ink-muted);
}
.tbl th:first-child { padding-left: var(--space-4); }
.tbl th:last-child  { padding-right: var(--space-4); }
.tbl th button { display: inline-flex; align-items: center; gap: 4px; border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; }
.tbl th button:hover { color: var(--ink); }
.tbl td { padding: var(--space-3) 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
.tbl td:first-child { padding-left: var(--space-4); }
.tbl td:last-child  { padding-right: var(--space-4); }
.tbl tbody tr:last-child td { border-bottom: 0; }
.tbl tbody tr:hover { background: var(--surface-muted); }
.tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
.tbl .notes { font-size: 13px; line-height: 18px; color: var(--ink-muted); max-width: 230px; }

input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--brand); cursor: pointer; margin: 0; }

.pager { display: flex; align-items: center; gap: var(--space-2); }
.pager .n { display: grid; place-items: center; min-width: 30px; height: 30px; padding: 0 8px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 550; color: var(--ink-muted); font-variant-numeric: tabular-nums; cursor: pointer; border: 0; background: none; }
.pager .n:hover { background: var(--surface-muted); color: var(--ink); }
.pager .n[aria-current="page"] { background: var(--brand); color: var(--on-brand); }

/* ================= charts ================= */

.bar-track { display: block; height: 16px; border-radius: var(--radius-pill); background: var(--chart-grid); overflow: hidden; }
.bar-fill { display: block; height: 100%; border-radius: var(--radius-pill); background: var(--chart-bar); }

.pipe { display: flex; gap: 2px; height: 20px; }
.pipe span { display: block; height: 100%; border-radius: 3px; }
.pipe span:first-child { border-top-left-radius: var(--radius-pill); border-bottom-left-radius: var(--radius-pill); }
.pipe span:last-child  { border-top-right-radius: var(--radius-pill); border-bottom-right-radius: var(--radius-pill); }
.pipe .s1 { background: var(--stage-won); }
.pipe .s2 { background: var(--stage-opportunity); }
.pipe .s3 { background: var(--stage-potential); }
.pipe .s4 { background: var(--stage-sequence); }
.pipe .s5 { background: var(--stage-out); }

.legend { display: flex; flex-wrap: wrap; gap: 10px var(--space-5); margin: var(--space-4) 0 0; padding: 0; }
.legend li { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; color: var(--ink-muted); list-style: none; }
.legend i { width: 10px; height: 10px; border-radius: 3px; flex: none; }
.legend .lbl { color: var(--ink); }
.legend .v { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }

.hbars { display: grid; gap: 10px; }
.hbar { display: grid; grid-template-columns: 128px minmax(0, 1fr) 40px; align-items: center; gap: var(--space-3); font-size: 13px; }
.hbar .nm { color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hbar .v { text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; }

/* ================= feed ================= */

.feed { list-style: none; margin: 0; padding: 0; }
.feed > li { display: flex; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--border); }
.feed > li:first-child { border-top: 0; padding-top: 0; }
.feed .ico { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: var(--radius-sm); background: var(--neutral-soft); color: var(--ink-muted); }
.feed .ico.ok { background: var(--brand-soft); color: var(--brand-ink); }
.feed .bd { min-width: 0; flex: 1 1 auto; }
.feed .t1 { display: block; font-size: 13px; line-height: 18px; font-weight: 600; }
.feed .t2 { display: block; font-size: 12px; line-height: 17px; color: var(--ink-muted); }
.feed .ago { margin-left: auto; flex: none; font-size: 12px; color: var(--ink-muted); white-space: nowrap; }

.queue { list-style: none; margin: 0; padding: 0; }
.queue > li { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border); }
.queue > li:first-child { border-top: 0; }
.queue > li:hover { background: var(--surface-muted); }
.queue .bd { display: block; min-width: 0; flex: 1 1 auto; }
.queue .ln { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.queue .sub { display: block; margin-top: 2px; font-size: 12px; line-height: 17px; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.queue--wrap .sub { white-space: normal; overflow: visible; }

/* ================= notices and empty ================= */

.notice { display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px; border: 1px solid transparent; border-radius: var(--radius-md); font-size: 13px; line-height: 19px; }
.notice b { font-weight: 650; }
.notice .acts { margin-left: auto; display: flex; gap: var(--space-2); flex: none; }
.notice--ok   { background: var(--brand-soft);   color: var(--brand-ink); border-color: var(--brand-ink); }
.notice--warn { background: var(--warning-soft); color: var(--warning);   border-color: var(--warning); }
.notice--err  { background: var(--danger-soft);  color: var(--danger);    border-color: var(--danger); }

.empty { text-align: center; padding: var(--space-8) var(--space-4); }
.empty .ico { display: grid; place-items: center; width: 44px; height: 44px; margin: 0 auto var(--space-3); border-radius: var(--radius-pill); background: var(--neutral-soft); color: var(--ink-muted); }
.empty h3 { margin: 0 0 4px; font-size: 15px; line-height: 22px; font-weight: 650; }
.empty p { margin: 0 auto; max-width: 380px; font-size: 13px; line-height: 19px; color: var(--ink-muted); }
.empty .btn { margin-top: var(--space-4); }

/* ================= mobile ================= */

.rowcards { display: none; }
.tabbar { display: none; }

@media (max-width: 900px) {
  body { background: var(--surface); }
  .app { grid-template-columns: minmax(0, 1fr); border-radius: 0; box-shadow: none; min-height: 100vh; }
  .side { display: none; }
  .burger { display: inline-flex; }

  .topbar { padding: 10px var(--space-4); gap: var(--space-2); position: sticky; top: 0; z-index: 10; background: var(--surface); }
  .search { max-width: none; }
  .content { padding: var(--space-4) var(--space-4) calc(var(--space-12) + 28px); }

  .page-hd { flex-wrap: wrap; }
  .page-hd h1 { font-size: 20px; line-height: 26px; }
  .page-hd .acts { margin-left: 0; width: 100%; }
  .page-hd .acts .btn { flex: 1 1 auto; }

  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
  .stat { flex-direction: column; gap: var(--space-2); padding: var(--space-3); }
  .stat .v { font-size: 22px; line-height: 28px; }
  .tiles, .tiles--6 { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); }
  .cols { grid-template-columns: minmax(0, 1fr); }

  /* the table becomes a list of cards */
  .table-wrap { display: none; }
  .rowcards { display: grid; gap: var(--space-2); padding: var(--space-3); }
  .rowcard { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-3); background: var(--surface); }
  .rowcard .top { display: flex; align-items: center; gap: 10px; }
  .rowcard .top .right { margin-left: auto; flex: none; }
  .rowcard .pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .rowcard .dates { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); }
  .rowcard .dates .k { display: block; font-size: 11px; line-height: 15px; color: var(--ink-muted); }
  .rowcard .row-acts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin-top: 10px; }
  .rowcard .row-acts > form { display: flex; }
  .rowcard .row-acts > form:first-child { grid-column: 1 / -1; }
  .rowcard .row-acts .btn { width: 100%; height: 40px; }

  .queue > li { flex-wrap: wrap; }
  .queue .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) auto; gap: var(--space-2); width: 100%; }
  .queue .actions > form { display: flex; }
  .queue .actions > form:first-child { grid-column: 1 / 3; }
  .queue .actions > details { grid-column: 3; grid-row: 1; }
  .queue .actions .btn { width: 100%; height: 40px; }

  .hbar { grid-template-columns: 104px minmax(0, 1fr) 34px; }
  .legend { gap: 8px var(--space-4); }

  /* bottom tab bar */
  .tabbar {
    display: grid; grid-template-columns: repeat(4, 1fr);
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    background: var(--surface); border-top: 1px solid var(--border-strong);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .tabbar a { display: grid; justify-items: center; gap: 3px; padding: 9px 0 10px; font-size: 11px; line-height: 14px; font-weight: 550; color: var(--ink-muted); min-height: 54px; }
  .tabbar a[aria-current="page"] { color: var(--brand-ink); }
  .tabbar a .dotn { position: relative; }
  .tabbar a .dotn b { position: absolute; top: -4px; right: -9px; min-width: 15px; height: 15px; padding: 0 4px; border-radius: var(--radius-pill); background: var(--danger); color: #fff; font-size: 10px; line-height: 15px; font-weight: 700; }

  .btn, .chip, .input { min-height: 40px; }
  .btn--sm { min-height: 34px; }
}

@media (min-width: 901px) and (max-width: 1400px) {
  .tiles--6 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (max-width: 360px) {
  .stats { grid-template-columns: minmax(0, 1fr); }
  .rowcard .dates { grid-template-columns: minmax(0, 1fr); }
}


/* ================= app layout ================= */

.crumb { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-muted); margin-bottom: 10px; }
.crumb a:hover { text-decoration: underline; }

.split { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: var(--space-4); align-items: start; }
.rail { display: grid; gap: var(--space-4); align-content: start; }

.kv { display: grid; grid-template-columns: auto 1fr; gap: 8px 14px; font-size: 13px; line-height: 19px; margin: 0; }
.kv dt { color: var(--ink-muted); }
.kv dd { margin: 0; text-align: right; overflow-wrap: anywhere; }

.steps { margin: 0; padding-left: 20px; font-size: 14px; line-height: 22px; }
.steps li + li { margin-top: 5px; }

.tl { list-style: none; margin: 0; padding: 0; }
.tl > li { padding: var(--space-4); border-top: 1px solid var(--border); }
.tl > li:first-child { border-top: 0; }
.tl p { margin: 0; }
.tl p + p { margin-top: 6px; }

.due-strip { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; padding: 12px 14px; border-radius: var(--radius-sm); background: var(--surface-muted); margin-bottom: 14px; }
.due-strip.late { background: var(--danger-soft); }
.due-strip .actions { margin-left: auto; }

.toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border); }
.toolbar .right { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); }

.deal { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border); }
.deal:first-child { border-top: 0; padding-top: 0; }
.deal .amt { margin-left: auto; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }

.hbar .nm { display: flex; align-items: center; gap: 6px; }

.form-grid { display: grid; gap: var(--space-3); grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
.form-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-top: var(--space-4); }
.edit-block { padding: var(--space-4); border-top: 1px solid var(--border); }
.edit-block:first-of-type { border-top: 0; }

.notes { margin: 6px 0 0; font: inherit; font-size: 13px; line-height: 19px; color: var(--ink-muted); white-space: pre-wrap; overflow-wrap: anywhere; }
details > summary { cursor: pointer; color: var(--brand-ink); font-size: 13px; }
details > summary:hover { text-decoration: underline; }
details.menu > summary { color: inherit; }

.danger-zone { border-color: var(--danger); }
.danger-zone .panel-hd h2 { color: var(--danger); }

.chip-row { display: flex; flex-wrap: wrap; gap: 6px; }

/* The wordmark appears in the top bar only where the sidebar that normally carries it is hidden. */
.brand-sm { display: none; }

@media (max-width: 900px) {
  .brand-sm { display: inline-flex; align-items: center; }
  /* A basis wide enough that the two header buttons take a line of their own below the badges. */
  .page-hd .acts .btn { flex: 1 1 140px; }
  .split { grid-template-columns: minmax(0, 1fr); }
  .due-strip .actions { margin-left: 0; width: 100%; }
  .due-strip .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) auto; gap: var(--space-2); width: 100%; }
  .due-strip .actions > form { display: flex; }
  .due-strip .actions > form:first-child { grid-column: 1 / 3; }
  .due-strip .actions > details { grid-column: 3; grid-row: 1; }
  .due-strip .actions .btn { width: 100%; height: 40px; }
  .toolbar .right { margin-left: 0; width: 100%; }
  .kv dd { text-align: left; }
}
`;

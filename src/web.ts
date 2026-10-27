// Reading agency websites: fetching, turning HTML into comparable text, finding key pages, spotting changes.

export const PAGE_KINDS = ['home', 'services', 'work', 'news', 'careers'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export const PAGE_KIND_LABELS: Record<PageKind, string> = {
  home: 'Home',
  services: 'Services',
  work: 'Case studies',
  news: 'Blog / news',
  careers: 'Careers',
};

// Path and link-text keywords per page kind, covering the languages in the pipeline
// (English, Dutch, German, French, Italian, Spanish, Portuguese, Nordic).
const KEYWORDS: Record<Exclude<PageKind, 'home'>, string[]> = {
  services: [
    'services', 'service', 'what-we-do', 'wat-we-doen', 'diensten', 'expertise', 'leistungen', 'angebot', 'prestations',
    'servizi', 'servicios', 'servicos', 'serviços', 'tjenester', 'tjänster', 'ydelser', 'capabilities', 'solutions', 'oplossingen',
  ],
  work: [
    'case-studies', 'case-study', 'cases', 'work', 'our-work', 'portfolio', 'projects', 'projecten', 'werk', 'referenzen',
    'projekte', 'realisations', 'réalisations', 'references', 'références', 'lavori', 'progetti', 'proyectos', 'trabajos',
    'projetos', 'kunder', 'referenser', 'clients', 'klanten', 'kunden',
  ],
  news: ['blog', 'news', 'nieuws', 'insights', 'articles', 'aktuelles', 'neuigkeiten', 'actualites', 'actualités', 'notizie', 'noticias', 'nyheter', 'nyheder', 'journal'],
  careers: [
    'careers', 'career', 'jobs', 'join-us', 'vacatures', 'werken-bij', 'karriere', 'stellenangebote', 'carrieres', 'carrières',
    'emplois', 'recrutement', 'lavora-con-noi', 'carriere', 'empleo', 'trabaja-con-nosotros', 'carreiras', 'karriär', 'jobb', 'job',
    'hiring', 'vacancies',
  ],
};

export const USER_AGENT = 'Mozilla/5.0 (compatible; AgencyTrackerBot/1.0; partner-agency monitoring)';
const MAX_HTML_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 30_000;

export interface FetchResult {
  ok: boolean;
  url: string; // final URL after redirects
  html?: string;
  error?: string;
}

export async function fetchPage(url: string, timeoutMs = 12_000): Promise<FetchResult> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en,*;q=0.5' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, url: res.url || url, error: `HTTP ${res.status}` };
    const type = res.headers.get('content-type') ?? '';
    if (!type.includes('html')) return { ok: false, url: res.url || url, error: `Not a web page (${type || 'unknown type'})` };
    const buf = await res.arrayBuffer();
    const html = new TextDecoder().decode(buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf);
    return { ok: true, url: res.url || url, html };
  } catch (err) {
    const msg = (err as Error).name === 'TimeoutError' ? 'Timed out' : (err as Error).message || 'Fetch failed';
    return { ok: false, url, error: msg };
  }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Visible main content as lines of text. Navigation, headers, footers, scripts and cookie notices are dropped
// so that menu tweaks and banners do not count as changes.
export function extractText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(head|script|style|noscript|svg|template|iframe|select)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(header|nav|footer|aside)\b[\s\S]*?<\/\1>/gi, '\n');
  s = s.replace(/<\/?(p|div|li|ul|ol|h[1-6]|br|section|article|tr|td|th|table|main|blockquote|dd|dt|figcaption|button|a)\b[^>]*>/gi, '\n');
  s = decodeEntities(s.replace(/<[^>]+>/g, ' '));
  const lines: string[] = [];
  for (const raw of s.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (line.length < 3) continue;
    if (/cookie|privacy policy|privacybeleid|datenschutz|all rights reserved|©/i.test(line)) continue;
    if (lines[lines.length - 1] !== line) lines.push(line);
  }
  return lines.join('\n').slice(0, MAX_TEXT_CHARS);
}

export function pageTitle(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() || null : null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// Picks the best link on the homepage for each page kind, staying on the agency's own site.
export function discoverPages(html: string, baseUrl: string): { kind: PageKind; url: string }[] {
  const host = hostOf(baseUrl);
  const best = new Map<PageKind, { url: string; score: number }>();
  const linkRe = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (let m; (m = linkRe.exec(html)); ) {
    let url: URL;
    try {
      url = new URL(decodeEntities(m[1]), baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || url.hostname.replace(/^www\./, '').toLowerCase() !== host) continue;
    url.hash = '';
    url.search = '';
    const path = decodeURIComponent(url.pathname).toLowerCase().replace(/\/+$/, '');
    if (!path || path === '' || /\.(pdf|jpe?g|png|gif|svg|zip|docx?)$/.test(path)) continue;
    const segments = path.split('/').filter(Boolean);
    const text = decodeEntities(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().toLowerCase();
    for (const kind of Object.keys(KEYWORDS) as Exclude<PageKind, 'home'>[]) {
      let score = 0;
      for (const kw of KEYWORDS[kind]) {
        if (segments.includes(kw)) score = Math.max(score, 3);
        else if (segments.some((s) => s.startsWith(kw + '-') || s.endsWith('-' + kw))) score = Math.max(score, 2);
        if (text === kw.replace(/-/g, ' ') || text.split(' ').includes(kw)) score = Math.max(score, 2);
      }
      if (!score) continue;
      // Prefer index pages ("/work") over deep pages ("/work/some-project").
      score -= (segments.length - 1) * 0.5;
      const prev = best.get(kind);
      if (!prev || score > prev.score) best.set(kind, { url: url.toString(), score });
    }
  }
  const found: { kind: PageKind; url: string }[] = [{ kind: 'home', url: baseUrl }];
  for (const kind of ['services', 'work', 'news', 'careers'] as const) {
    const b = best.get(kind);
    if (b && b.score > 0 && !found.some((f) => f.url === b.url)) found.push({ kind, url: b.url });
  }
  return found;
}

export async function hashText(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Volatile bits (dates, counters) are masked so "3 days ago" or a new year in a slider does not look like news.
function comparable(line: string): string {
  return line.toLowerCase().replace(/\d+/g, '#');
}

export interface PageDiff {
  added: string[];
  addedChars: number;
  ratio: number; // share of the new text that is new
}

export function diffText(oldText: string, newText: string): PageDiff {
  const oldSet = new Set(oldText.split('\n').map(comparable));
  const newLines = newText.split('\n');
  const added = newLines.filter((l) => l.length >= 25 && !oldSet.has(comparable(l)));
  const addedChars = added.reduce((n, l) => n + l.length, 0);
  const total = newLines.reduce((n, l) => n + l.length, 0) || 1;
  return { added, addedChars, ratio: Math.min(1, addedChars / total) };
}

// Below this much genuinely new text a change is treated as cosmetic and ignored.
export const MIN_CHANGE_CHARS = 60;

export function isMeaningful(diff: PageDiff): boolean {
  return diff.addedChars >= MIN_CHANGE_CHARS;
}

// All "day" values are IST calendar dates as 'YYYY-MM-DD' strings.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function todayIST(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);
}

export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(day + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

export function formatDay(day: string | null | undefined): string {
  if (!day) return '-';
  const d = new Date(day + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

// Short form for tables: the year is dropped while it is the current one.
export function formatShort(day: string | null | undefined, today: string): string {
  if (!day) return '-';
  const d = new Date(day + 'T00:00:00Z');
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' });
}

// The second line of a date cell: how far away the day is, in words.
export function relativeDay(day: string | null | undefined, today: string): string {
  if (!day) return '';
  const n = daysBetween(today, day);
  if (n === 0) return 'Today';
  if (n > 0) return n === 1 ? 'In 1 day' : n < 90 ? `In ${n} days` : `In ${Math.round(n / 30)} months`;
  const past = -n;
  return past === 1 ? '1 day ago' : past < 90 ? `${past} days ago` : `${Math.round(past / 30)} months ago`;
}

// The same line for a follow-up, where being late is the point.
export function followupText(day: string | null | undefined, today: string): string {
  if (!day) return 'No follow-up set';
  if (day === today) return 'Due today';
  if (day < today) {
    const n = daysBetween(day, today);
    return n === 1 ? '1 day overdue' : `${n} days overdue`;
  }
  return relativeDay(day, today);
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, couple: 2, 'a couple of': 2, few: 3, 'a few': 3,
};
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Reads a follow-up time out of plain notes ("call in two days", "next week", "on Monday") as a date after `today`.
// A safety net for when the AI leaves the date empty; returns the earliest date mentioned, or null.
export function dateFromText(text: string, today: string): string | null {
  const t = text.toLowerCase().replace(/[’']/g, "'");
  const found: string[] = [];
  const num = (w: string) => (/^\d+$/.test(w) ? Number(w) : NUMBER_WORDS[w.trim()]);
  const amount = String.raw`(\d+|a couple of|a few|couple|few|an|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;

  if (/\bday after tomorrow\b/.test(t)) found.push(addDays(today, 2));
  else if (/\btomorrow\b/.test(t)) found.push(addDays(today, 1));
  for (const [unit, days] of [['day', 1], ['week', 7], ['month', 30]] as const) {
    for (const m of t.matchAll(new RegExp(String.raw`\b(?:in|after|within)\s+${amount}\s+(?:more\s+)?${unit}s?\b`, 'g'))) {
      const n = num(m[1]);
      if (n) found.push(addDays(today, n * days));
    }
  }
  if (/\bnext week\b/.test(t)) found.push(addDays(today, 7));
  if (/\bnext month\b/.test(t)) found.push(addDays(today, 30));
  const dow = new Date(today + 'T00:00:00Z').getUTCDay();
  const nextWeekday = (target: number) => addDays(today, ((target - dow + 7) % 7) || 7);
  if (/\bend of (?:the |this )?week\b/.test(t)) found.push(nextWeekday(5));
  WEEKDAYS.forEach((d, i) => {
    if (new RegExp(String.raw`\b${d}\b`).test(t)) found.push(nextWeekday(i));
  });
  const future = found.filter((d) => d > today).sort();
  return future[0] ?? null;
}

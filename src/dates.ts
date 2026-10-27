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

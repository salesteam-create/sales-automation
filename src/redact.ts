// Strip personal details from text before it is sent to the AI (Gemini free tier may keep what it receives).

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 7+ digits, allowing spaces, dashes, dots, brackets and a leading +.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
const LINKEDIN_RE = /https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[^\s)]+/gi;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Names come from the agency's contacts. Each word of 3+ letters is replaced on its own,
// so "Anna Sturm" also catches a later mention of just "Anna".
export function redact(text: string, contactNames: string[] = []): string {
  let out = text.replace(LINKEDIN_RE, '[LinkedIn]').replace(EMAIL_RE, '[Email]').replace(PHONE_RE, (m) => {
    // Leave dates like 2026-10-27 or 27/10/2026 alone.
    return /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$/.test(m.trim()) ? m : '[Phone]';
  });

  const words = new Set<string>();
  for (const name of contactNames) {
    for (const w of name.split(/[\s,&/]+|\band\b/i)) {
      const clean = w.trim().replace(/[^\p{L}'-]/gu, '');
      if (clean.length >= 3) words.add(clean);
    }
  }
  // Longest first so "Christopher" is replaced before "Chris".
  for (const w of [...words].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`(?<![\\p{L}])${escapeRegExp(w)}(?![\\p{L}])`, 'giu'), '[Contact]');
  }
  return out;
}

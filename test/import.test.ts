import { describe, expect, it } from 'vitest';
import { buildImportPlan, normalizeCountry, parseCsv, parseSheetDate, weekColumnDate } from '../src/import';

// Synthetic sample shaped like the Chabert tab (fake agencies and people).
const HEADER = 'Agency ,Meeting Date,Country ,Name,Comment ,Status,Lead Status,Aug week 4 ,feb week 1,Mar week 2,Framework,Website';
const CSV = [
  HEADER,
  'Alpha Studio,,Netherlands ,Pat One,"Projects in hand, sent proposal",WON,Hot Lead,Request for meet in Oct,,meet,sent ,https://alpha.example',
  'Beta Digital,,Belgium,Sam Two,"have emailed the profile, will revert",Email Sequence,Warm Lead,,,,to send,Not found',
  'Gamma Web,05/08/2025,Netherland ,Lee Three,not willing,Not Interested,Disqualified,,,,,https://gamma.example',
  'Delta Media,26/8/2027,UK,Kim Four,positive,Potential (Warm),Warm Lead,,,,,https://nl.linkedin.com/company/delta',
  'Epsilon,27/10/206,france,Ash Five,"multi\nline comment",Opportunity,Future fit Lead,,,,,',
  'alpha studio ,10/09/2026,Netherlands,Pat One,second meeting,Opportunity,Hot Lead,,,,,',
  ',,,,,,,,,,,',
  'Zeta,1/9/2026,Austria,Jo Six,ok,Potential (Warm),Something odd,,,,,',
].join('\n');

const TODAY = '2026-10-27';

describe('CSV parsing', () => {
  it('handles quotes, commas and newlines inside fields', () => {
    expect(parseCsv('a,"b,c","d\ne"\n1,2,3')).toEqual([
      ['a', 'b,c', 'd\ne'],
      ['1', '2', '3'],
    ]);
  });
});

describe('dates', () => {
  it('reads day/month/year', () => {
    expect(parseSheetDate('4/8/2025', TODAY)).toEqual({ day: '2025-08-04', note: undefined, kind: undefined });
  });
  it('corrects a future year when the same day this year has passed', () => {
    expect(parseSheetDate('26/8/2027', TODAY)).toMatchObject({ day: '2026-08-26', kind: 'future_date' });
  });
  it('corrects a three-digit year typo', () => {
    expect(parseSheetDate('27/10/206', TODAY)).toMatchObject({ day: '2026-10-27', kind: 'bad_date' });
  });
  it('uses the last of several dates and flags it', () => {
    expect(parseSheetDate('05/05/2026\n15/05/2026', TODAY)).toMatchObject({ day: '2026-05-15', kind: 'bad_date' });
  });
  it('maps week columns to dates in the assumed year', () => {
    expect(weekColumnDate('Mar week 2', 2026)).toBe('2026-03-08');
    expect(weekColumnDate('Aug week 4 ', 2026)).toBe('2026-08-22');
    expect(weekColumnDate('Framework', 2026)).toBeNull();
  });
  it('normalises country names', () => {
    expect(normalizeCountry('Netherland ')).toBe('Netherlands');
    expect(normalizeCountry('france')).toBe('France');
    expect(normalizeCountry('NZ')).toBe('New Zealand');
  });
});

describe('buildImportPlan', () => {
  const plan = buildImportPlan(CSV, { today: TODAY });
  const byName = (n: string) => plan.agencies.find((a) => a.name === n)!;

  it('skips empty rows and merges duplicates', () => {
    expect(plan.agencies.map((a) => a.name)).toEqual(['Alpha Studio', 'Beta Digital', 'Gamma Web', 'Delta Media', 'Epsilon', 'Zeta']);
    const alpha = byName('Alpha Studio');
    expect(alpha.rows).toEqual([2, 7]);
    expect(alpha.contacts).toEqual(['Pat One']);
    // The later dated row decides the status.
    expect(alpha.status).toBe('Opportunity');
    expect(plan.issues.some((i) => i.kind === 'duplicate' && i.row_number === 7)).toBe(true);
  });

  it('turns weekly columns into dated timeline notes', () => {
    const notes = byName('Alpha Studio').entries.filter((e) => e.type === 'note');
    expect(notes).toEqual([
      { date: '2026-08-22', type: 'note', raw_notes: 'Weekly log (Aug week 4): Request for meet in Oct' },
      { date: '2026-03-08', type: 'note', raw_notes: 'Weekly log (Mar week 2): meet' },
    ]);
    expect(byName('Alpha Studio').last_contact_date).toBe('2026-09-10');
  });

  it('fixes disallowed combinations but keeps the lead status, and flags them', () => {
    const beta = byName('Beta Digital');
    expect(beta.lead_status).toBe('Warm');
    expect(beta.status).toBe('Potential (Warm)');
    expect(plan.issues.find((i) => i.row_number === 3 && i.kind === 'bad_combo')).toBeTruthy();
  });

  it('handles websites, framework and countries', () => {
    expect(byName('Alpha Studio').framework).toBe('Sent');
    expect(byName('Beta Digital').framework).toBe('To send');
    expect(byName('Beta Digital').website_note).toBe('Not found');
    expect(byName('Delta Media').website).toBeNull();
    expect(byName('Delta Media').website_note).toMatch(/^LinkedIn only/);
    expect(byName('Gamma Web').country).toBe('Netherlands');
  });

  it('flags unknown values and defaults them', () => {
    expect(byName('Zeta').lead_status).toBe('Future fit');
    expect(plan.issues.find((i) => i.row_number === 9 && i.kind === 'unknown_value')).toBeTruthy();
  });

  it('schedules follow-ups: none for Disqualified, overdue ones spread from today, Won first', () => {
    expect(byName('Gamma Web').next_followup_date).toBeNull();
    // Alpha (Opportunity/Hot, last contact 10 Sep) is overdue and highest priority -> today (a Tuesday).
    expect(byName('Alpha Studio').next_followup_date).toBe(TODAY);
    // Epsilon met today, Future fit -> natural date 30 days out.
    expect(byName('Epsilon').next_followup_date).toBe('2026-11-26');
    // No meeting date and no week entries -> timer starts today (Warm: +7).
    expect(byName('Beta Digital').next_followup_date).toBe('2026-11-03');
  });

  it('spreads overdue follow-ups over working days with a daily cap', () => {
    const rows = [HEADER];
    for (let i = 0; i < 5; i++) rows.push(`Agency ${i},01/01/2026,UK,X,ok,Potential (Warm),Warm Lead,,,,,`);
    const p = buildImportPlan(rows.join('\n'), { today: '2026-10-30', catchUpPerDay: 2 }); // a Friday
    expect(p.agencies.map((a) => a.next_followup_date)).toEqual(['2026-10-30', '2026-10-30', '2026-11-02', '2026-11-02', '2026-11-03']);
  });

  it('rejects a CSV without the needed columns', () => {
    expect(() => buildImportPlan('Name,Comment\nx,y', { today: TODAY })).toThrow(/Agency, Status and Lead Status/);
  });
});

describe('duplicates by website', () => {
  it('merges rows with different names but the same website', () => {
    const csv = [
      HEADER,
      'LD Media - Webdesign Agentur,16/10/2025,Austria,A,ok,Potential (Warm),Future fit Lead,,,,,https://ld-media.example',
      'LD Media,17/10/2025,Austria,A,ok again,Potential (Warm),Warm Lead,,,,,https://www.ld-media.example/',
    ].join('\n');
    const plan = buildImportPlan(csv, { today: TODAY });
    expect(plan.agencies).toHaveLength(1);
    expect(plan.agencies[0].lead_status).toBe('Warm');
    expect(plan.issues.find((i) => i.kind === 'duplicate')?.detail).toMatch(/same name or website/);
  });
});

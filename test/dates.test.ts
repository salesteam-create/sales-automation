import { describe, expect, it } from 'vitest';
import { dateFromText } from '../src/dates';

const TODAY = '2026-10-29'; // a Thursday

describe('dateFromText', () => {
  it('reads relative times', () => {
    expect(dateFromText('I need to call the client in two days', TODAY)).toBe('2026-10-31');
    expect(dateFromText("Call again in 2 days' time", TODAY)).toBe('2026-10-31');
    expect(dateFromText('follow up tomorrow', TODAY)).toBe('2026-10-30');
    expect(dateFromText('the day after tomorrow', TODAY)).toBe('2026-10-31');
    expect(dateFromText('check back in a couple of weeks', TODAY)).toBe('2026-11-12');
    expect(dateFromText('touch base next week', TODAY)).toBe('2026-11-05');
    expect(dateFromText('reach out in a few days', TODAY)).toBe('2026-11-01');
    expect(dateFromText('revisit in 3 months', TODAY)).toBe('2027-01-27');
  });

  it('reads weekdays as the next one after today', () => {
    expect(dateFromText('Meeting confirmed for Monday', TODAY)).toBe('2026-11-02');
    expect(dateFromText('call on Thursday', TODAY)).toBe('2026-11-05');
    expect(dateFromText('by the end of the week', TODAY)).toBe('2026-10-30');
  });

  it('takes the earliest of several and ignores notes without timing', () => {
    expect(dateFromText('Send proposal tomorrow, meet next week', TODAY)).toBe('2026-10-30');
    expect(dateFromText('Good call, they liked the portfolio.', TODAY)).toBeNull();
  });
});

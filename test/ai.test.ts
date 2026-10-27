import { describe, expect, it } from 'vitest';
import { sanitizeAnalysis } from '../src/ai';

describe('sanitizeAnalysis', () => {
  it('drops invalid statuses, past dates and junk list items', () => {
    const out = sanitizeAnalysis(
      {
        summary: ' Good call ',
        services_needed: ['Shopify', '', 3 as unknown as string],
        next_step_date: '2026-01-01',
        suggested_status: 'Maybe' as never,
        suggested_lead_status: 'Hot',
        suggestion_reason: 'Asked for a quote',
      },
      '2026-10-27',
    );
    expect(out.summary).toBe('Good call');
    expect(out.services_needed).toEqual(['Shopify']);
    expect(out.next_step_date).toBeNull();
    expect(out.suggested_status).toBeNull();
    expect(out.suggested_lead_status).toBe('Hot');
    expect(out.suggestion_reason).toBe('Asked for a quote');
  });

  it('keeps a future next-step date and clears the reason when nothing is suggested', () => {
    const out = sanitizeAnalysis({ summary: 'x', next_step_date: '2026-11-10', suggestion_reason: 'n/a' }, '2026-10-27');
    expect(out.next_step_date).toBe('2026-11-10');
    expect(out.suggestion_reason).toBeNull();
  });
});

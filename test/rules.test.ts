import { describe, expect, it } from 'vitest';
import { downgrade, followupInterval, isAllowedCombo, nextFollowupDate, statusForLead } from '../src/rules';

describe('status combinations', () => {
  it('allows only the BRD combinations', () => {
    expect(isAllowedCombo('Won', 'Hot')).toBe(true);
    expect(isAllowedCombo('Email Sequence', 'Warm')).toBe(false);
    expect(isAllowedCombo('Not Interested', 'Future fit')).toBe(false);
    expect(isAllowedCombo('Not Interested', 'Disqualified')).toBe(true);
  });

  it('keeps the current status when it still fits the new lead status', () => {
    expect(statusForLead('Warm', 'Opportunity')).toBe('Opportunity');
    expect(statusForLead('Cold', 'Opportunity')).toBe('Email Sequence');
    expect(statusForLead('Disqualified', 'Potential (Warm)')).toBe('Not Interested');
  });
});

describe('follow-up timing', () => {
  it('steps Hot and Warm through 7, 15, 30 then monthly', () => {
    expect([0, 1, 2, 3, 7].map((s) => followupInterval('Warm', 'Potential (Warm)', s))).toEqual([7, 15, 30, 30, 30]);
  });

  it('uses 30 days for Future fit and Education, 90 for Cold, monthly for Won, none for Disqualified', () => {
    expect(followupInterval('Future fit', 'Potential (Warm)', 0)).toBe(30);
    expect(followupInterval('Education', 'Opportunity', 4)).toBe(30);
    expect(followupInterval('Cold', 'Email Sequence', 0)).toBe(90);
    expect(followupInterval('Hot', 'Won', 0)).toBe(30);
    expect(nextFollowupDate('2026-10-27', 'Disqualified', 'Not Interested', 0)).toBeNull();
  });

  it('computes calendar dates', () => {
    expect(nextFollowupDate('2026-10-27', 'Hot', 'Opportunity', 0)).toBe('2026-11-03');
  });
});

describe('downgrade', () => {
  it('moves one level down and stops at Disqualified', () => {
    expect(downgrade('Hot')).toBe('Warm');
    expect(downgrade('Warm')).toBe('Future fit');
    expect(downgrade('Education')).toBe('Cold');
    expect(downgrade('Cold')).toBe('Disqualified');
    expect(downgrade('Disqualified')).toBeNull();
  });
});

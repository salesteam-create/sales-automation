// Status and follow-up rules (BRD section 2).

import { addDays } from './dates';

export const STATUSES = ['Won', 'Opportunity', 'Potential (Warm)', 'Email Sequence', 'Not Interested'] as const;
export const LEAD_STATUSES = ['Hot', 'Warm', 'Education', 'Future fit', 'Cold', 'Disqualified'] as const;
export const FRAMEWORK_OPTIONS = ['Sent', 'To send', 'Not needed'] as const;
export const TIMELINE_TYPES = ['meeting', 'call', 'email', 'note'] as const;

export type Status = (typeof STATUSES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ALLOWED_COMBOS: Record<Status, readonly LeadStatus[]> = {
  Won: ['Hot'],
  Opportunity: ['Hot', 'Warm', 'Education', 'Future fit'],
  'Potential (Warm)': ['Warm', 'Future fit', 'Education'],
  'Email Sequence': ['Cold', 'Future fit', 'Education'],
  'Not Interested': ['Disqualified'],
};

export function isStatus(v: unknown): v is Status {
  return (STATUSES as readonly unknown[]).includes(v);
}

export function isLeadStatus(v: unknown): v is LeadStatus {
  return (LEAD_STATUSES as readonly unknown[]).includes(v);
}

export function isAllowedCombo(status: Status, lead: LeadStatus): boolean {
  return ALLOWED_COMBOS[status].includes(lead);
}

// When a lead status changes, keep the current status if it still fits, otherwise pick the natural one.
export function statusForLead(lead: LeadStatus, current: Status): Status {
  if (isAllowedCombo(current, lead)) return current;
  switch (lead) {
    case 'Hot':
      return 'Opportunity';
    case 'Warm':
    case 'Education':
    case 'Future fit':
      return 'Potential (Warm)';
    case 'Cold':
      return 'Email Sequence';
    case 'Disqualified':
      return 'Not Interested';
  }
}

// Days until the next follow-up. `step` counts follow-ups done since the last real conversation.
export function followupInterval(lead: LeadStatus, status: Status, step: number): number | null {
  if (status === 'Won') return 30;
  switch (lead) {
    case 'Hot':
    case 'Warm':
      return [7, 15, 30][step] ?? 30;
    case 'Education':
    case 'Future fit':
      return 30;
    case 'Cold':
      return 90;
    case 'Disqualified':
      return null;
  }
}

export function nextFollowupDate(from: string, lead: LeadStatus, status: Status, step: number): string | null {
  const days = followupInterval(lead, status, step);
  return days === null ? null : addDays(from, days);
}

export const UNANSWERED_LIMIT = 3;

// One level down, used when follow-ups go unanswered. The AI never moves anything; Chabert approves.
export function downgrade(lead: LeadStatus): LeadStatus | null {
  switch (lead) {
    case 'Hot':
      return 'Warm';
    case 'Warm':
      return 'Future fit';
    case 'Education':
    case 'Future fit':
      return 'Cold';
    case 'Cold':
      return 'Disqualified';
    case 'Disqualified':
      return null;
  }
}

// Order used when spreading imported follow-ups so the most valuable ones come first.
export const LEAD_PRIORITY: Record<LeadStatus, number> = {
  Hot: 0,
  Warm: 1,
  Education: 2,
  'Future fit': 3,
  Cold: 4,
  Disqualified: 5,
};

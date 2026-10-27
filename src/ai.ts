// Gemini calls. The key lives only in the Worker (secret GEMINI_API_KEY); it never reaches the browser.
// Every text that may contain personal details goes through redact() before it is sent.

import { LEAD_STATUSES, STATUSES, isLeadStatus, isStatus, type LeadStatus, type Status } from './rules';

export interface AiEnv {
  GEMINI_API_KEY?: string;
  GEMINI_MODEL: string;
  GEMINI_BASE_URL?: string; // only for local testing against a mock
}

export class AiUnavailableError extends Error {}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export async function generateJson<T>(env: AiEnv, prompt: string, schema: object): Promise<T> {
  if (!env.GEMINI_API_KEY) throw new AiUnavailableError('AI is not set up yet (GEMINI_API_KEY missing).');
  const res = await fetch(`${env.GEMINI_BASE_URL || ENDPOINT}/${env.GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.3 },
    }),
  });
  if (res.status === 429) throw new AiUnavailableError('AI free-tier limit reached. Try again later.');
  if (!res.ok) throw new AiUnavailableError(`AI request failed (${res.status}).`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiUnavailableError('AI returned an unreadable answer. Try again.');
  }
}

export const KILOWOTT_CONTEXT = `Kilowott is a digital agency (India and Europe) that partners with other agencies as a
white-label delivery partner (Integration model) or collaborator (Collaboration model).
Services: Consulting & Strategy; Software & Applications (.NET, Node.js, PHP/Laravel, React, React Native, Vue, AWS/Azure, QA);
Web & Ecommerce (WordPress, Shopify, WooCommerce, Webflow, Wix, NopCommerce, Klaviyo/HubSpot automation, payments, analytics);
Interaction Design (UX/UI, research, prototyping); Animation (2D/3D, explainers, motion); Digital Marketing (PPC, SEO, social,
email, demand generation, marketing automation); GEO (generative engine optimisation); Kilowott Intelligence (AI adoption and
automation); Kilowott Workforce (on-demand teams, staff augmentation).
The salesperson meets partner agencies and wants them to send work to Kilowott.`;

const STATUS_RULES = `Status values: ${STATUSES.join(', ')}. Lead Status values: ${LEAD_STATUSES.join(', ')}.
Allowed combinations: Won+Hot; Opportunity+(Hot|Warm|Education|Future fit); Potential (Warm)+(Warm|Future fit|Education);
Email Sequence+(Cold|Future fit|Education); Not Interested+Disqualified.`;

export interface NoteAnalysis {
  summary: string;
  interest_level: string;
  services_needed: string[];
  projects: string[];
  objections: string[];
  next_step: string;
  next_step_date: string | null;
  suggested_status: Status | null;
  suggested_lead_status: LeadStatus | null;
  suggestion_reason: string | null;
}

const NOTE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '3 to 5 short lines, plain English' },
    interest_level: { type: 'string', enum: ['High', 'Medium', 'Low', 'Unclear'] },
    services_needed: { type: 'array', items: { type: 'string' } },
    projects: { type: 'array', items: { type: 'string' } },
    objections: { type: 'array', items: { type: 'string' } },
    next_step: { type: 'string' },
    next_step_date: { type: 'string', nullable: true, description: 'YYYY-MM-DD only if the notes imply a specific time' },
    suggested_status: { type: 'string', nullable: true, enum: [...STATUSES] },
    suggested_lead_status: { type: 'string', nullable: true, enum: [...LEAD_STATUSES] },
    suggestion_reason: { type: 'string', nullable: true },
  },
  required: ['summary', 'interest_level', 'services_needed', 'projects', 'objections', 'next_step'],
};

export async function analyzeNote(
  env: AiEnv,
  input: { agencyName: string; status: Status; leadStatus: LeadStatus; today: string; history: string; notes: string },
): Promise<NoteAnalysis> {
  const prompt = `${KILOWOTT_CONTEXT}

${STATUS_RULES}

Today is ${input.today}. Agency: ${input.agencyName}. Current Status: ${input.status}. Current Lead Status: ${input.leadStatus}.
Personal details have been replaced with placeholders like [Contact].

Recent history (newest first):
${input.history || '(none)'}

New meeting notes:
"""
${input.notes}
"""

Summarise the new notes for the salesperson. Extract interest level, services they need, projects mentioned and objections.
Give one concrete next step. Set next_step_date only if the notes mention or clearly imply a time ("next week", "in May",
"after the 20th"); convert it to a date after today. Suggest a Status/Lead Status change only if the notes clearly justify it,
keep it to an allowed combination, and explain why in one sentence. Otherwise leave the suggestion fields null.`;

  const raw = await generateJson<NoteAnalysis>(env, prompt, NOTE_SCHEMA);
  return sanitizeAnalysis(raw, input.today);
}

export function sanitizeAnalysis(raw: Partial<NoteAnalysis>, today: string): NoteAnalysis {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : []);
  const date = typeof raw.next_step_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.next_step_date) && raw.next_step_date > today
    ? raw.next_step_date
    : null;
  const status = isStatus(raw.suggested_status) ? raw.suggested_status : null;
  const lead = isLeadStatus(raw.suggested_lead_status) ? raw.suggested_lead_status : null;
  return {
    summary: String(raw.summary ?? '').trim(),
    interest_level: String(raw.interest_level ?? 'Unclear'),
    services_needed: list(raw.services_needed),
    projects: list(raw.projects),
    objections: list(raw.objections),
    next_step: String(raw.next_step ?? '').trim(),
    next_step_date: date,
    suggested_status: status,
    suggested_lead_status: lead,
    suggestion_reason: status || lead ? String(raw.suggestion_reason ?? '').trim() || null : null,
  };
}

const NEXT_STEPS_SCHEMA = {
  type: 'object',
  properties: { steps: { type: 'array', items: { type: 'string' }, description: '1 to 3 concrete actions' } },
  required: ['steps'],
};

export async function suggestNextSteps(
  env: AiEnv,
  input: {
    agencyName: string;
    status: Status;
    leadStatus: LeadStatus;
    today: string;
    lastContact: string | null;
    nextFollowup: string | null;
    unanswered: number;
    deal: string | null;
    history: string;
    intel?: string;
  },
): Promise<string[]> {
  const prompt = `${KILOWOTT_CONTEXT}

Today is ${input.today}. Agency: ${input.agencyName}. Status: ${input.status}. Lead Status: ${input.leadStatus}.
Last contact: ${input.lastContact ?? 'unknown'}. Next follow-up due: ${input.nextFollowup ?? 'none'}.
Follow-ups without reply: ${input.unanswered}. Deal in hand: ${input.deal ?? 'none'}.
Personal details have been replaced with placeholders like [Contact].

History (newest first):
${input.history || '(none)'}

From their website:
${input.intel || '(not scanned yet)'}

Give 1 to 3 concrete next actions for the salesperson, most important first. Each is one sentence that says what to do and
why, and names the Kilowott service or offer to lead with when relevant. Use recent website news as a reason to reach out
when it fits. No generic advice.`;

  const raw = await generateJson<{ steps?: unknown }>(env, prompt, NEXT_STEPS_SCHEMA);
  const steps = Array.isArray(raw.steps) ? raw.steps.filter((s): s is string => typeof s === 'string' && !!s.trim()) : [];
  return steps.slice(0, 3);
}

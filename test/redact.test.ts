import { describe, expect, it } from 'vitest';
import { redact } from '../src/redact';

describe('redact', () => {
  it('removes emails, phones and LinkedIn profile links', () => {
    const out = redact('Mail jo@example.com or call +44 7911 123456, see https://www.linkedin.com/in/someone-123/');
    expect(out).toBe('Mail [Email] or call [Phone], see [LinkedIn]');
  });

  it('keeps dates', () => {
    expect(redact('Meeting on 27/10/2026 and 2026-11-03')).toBe('Meeting on 27/10/2026 and 2026-11-03');
  });

  it('replaces contact names, including first names on their own and longer names first', () => {
    const out = redact('Christopher said Chris and Sam will revert. Anna-Lena agreed.', ['Christopher Lee', 'Sam and Chris', 'Anna-Lena']);
    expect(out).toBe('[Contact] said [Contact] and [Contact] will revert. [Contact] agreed.');
  });

  it('does not replace a name inside another word', () => {
    expect(redact('Samsung project for Sam', ['Sam'])).toBe('Samsung project for [Contact]');
  });
});

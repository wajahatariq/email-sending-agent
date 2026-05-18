import { describe, it, expect } from 'vitest';
import { parseRecipientsCsv } from '../../src/lib/csv';

describe('parseRecipientsCsv', () => {
  it('parses valid rows', () => {
    const out = parseRecipientsCsv('email,name,company\na@x.com,Al,Acme\n');
    expect(out.valid).toEqual([{ email: 'a@x.com', name: 'Al', company: 'Acme', vars: {} }]);
    expect(out.errors).toHaveLength(0);
  });

  it('rejects invalid email and dedupes', () => {
    const out = parseRecipientsCsv('email\nbad\nb@x.com\nb@x.com\n');
    expect(out.errors.some(e => e.includes('bad'))).toBe(true);
    expect(out.valid.map(r => r.email)).toEqual(['b@x.com']);
  });

  it('strips CSV formula/CRLF injection from text fields', () => {
    const out = parseRecipientsCsv('email,name\nc@x.com,"=cmd|calc\r\nInjected: 1"\n');
    expect(out.valid[0].name).not.toMatch(/^[=+\-@]/);
    expect(out.valid[0].name).not.toContain('\r');
    expect(out.valid[0].name).not.toContain('\n');
  });

  it('requires an email column', () => {
    const out = parseRecipientsCsv('name\nAl\n');
    expect(out.errors[0]).toContain('email column');
    expect(out.valid).toHaveLength(0);
  });

  it('parses bare CR (legacy Mac) line endings', () => {
    const out = parseRecipientsCsv('email,name\rd@x.com,Dee\re@x.com,Eee\r');
    expect(out.errors).toHaveLength(0);
    expect(out.valid.map(r => r.email)).toEqual(['d@x.com', 'e@x.com']);
    expect(out.valid[0].name).toBe('Dee');
  });
});

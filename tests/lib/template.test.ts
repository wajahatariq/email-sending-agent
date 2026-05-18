import { describe, it, expect } from 'vitest';
import { renderEmail } from '../../src/lib/template';

const tmpl = { subject: 'Hi {{name}}', bodyHtml: '<p>Hello {{name}} at {{company}}</p>', bodyText: 'Hello {{name}}' };
const rcpt = { email: 'a@x.com', name: 'Al', company: 'Acme', vars: {} };
const cfg = { companyName: 'Austro', companyAddress: '1 St, City', baseUrl: 'https://s.com' };

describe('renderEmail', () => {
  it('fills tokens', () => {
    const r = renderEmail(tmpl, rcpt, 'TOKEN123', cfg);
    expect(r.subject).toBe('Hi Al');
    expect(r.html).toContain('Hello Al at Acme');
  });

  it('appends physical address + unsubscribe link', () => {
    const r = renderEmail(tmpl, rcpt, 'TOKEN123', cfg);
    expect(r.html).toContain('1 St, City');
    expect(r.html).toContain('https://s.com/api/unsub?token=TOKEN123');
    expect(r.text).toContain('https://s.com/api/unsub?token=TOKEN123');
  });

  it('sets one-click List-Unsubscribe headers', () => {
    const r = renderEmail(tmpl, rcpt, 'TOKEN123', cfg);
    expect(r.headers['List-Unsubscribe']).toContain('https://s.com/api/unsub?token=TOKEN123');
    expect(r.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('leaves unknown tokens blank, not literal', () => {
    const r = renderEmail({ ...tmpl, subject: 'Hi {{missing}}' }, rcpt, 'T', cfg);
    expect(r.subject).toBe('Hi ');
  });
});

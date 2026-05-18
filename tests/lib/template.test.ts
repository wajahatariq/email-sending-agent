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

  it('HTML-escapes token values in html but not in text', () => {
    const r = renderEmail(
      { subject: 'S', bodyHtml: '<p>{{name}}</p>', bodyText: '{{name}}' },
      { email: 'a@x.com', name: 'A & B <script>x</script>', company: '', vars: {} },
      'T', cfg,
    );
    expect(r.html).toContain('A &amp; B &lt;script&gt;x&lt;/script&gt;');
    expect(r.html).not.toContain('<script>x</script>');
    expect(r.text).toContain('A & B <script>x</script>');
  });

  it('escapes cfg values in the html footer', () => {
    const r = renderEmail(tmpl, rcpt, 'T', { companyName: 'Smith & Co', companyAddress: '5th & Main', baseUrl: 'https://s.com' });
    expect(r.html).toContain('Smith &amp; Co');
    expect(r.html).toContain('5th &amp; Main');
  });

  it('does not escape the operator-authored html template markup itself', () => {
    const r = renderEmail({ subject: 'S', bodyHtml: '<a href="https://x.com">{{name}}</a>', bodyText: 't' }, rcpt, 'T', cfg);
    expect(r.html).toContain('<a href="https://x.com">Al</a>');
  });
});

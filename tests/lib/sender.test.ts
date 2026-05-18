import { describe, it, expect, vi } from 'vitest';
import { sendOne, classifySmtpError } from '../../src/lib/sender';

describe('sender', () => {
  it('sends via injected transport and returns ok', async () => {
    const transport = { sendMail: vi.fn().mockResolvedValue({ response: '250 OK' }) };
    const r = await sendOne(transport as any, {
      from: 'A <a@d.com>', to: 'x@y.com', subject: 'S',
      html: '<p>h</p>', text: 't', headers: {},
    });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.response).toContain('250'); }
    expect(transport.sendMail).toHaveBeenCalledOnce();
  });

  it('classifies 5xx as hard, 4xx/timeout as soft', () => {
    expect(classifySmtpError({ responseCode: 550 })).toBe('hard');
    expect(classifySmtpError({ responseCode: 421 })).toBe('soft');
    expect(classifySmtpError({ code: 'ETIMEDOUT' })).toBe('soft');
  });

  it('returns failure with classification on throw', async () => {
    const transport = { sendMail: vi.fn().mockRejectedValue({ responseCode: 550, message: 'bad mailbox' }) };
    const r = await sendOne(transport as any, {
      from: 'a', to: 'x@y.com', subject: 's', html: 'h', text: 't', headers: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.kind).toBe('hard'); }
  });

  it('classifies EAUTH (bad SMTP creds) as config, not soft or hard', () => {
    expect(classifySmtpError({ code: 'EAUTH' })).toBe('config');
  });

  it('config failure surfaces kind=config and does not look like a recipient bounce', async () => {
    const transport = { sendMail: vi.fn().mockRejectedValue({ code: 'EAUTH', message: 'auth failed' }) };
    const r = await sendOne(transport as any, {
      from: 'a', to: 'x@y.com', subject: 's', html: 'h', text: 't', headers: {},
    });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.kind).toBe('config'); }
  });
});

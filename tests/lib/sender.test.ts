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
    expect(r.response).toContain('250');
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
    expect(r.kind).toBe('hard');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { runTick, type TickPorts } from '../../src/lib/tick';

function basePorts(over: Partial<TickPorts> = {}): TickPorts {
  return {
    now: () => new Date('2026-05-19T10:00:00Z'),
    rng: () => 0.5,
    getActiveCampaign: async () => ({
      id: 1, bhStart: 9, bhEnd: 17, timezone: 'UTC',
      globalDailyCap: 100, perInboxCap: 40, jitterPct: 30,
    }),
    getEligibleDomains: async () => ([
      { id: 1, fromName: 'A', fromEmail: 'a@d1.com', smtp: { host: 'h', port: 587, user: 'u', pass: 'p' },
        dailyCap: 40, warmupStart: new Date('2026-05-01T00:00:00Z'), sentToday: 0 },
    ]),
    getSuppressed: async () => new Set<string>(),
    getPendingRecipients: async () => ([
      { id: 11, email: 'r1@x.com', name: 'R1', company: 'C', vars: {}, unsubToken: 'T1' },
    ]),
    getActiveTemplates: async () => ([
      { id: 7, subject: 'Hi {{name}}', bodyHtml: '<p>{{name}}</p>', bodyText: '{{name}}', weight: 1 },
    ]),
    getTotalSentToday: async () => 0,
    lastDomainIndex: async () => -1,
    send: vi.fn().mockResolvedValue({ ok: true, response: '250 OK' }),
    recordSent: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined),
    suppress: vi.fn().mockResolvedValue(undefined),
    pauseDomain: vi.fn().mockResolvedValue(undefined),
    cfg: { companyName: 'Co', companyAddress: 'Addr', baseUrl: 'https://s.com' },
    ...over,
  };
}

describe('runTick', () => {
  it('skips when no active campaign', async () => {
    const r = await runTick(basePorts({ getActiveCampaign: async () => null }));
    expect(r.sent).toBe(0); expect(r.skipped).toBe('no-active-campaign');
  });
  it('skips outside business hours', async () => {
    const r = await runTick(basePorts({ now: () => new Date('2026-05-19T20:00:00Z') }));
    expect(r.skipped).toBe('outside-window');
  });
  it('sends a recipient and records it', async () => {
    const p = basePorts();
    const r = await runTick(p);
    expect(r.sent).toBe(1);
    expect(p.send).toHaveBeenCalledOnce();
    expect(p.recordSent).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 11, domainId: 1 }));
  });
  it('never sends to suppressed addresses', async () => {
    const p = basePorts({ getSuppressed: async () => new Set(['r1@x.com']) });
    const r = await runTick(p);
    expect(r.sent).toBe(0);
    expect(p.send).not.toHaveBeenCalled();
  });
  it('respects global daily cap already reached', async () => {
    const r = await runTick(basePorts({ getTotalSentToday: async () => 100 }));
    expect(r.sent).toBe(0); expect(r.skipped).toBe('global-cap-reached');
  });
  it('hard failure suppresses recipient email', async () => {
    const p = basePorts({ send: vi.fn().mockResolvedValue({ ok: false, kind: 'hard', error: 'bad mailbox' }) });
    await runTick(p);
    expect(p.suppress).toHaveBeenCalledWith('r1@x.com', 'bounce');
    expect(p.recordFailure).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 11, kind: 'hard' }));
  });
  it('soft failure does not suppress', async () => {
    const p = basePorts({ send: vi.fn().mockResolvedValue({ ok: false, kind: 'soft', error: 'timeout' }) });
    await runTick(p);
    expect(p.suppress).not.toHaveBeenCalled();
    expect(p.recordFailure).toHaveBeenCalledWith(expect.objectContaining({ kind: 'soft' }));
  });
  it('config failure pauses the domain and never suppresses the recipient', async () => {
    const p = basePorts({ send: vi.fn().mockResolvedValue({ ok: false, kind: 'config', error: 'auth failed' }) });
    const r = await runTick(p);
    expect(p.pauseDomain).toHaveBeenCalledWith(1, 'smtp-config');
    expect(p.suppress).not.toHaveBeenCalled();
    expect(p.recordFailure).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 11, domainId: 1, kind: 'config' }));
    expect(r.sent).toBe(0);
  });
  it('does not exceed global cap when remaining budget is small', async () => {
    let sent = 0;
    const many = Array.from({ length: 50 }, (_, i) => ({ id: i, email: `u${i}@x.com`, name: 'U', company: 'C', vars: {}, unsubToken: `T${i}` }));
    const p = basePorts({
      getTotalSentToday: async () => 98, // only 2 left of 100
      getPendingRecipients: async () => many,
      recordSent: vi.fn().mockImplementation(async () => { sent++; }),
    });
    await runTick(p);
    expect(sent).toBeLessThanOrEqual(2);
  });
}
);

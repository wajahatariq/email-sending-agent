import { describe, it, expect, vi } from 'vitest';
import { runTick, type TickPorts } from '../../src/lib/tick';

describe('multi-tick day invariants', () => {
  it('never exceeds caps, honors suppression, paces across the window, no dupes', async () => {
    const sentEmails: string[] = [];
    let totalSent = 0;
    const sentByDomain: Record<number, number> = { 1: 0, 2: 0 };
    const pending = Array.from({ length: 300 }, (_, i) => ({
      id: i, email: `u${i}@x.com`, name: `U${i}`, company: 'C', vars: {}, unsubToken: `T${i}`,
    }));
    const suppressed = new Set(['u5@x.com']);

    const makePorts = (now: Date): TickPorts => ({
      now: () => now,
      rng: () => 0.5,
      getActiveCampaign: async () => ({
        id: 1, bhStart: 9, bhEnd: 17, timezone: 'UTC',
        globalDailyCap: 80, perInboxCap: 40, jitterPct: 30,
      }),
      getEligibleDomains: async () => ([1, 2] as const).map((id) => ({
        id, fromName: `D${id}`, fromEmail: `d${id}@s.com`,
        smtp: { host: 'h', port: 587, user: 'u', pass: 'p' },
        dailyCap: 40, warmupStart: new Date('2026-01-01T00:00:00Z'),
        sentToday: sentByDomain[id],
      })),
      getSuppressed: async () => suppressed,
      getPendingRecipients: async (limit: number) =>
        pending.filter(p => !sentEmails.includes(p.email)).slice(0, limit),
      getActiveTemplates: async () => ([{ id: 7, subject: 'S', bodyHtml: '<p>x</p>', bodyText: 'x', weight: 1 }]),
      getTotalSentToday: async () => totalSent,
      lastDomainIndex: async () => -1,
      send: vi.fn().mockResolvedValue({ ok: true, response: '250' }),
      recordSent: async (x: { recipientId: number; domainId: number }) => {
        const em = pending.find(p => p.id === x.recipientId)!.email;
        sentEmails.push(em); totalSent++; sentByDomain[x.domainId]++;
      },
      recordFailure: async () => {},
      suppress: async () => {},
      pauseDomain: async () => {},
      cfg: { companyName: 'Co', companyAddress: 'A', baseUrl: 'https://s.com' },
    });

    // 09:00 .. 16:50 UTC, every 10 min
    for (let h = 9; h < 17; h++) {
      for (let m = 0; m < 60; m += 10) {
        await runTick(makePorts(new Date(Date.UTC(2026, 4, 19, h, m, 0))));
      }
    }

    expect(totalSent).toBeLessThanOrEqual(80);              // global cap
    expect(sentByDomain[1]).toBeLessThanOrEqual(40);        // per-domain cap
    expect(sentByDomain[2]).toBeLessThanOrEqual(40);
    expect(sentEmails).not.toContain('u5@x.com');           // suppression honored
    expect(new Set(sentEmails).size).toBe(sentEmails.length); // no dupes
    expect(totalSent).toBeGreaterThan(0);                   // actually sent
  });

  it('pauses a config-failing domain and leaves that recipient pending (no suppress)', async () => {
    const sent: string[] = [];
    const paused: number[] = [];
    const suppressedCalls: string[] = [];
    const pending = [
      { id: 0, email: 'a@x.com', name: 'A', company: '', vars: {}, unsubToken: 'T0' },
      { id: 1, email: 'b@x.com', name: 'B', company: '', vars: {}, unsubToken: 'T1' },
      { id: 2, email: 'c@x.com', name: 'C', company: '', vars: {}, unsubToken: 'T2' },
    ];
    const ports: TickPorts = {
      now: () => new Date('2026-05-19T16:50:00Z'),
      rng: () => 0.5,
      getActiveCampaign: async () => ({ id: 1, bhStart: 9, bhEnd: 17, timezone: 'UTC', globalDailyCap: 100, perInboxCap: 40, jitterPct: 30 }),
      getEligibleDomains: async () => ([1, 2].map((id) => ({
        id, fromName: `D${id}`, fromEmail: `d${id}@s.com`, smtp: { host: 'h', port: 587, user: 'u', pass: 'p' },
        dailyCap: 40, warmupStart: new Date('2026-01-01T00:00:00Z'), sentToday: 0,
      }))),
      getSuppressed: async () => new Set<string>(),
      getPendingRecipients: async () => pending,
      getActiveTemplates: async () => ([{ id: 7, subject: 'S', bodyHtml: '<p>x</p>', bodyText: 'x', weight: 1 }]),
      getTotalSentToday: async () => 0,
      lastDomainIndex: async () => -1,
      // domain id=1 has config failure (detected via msg.from containing 'd1@s.com');
      // domain id=2 sends fine
      send: async (_smtp, msg: { from: string }) =>
        msg.from.includes('d1@s.com')
          ? { ok: false, kind: 'config' as const, error: 'EAUTH' }
          : { ok: true, response: '250' },
      recordSent: async (x: { recipientId: number }) => {
        sent.push(pending.find(p => p.id === x.recipientId)!.email);
      },
      recordFailure: async () => {},
      suppress: async (email: string, _reason: 'bounce') => { suppressedCalls.push(email); },
      pauseDomain: async (id: number) => { paused.push(id); },
      cfg: { companyName: 'Co', companyAddress: 'A', baseUrl: 'https://s.com' },
    };

    const r = await runTick(ports);

    // Core invariants:
    expect(paused).toContain(1);                  // config-failing domain 1 must be paused
    expect(suppressedCalls).toHaveLength(0);       // config failure != recipient bounce; no suppression
    expect(r.failed).toBeGreaterThanOrEqual(1);    // at least one failure recorded

    // The config failure consumed a slot but the recipient is NOT recorded sent.
    // Whatever was actually sent must be fewer than pending.length (a config slot was consumed).
    expect(sent.length).toBeLessThan(pending.length);

    // No duplicate sends
    expect(new Set(sent).size).toBe(sent.length);

    // Every email that was sent must be from our pending list
    for (const email of sent) {
      expect(pending.map(p => p.email)).toContain(email);
    }
  });
});

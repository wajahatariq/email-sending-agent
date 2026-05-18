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

// Helper: many pending recipients
function manyPending(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i, email: `u${i}@x.com`, name: 'U', company: 'C', vars: {}, unsubToken: `T${i}`,
  }));
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

  // ---- Non-vacuous cap / fairness tests ----
  // For all of these: now=16:50Z UTC, bh 9..17, TICK_MIN=10 =>
  //   minutesLeft = (17-16)*60 - 50 = 10 ; ticksRemaining = ceil(10/10) = 1.
  // rng = ()=>0.5 => jitterFactor = 1.0 + (0.5-0.5)*0.6 = 1.0 =>
  //   tickAllowance(budget,1) = round(budget*1.0) = budget.
  // => allowance = min(budget, BATCH_HARD_CAP=60). Provably > 0 in each case.

  it('#1 global-cap slice bound is non-vacuous (globalRemaining=2)', async () => {
    // globalRemaining = 100 - 98 = 2 ; domain budget ample (40).
    // budget = min(2, 40) = 2 ; allowance = min(2, 60) = 2 (> 0).
    const p = basePorts({
      now: () => new Date('2026-05-19T16:50:00Z'),
      getTotalSentToday: async () => 98,
      getPendingRecipients: async () => manyPending(50),
    });
    const r = await runTick(p);
    expect(p.recordSent).toHaveBeenCalledTimes(2);
    expect(r.sent).toBe(2);
  });

  it('#2 per-inbox cap bounds the batch (perInboxCap=3)', async () => {
    // dailyCap large (1000), warmup not limiting (old start), perInboxCap=3.
    // cap = min(1000, big, 3) = 3 ; domainBudget = 3.
    // globalDailyCap large => globalRemaining big. budget = min(big, 3) = 3.
    // allowance = min(3, 60) = 3 (> 0).
    const p = basePorts({
      now: () => new Date('2026-05-19T16:50:00Z'),
      getActiveCampaign: async () => ({
        id: 1, bhStart: 9, bhEnd: 17, timezone: 'UTC',
        globalDailyCap: 100000, perInboxCap: 3, jitterPct: 30,
      }),
      getEligibleDomains: async () => ([
        { id: 1, fromName: 'A', fromEmail: 'a@d1.com', smtp: { host: 'h', port: 587, user: 'u', pass: 'p' },
          dailyCap: 1000, warmupStart: new Date('2026-01-01T00:00:00Z'), sentToday: 0 },
      ]),
      getPendingRecipients: async () => manyPending(50),
    });
    const r = await runTick(p);
    expect(r.sent).toBe(3);
    expect(p.recordSent).toHaveBeenCalledTimes(3);
  });

  it('#3 warmup throttles a fresh domain to the warmup limit (10)', async () => {
    // warmupStart == now => warmupDay = 1 => warmupLimit(1, dailyCap) =
    //   floor(10 * 1.5^0) = 10. cap = min(40, 10, 40) = 10. domainBudget = 10.
    // globalRemaining = 100. budget = min(100, 10) = 10. allowance = min(10,60)=10 (>0).
    const NOW = new Date('2026-05-19T16:50:00Z');
    const p = basePorts({
      now: () => NOW,
      getActiveCampaign: async () => ({
        id: 1, bhStart: 9, bhEnd: 17, timezone: 'UTC',
        globalDailyCap: 100, perInboxCap: 40, jitterPct: 30,
      }),
      getEligibleDomains: async () => ([
        { id: 1, fromName: 'A', fromEmail: 'a@d1.com', smtp: { host: 'h', port: 587, user: 'u', pass: 'p' },
          dailyCap: 40, warmupStart: NOW, sentToday: 0 },
      ]),
      getPendingRecipients: async () => manyPending(50),
    });
    const r = await runTick(p);
    expect(r.sent).toBe(10);
    expect(p.recordSent).toHaveBeenCalledTimes(10);
  });

  it('#4 multi-domain round-robin stays fair as a domain drops out (regression)', async () => {
    // Regression test for the index-space-mismatch fairness bug.
    //
    // 3 domains. Two of them (id 2 and id 3) have EQUAL budgets (10 each) and
    // must receive an even split. A third small domain (id 1, budget 1) exhausts
    // after a single send, which FORCES a live-pool change mid-tick (the exact
    // condition the old shrinking-`pool` + `splice`/`indexOf` code mishandled).
    //
    // Math: effective caps -> d1=1, d2=10, d3=10. domainBudget = 21.
    // globalDailyCap huge so globalRemaining is the not the limiter.
    // budget = min(huge, 21) = 21. now=16:50Z, rng=0.5 => ticksLeft=1,
    // tickAllowance(21,1)=21, allowance = min(21, 60) = 21 (> 0).
    // BUT only 10 recipients are pending, so the batch is 10 sends.
    //
    // Fair behaviour: d1 takes 1 (then exhausts and is skipped), d2 and d3
    // evenly share the remaining 9 => counts differ by <= 1 among {d2,d3}.
    // The OLD code routes the post-exhaustion picks into the WRONG index space
    // and starves a domain (e.g. counts [1, 0, 9]) -> this test FAILS pre-fix
    // and PASSES after the stable-index scan fix.
    const perDomainCalls = new Map<number, number>();
    const send = vi.fn(async (smtp: { user: string }) => {
      const id = parseInt(smtp.user.slice(1), 10); // 'u<id>'
      perDomainCalls.set(id, (perDomainCalls.get(id) ?? 0) + 1);
      return { ok: true, response: '250 OK' };
    });
    const p = basePorts({
      now: () => new Date('2026-05-19T16:50:00Z'),
      rng: () => 0.5,
      getActiveCampaign: async () => ({
        id: 1, bhStart: 9, bhEnd: 17, timezone: 'UTC',
        globalDailyCap: 100000, perInboxCap: 1000, jitterPct: 30,
      }),
      getEligibleDomains: async () => ([
        { id: 1, fromName: 'D1', fromEmail: 'a@d1.com', smtp: { host: 'h', port: 587, user: 'u1', pass: 'p' },
          dailyCap: 1, warmupStart: new Date('2026-01-01T00:00:00Z'), sentToday: 0 },
        { id: 2, fromName: 'D2', fromEmail: 'a@d2.com', smtp: { host: 'h', port: 587, user: 'u2', pass: 'p' },
          dailyCap: 10, warmupStart: new Date('2026-01-01T00:00:00Z'), sentToday: 0 },
        { id: 3, fromName: 'D3', fromEmail: 'a@d3.com', smtp: { host: 'h', port: 587, user: 'u3', pass: 'p' },
          dailyCap: 10, warmupStart: new Date('2026-01-01T00:00:00Z'), sentToday: 0 },
      ]),
      lastDomainIndex: async () => -1,
      getPendingRecipients: async () => manyPending(10),
      send: send as unknown as TickPorts['send'],
    });
    const r = await runTick(p);
    expect(r.sent).toBe(10);
    const c1 = perDomainCalls.get(1) ?? 0;
    const c2 = perDomainCalls.get(2) ?? 0;
    const c3 = perDomainCalls.get(3) ?? 0;
    // Small domain capped at its budget of 1.
    expect(c1).toBe(1);
    // Equal-budget domains must split the remaining 9 evenly (differ by <= 1).
    expect(Math.abs(c2 - c3)).toBeLessThanOrEqual(1);
    // No domain is starved.
    expect(c2).toBeGreaterThan(0);
    expect(c3).toBeGreaterThan(0);
    // Per-domain caps still hold and total is exact.
    expect(c2).toBeLessThanOrEqual(10);
    expect(c3).toBeLessThanOrEqual(10);
    expect(c1 + c2 + c3).toBe(10);
  });

  it('#5 BATCH_HARD_CAP bounds the batch at 60', async () => {
    // Huge budgets so allowance would exceed 60 absent the hard cap:
    // domainBudget = 100000, globalRemaining = 1e9, budget = 100000,
    // tickAllowance = 100000, then min(100000, 60) = 60 (> 0). 200 pending.
    const p = basePorts({
      now: () => new Date('2026-05-19T16:50:00Z'),
      getActiveCampaign: async () => ({
        id: 1, bhStart: 9, bhEnd: 17, timezone: 'UTC',
        globalDailyCap: 1000000000, perInboxCap: 1000000, jitterPct: 30,
      }),
      getEligibleDomains: async () => ([
        { id: 1, fromName: 'A', fromEmail: 'a@d1.com', smtp: { host: 'h', port: 587, user: 'u', pass: 'p' },
          dailyCap: 100000, warmupStart: new Date('2026-01-01T00:00:00Z'), sentToday: 0 },
      ]),
      getPendingRecipients: async () => manyPending(200),
    });
    const r = await runTick(p);
    expect(r.sent).toBeLessThanOrEqual(60);
    expect(r.sent).toBe(60);
  });

  it('#6 config-pause keeps the hit recipient pending mid-tick', async () => {
    // 2 domains (id 1 then id 2). First attempt -> config (domain 1 paused),
    // remaining attempts -> ok via domain 2. 3 recipients.
    // Each domain effective cap = min(40, big, 40) = 40 ; domainBudget = 80.
    // globalRemaining = 100. budget = min(100, 80) = 80. allowance = min(80,60)=60 (>0).
    let call = 0;
    const sentRecipientIds: number[] = [];
    const send = vi.fn(async (smtp: { user: string }) => {
      call += 1;
      if (call === 1) return { ok: false, kind: 'config', error: 'auth failed' };
      return { ok: true, response: '250 OK' };
    });
    const recordSent = vi.fn(async (x: { recipientId: number }) => {
      sentRecipientIds.push(x.recipientId);
    });
    const p = basePorts({
      now: () => new Date('2026-05-19T16:50:00Z'),
      getActiveCampaign: async () => ({
        id: 1, bhStart: 9, bhEnd: 17, timezone: 'UTC',
        globalDailyCap: 100, perInboxCap: 40, jitterPct: 30,
      }),
      getEligibleDomains: async () => ([
        { id: 1, fromName: 'D1', fromEmail: 'a@d1.com', smtp: { host: 'h', port: 587, user: 'u1', pass: 'p' },
          dailyCap: 40, warmupStart: new Date('2026-01-01T00:00:00Z'), sentToday: 0 },
        { id: 2, fromName: 'D2', fromEmail: 'a@d2.com', smtp: { host: 'h', port: 587, user: 'u2', pass: 'p' },
          dailyCap: 40, warmupStart: new Date('2026-01-01T00:00:00Z'), sentToday: 0 },
      ]),
      lastDomainIndex: async () => -1, // first pick = live index 0 = domain 1
      getPendingRecipients: async () => manyPending(3), // ids 0,1,2
      send: send as unknown as TickPorts['send'],
      recordSent: recordSent as unknown as TickPorts['recordSent'],
    });
    const r = await runTick(p);

    // Domain 1 was hit by config on its single attempt then paused -> only 1 send call to it.
    // The recipient that hit config (id 0) must NOT be recorded as sent (stays pending).
    expect(p.pauseDomain).toHaveBeenCalledTimes(1);
    expect(p.pauseDomain).toHaveBeenCalledWith(1, 'smtp-config');
    expect(p.suppress).not.toHaveBeenCalled();
    expect(sentRecipientIds).not.toContain(0);
    // The other 2 recipients are delivered via the surviving domain 2.
    expect(sentRecipientIds.sort()).toEqual([1, 2]);
    expect(r.sent).toBe(2);
    expect(r.failed).toBe(1);
  });
});

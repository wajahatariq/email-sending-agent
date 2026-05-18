import { ticksRemaining, tickAllowance } from './allowance';
import { warmupDay, warmupLimit } from './warmup';
import { weightedPick } from './rotation';
import { partitionSuppressed } from './suppression';
import { renderEmail } from './template';

const TICK_MIN = 10;
const BATCH_HARD_CAP = 60;

export interface TickPorts {
  now: () => Date;
  rng: () => number;
  getActiveCampaign: () => Promise<null | { id: number; bhStart: number; bhEnd: number; timezone: string; globalDailyCap: number; perInboxCap: number; jitterPct: number; }>;
  getEligibleDomains: () => Promise<Array<{ id: number; fromName: string; fromEmail: string; smtp: { host: string; port: number; user: string; pass: string }; dailyCap: number; warmupStart: Date; sentToday: number; }>>;
  getSuppressed: () => Promise<Set<string>>;
  getPendingRecipients: (limit: number) => Promise<Array<{ id: number; email: string; name: string; company: string; vars: Record<string, string>; unsubToken: string; }>>;
  getActiveTemplates: () => Promise<Array<{ id: number; subject: string; bodyHtml: string; bodyText: string; weight: number; }>>;
  getTotalSentToday: () => Promise<number>;
  lastDomainIndex: () => Promise<number>;
  send: (domainSmtp: { host: string; port: number; user: string; pass: string }, msg: { from: string; to: string; subject: string; html: string; text: string; headers: Record<string, string> }) => Promise<{ ok: boolean; response?: string; kind?: 'soft' | 'hard' | 'config'; error?: string }>;
  recordSent: (x: { recipientId: number; domainId: number; templateId: number; response?: string }) => Promise<void>;
  recordFailure: (x: { recipientId: number; domainId: number; kind: 'soft' | 'hard' | 'config'; error?: string }) => Promise<void>;
  suppress: (email: string, reason: 'bounce') => Promise<void>;
  pauseDomain: (domainId: number, reason: string) => Promise<void>;
  cfg: { companyName: string; companyAddress: string; baseUrl: string };
}

export interface TickResult { sent: number; failed: number; skipped?: string; }

type Domain = Awaited<ReturnType<TickPorts['getEligibleDomains']>>[number];

interface LiveDomain {
  domain: Domain;
  remaining: number; // remaining budget for THIS tick (never below 0)
  paused: boolean; // set true if this domain hits an SMTP-config failure
}

export async function runTick(ports: TickPorts): Promise<TickResult> {
  const campaign = await ports.getActiveCampaign();
  if (!campaign) return { sent: 0, failed: 0, skipped: 'no-active-campaign' };

  const now = ports.now();

  const ticksLeft = ticksRemaining(
    now, campaign.bhStart, campaign.bhEnd, TICK_MIN, campaign.timezone,
  );
  if (ticksLeft <= 0) return { sent: 0, failed: 0, skipped: 'outside-window' };

  const totalSent = await ports.getTotalSentToday();
  const globalRemaining = campaign.globalDailyCap - totalSent;
  if (globalRemaining <= 0) return { sent: 0, failed: 0, skipped: 'global-cap-reached' };

  const domains = await ports.getEligibleDomains();
  if (domains.length === 0) return { sent: 0, failed: 0, skipped: 'no-eligible-domains' };

  // Per-domain effective cap = min(dailyCap, warmupLimit, perInboxCap);
  // remaining = max(0, cap - sentToday).
  const live: LiveDomain[] = [];
  let domainBudget = 0;
  for (const domain of domains) {
    const wDay = warmupDay(domain.warmupStart, now);
    const cap = Math.min(
      domain.dailyCap,
      warmupLimit(wDay, domain.dailyCap),
      campaign.perInboxCap,
    );
    const remaining = Math.max(0, cap - domain.sentToday);
    domainBudget += remaining;
    if (remaining > 0) live.push({ domain, remaining, paused: false });
  }
  if (domainBudget <= 0) return { sent: 0, failed: 0, skipped: 'domain-caps-reached' };

  const budget = Math.min(globalRemaining, domainBudget);
  const allowance = Math.min(
    tickAllowance(budget, ticksLeft, ports.rng),
    BATCH_HARD_CAP,
  );
  if (allowance <= 0) return { sent: 0, failed: 0, skipped: 'no-allowance-this-tick' };

  const templates = await ports.getActiveTemplates();
  if (templates.length === 0) return { sent: 0, failed: 0, skipped: 'no-active-templates' };

  const suppressed = await ports.getSuppressed();
  // Over-fetch so suppressed entries don't starve the batch.
  const pending = await ports.getPendingRecipients(allowance * 2);
  const { sendable } = partitionSuppressed(pending, suppressed);
  if (sendable.length === 0) return { sent: 0, failed: 0, skipped: 'no-sendable-recipients' };

  let lastIdx = await ports.lastDomainIndex();
  let sent = 0;
  let failed = 0;

  // Hard bound: never iterate past `allowance` send attempts overall, and
  // never let a domain exceed its computed per-tick remaining cap.
  const batch = sendable.slice(0, allowance);
  for (const r of batch) {
    // Round-robin domain selection over a STABLE index space.
    //
    // `live` is never mutated (no splice) for the whole tick, so its indices
    // are a fixed coordinate system. The cursor (`lastIdx`) advances over
    // that same stable array and simply SKIPS entries that are exhausted
    // (remaining <= 0) or config-paused. Because both the cursor and the
    // eligibility test share one index space, distribution stays fair as
    // domains drop out of contention — fixing the prior index-space mismatch
    // where the cursor tracked `live` but selection ran over a shrinking
    // filtered/spliced copy (which starved domains and burst-sent).
    //
    // rotation.roundRobin is intentionally NOT used here: it always returns
    // the next slot unconditionally and cannot express "skip while scanning
    // until an eligible entry is found", so the scan is implemented inline.
    let chosenIdx = -1;
    for (let step = 1; step <= live.length; step++) {
      const idx = (lastIdx + step) % live.length;
      const cand = live[idx];
      if (cand.remaining > 0 && !cand.paused) {
        chosenIdx = idx;
        break;
      }
    }
    if (chosenIdx < 0) break; // no domain can take this (or any further) recipient
    const choice = live[chosenIdx];
    lastIdx = chosenIdx;

    // Global cap is also enforced structurally: total successful sends can
    // never exceed `allowance`, and `allowance <= globalRemaining`.
    const tmpl = weightedPick(templates, ports.rng);
    const rendered = renderEmail(
      { subject: tmpl.subject, bodyHtml: tmpl.bodyHtml, bodyText: tmpl.bodyText },
      { email: r.email, name: r.name, company: r.company, vars: r.vars },
      r.unsubToken,
      ports.cfg,
    );

    const fromHeader = `${choice.domain.fromName} <${choice.domain.fromEmail}>`;
    const res = await ports.send(choice.domain.smtp, {
      from: fromHeader,
      to: r.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
    });

    if (res.ok) {
      await ports.recordSent({
        recipientId: r.id,
        domainId: choice.domain.id,
        templateId: tmpl.id,
        response: res.response,
      });
      choice.remaining -= 1; // consume one unit of this domain's per-tick cap
      sent += 1;
      continue;
    }

    if (res.kind === 'config') {
      // The SMTP DOMAIN is broken (bad creds/config), NOT the recipient.
      // Pause the domain and leave the recipient PENDING with NO attempts++
      // and NO suppression so it retries via a healthy domain later.
      choice.paused = true;
      await ports.pauseDomain(choice.domain.id, 'smtp-config');
      await ports.recordFailure({
        recipientId: r.id,
        domainId: choice.domain.id,
        kind: 'config',
        error: res.error,
      });
      failed += 1;
      // Do NOT splice and do NOT reset lastIdx: `live` stays a stable index
      // space and the `paused` flag makes the next scan skip this domain,
      // so rotation over the survivors remains correct and fair.
      continue;
    }

    if (res.kind === 'hard') {
      await ports.recordFailure({
        recipientId: r.id,
        domainId: choice.domain.id,
        kind: 'hard',
        error: res.error,
      });
      await ports.suppress(r.email, 'bounce');
      failed += 1;
      continue;
    }

    // soft (or undefined kind): transient, recipient stays pending for retry.
    await ports.recordFailure({
      recipientId: r.id,
      domainId: choice.domain.id,
      kind: res.kind ?? 'soft',
      error: res.error,
    });
    failed += 1;
  }

  return { sent, failed };
}

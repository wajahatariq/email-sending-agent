import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as s from '../db/schema';
import { decryptSecret } from './crypto';
import { makeTransport, sendOne } from './sender';
import type { TickPorts } from './tick';

/**
 * Documented/tested string form of the atomic counter upsert.
 *
 * This is the `$1,$2` placeholder shape PostgreSQL receives — it proves the
 * statement is PARAMETERIZED (the increment is `counters.sent_count + 1`, never
 * built from request-derived strings). The live execution below uses drizzle's
 * `sql` template with bound params so neon receives this exact statement with
 * `$1`/`$2` bound out-of-band (no manual `.replace('$1', value)` interpolation,
 * which is injection-shaped and was explicitly flagged).
 */
export function incrementCounterSql(): string {
  return 'insert into counters (domain_id, day, sent_count) values ($1, $2, 1) ' +
    'on conflict (domain_id, day) do update set sent_count = counters.sent_count + 1';
}

/** UTC date string (YYYY-MM-DD) for `counters.day` and "sent today" queries. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * Parameterized atomic counter upsert as a drizzle `sql` chunk.
 * `${domainId}` / `${day}` are BOUND params ($1/$2), not interpolated text.
 */
const counterUpsert = (domainId: number, day: string) =>
  sql`insert into counters (domain_id, day, sent_count) values (${domainId}, ${day}, 1) on conflict (domain_id, day) do update set sent_count = counters.sent_count + 1`;

export function buildPorts(): TickPorts {
  const db = getDb();
  const encKey = process.env.SMTP_ENC_KEY!;

  return {
    now: () => new Date(),
    rng: Math.random,

    getActiveCampaign: async () => {
      const rows = await db
        .select()
        .from(s.campaigns)
        .where(eq(s.campaigns.status, 'active'))
        .limit(1);
      const c = rows[0];
      return c
        ? {
            id: c.id,
            bhStart: c.bhStart,
            bhEnd: c.bhEnd,
            timezone: c.timezone,
            globalDailyCap: c.globalDailyCap,
            perInboxCap: c.perInboxCap,
            jitterPct: c.jitterPct,
          }
        : null;
    },

    getEligibleDomains: async () => {
      const ds = await db
        .select()
        .from(s.domains)
        .where(
          and(
            eq(s.domains.status, 'active'),
            eq(s.domains.spfVerified, true),
            eq(s.domains.dkimVerified, true),
            eq(s.domains.dmarcVerified, true),
          ),
        );
      const day = today();
      const out: Awaited<ReturnType<TickPorts['getEligibleDomains']>> = [];
      for (const d of ds) {
        const cnt = await db
          .select({ c: s.counters.sentCount })
          .from(s.counters)
          .where(and(eq(s.counters.domainId, d.id), eq(s.counters.day, day)));
        out.push({
          id: d.id,
          fromName: d.fromName,
          fromEmail: d.fromEmail,
          smtp: {
            host: d.smtpHost,
            port: d.smtpPort,
            user: d.smtpUser,
            pass: decryptSecret(d.smtpPassEnc, encKey),
          },
          dailyCap: d.dailyCap,
          warmupStart: new Date(d.warmupStartDate),
          sentToday: cnt[0]?.c ?? 0,
        });
      }
      return out;
    },

    getSuppressed: async () => {
      const rows = await db
        .select({ email: s.suppression.email })
        .from(s.suppression);
      return new Set(rows.map((r) => r.email.toLowerCase()));
    },

    getPendingRecipients: async (limit) => {
      const camp = await db
        .select()
        .from(s.campaigns)
        .where(eq(s.campaigns.status, 'active'))
        .limit(1);
      if (!camp[0]) return [];
      const rows = await db
        .select()
        .from(s.recipients)
        .where(
          and(
            eq(s.recipients.campaignId, camp[0].id),
            eq(s.recipients.status, 'pending'),
          ),
        )
        .limit(limit);
      return rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        company: r.company,
        vars: r.vars,
        unsubToken: r.unsubToken,
      }));
    },

    getActiveTemplates: async () => {
      const rows = await db
        .select()
        .from(s.templates)
        .where(eq(s.templates.active, true));
      return rows.map((t) => ({
        id: t.id,
        subject: t.subject,
        bodyHtml: t.bodyHtml,
        bodyText: t.bodyText,
        weight: t.weight,
      }));
    },

    getTotalSentToday: async () => {
      const rows = await db
        .select({ c: s.counters.sentCount })
        .from(s.counters)
        .where(eq(s.counters.day, today()));
      return rows.reduce((a, r) => a + r.c, 0);
    },

    lastDomainIndex: async () => -1,

    send: async (smtp, msg) => {
      const r = await sendOne(makeTransport(smtp), msg);
      return r.ok
        ? { ok: true, response: r.response }
        : { ok: false, kind: r.kind, error: r.error };
    },

    recordSent: async (x) => {
      // neon-http has no interactive transactions; db.batch() runs all
      // statements in ONE server-side transaction (atomic). Counter upsert is
      // last so a partial failure cannot over-count vs. recipient/log.
      await db.batch([
        db
          .update(s.recipients)
          .set({
            status: 'sent',
            sentAt: new Date(),
            assignedDomainId: x.domainId,
            templateId: x.templateId,
          })
          .where(eq(s.recipients.id, x.recipientId)),
        db.insert(s.sendLog).values({
          recipientId: x.recipientId,
          domainId: x.domainId,
          templateId: x.templateId,
          smtpResponse: x.response ?? null,
          status: 'sent',
        }),
        db.execute(counterUpsert(x.domainId, today())),
      ]);
    },

    recordFailure: async (x) => {
      if (x.kind === 'config') {
        // Domain/cred problem, NOT the recipient: do NOT touch
        // recipient.status/attempts (stays pending, no penalty). Audit only.
        await db.insert(s.sendLog).values({
          recipientId: x.recipientId,
          domainId: x.domainId,
          smtpResponse: x.error ?? null,
          status: 'fail-config',
        });
        return;
      }

      if (x.kind === 'hard') {
        await db.batch([
          db
            .update(s.recipients)
            .set({
              status: 'failed',
              attempts: sql`${s.recipients.attempts} + 1`,
              failReason: x.error ?? null,
            })
            .where(eq(s.recipients.id, x.recipientId)),
          db.insert(s.sendLog).values({
            recipientId: x.recipientId,
            domainId: x.domainId,
            smtpResponse: x.error ?? null,
            status: 'fail-hard',
          }),
        ]);
        return;
      }

      // soft: read-then-write (batch can't express interactive reads on
      // neon-http). After 3 attempts the recipient is permanently failed.
      const cur = await db
        .select({ attempts: s.recipients.attempts })
        .from(s.recipients)
        .where(eq(s.recipients.id, x.recipientId));
      const attempts2 = (cur[0]?.attempts ?? 0) + 1;
      const status = attempts2 >= 3 ? 'failed' : 'pending';
      await db.batch([
        db
          .update(s.recipients)
          .set({ status, attempts: attempts2, failReason: x.error ?? null })
          .where(eq(s.recipients.id, x.recipientId)),
        db.insert(s.sendLog).values({
          recipientId: x.recipientId,
          domainId: x.domainId,
          smtpResponse: x.error ?? null,
          status: 'fail-soft',
        }),
      ]);
    },

    suppress: async (email, reason) => {
      await db
        .insert(s.suppression)
        .values({ email: email.toLowerCase(), reason })
        .onConflictDoNothing();
    },

    pauseDomain: async (domainId, reason) => {
      // Idempotent: paused -> paused is fine. Audit row uses recipientId 0 as
      // a sentinel for a domain-level (non-recipient) event.
      await db.batch([
        db
          .update(s.domains)
          .set({ status: 'paused' })
          .where(eq(s.domains.id, domainId)),
        db.insert(s.sendLog).values({
          recipientId: 0,
          domainId,
          smtpResponse: reason,
          status: `paused:${reason}`,
        }),
      ]);
    },

    cfg: {
      companyName: process.env.COMPANY_NAME ?? 'Company',
      companyAddress: process.env.COMPANY_ADDRESS ?? '',
      baseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    },
  };
}

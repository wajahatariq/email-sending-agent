import { getMongoClient } from '../db/client';
import {
  brandsCol,
  campaignsCol,
  countersCol,
  domainsCol,
  recipientsCol,
  sendLogCol,
  suppressionCol,
  templatesCol,
  type SendLogDoc,
} from '../db/collections';
import { decryptSecret } from './crypto';
import { makeTransport, sendOne } from './sender';
import type { TickPorts } from './tick';

/** UTC date string (YYYY-MM-DD) for `counters.day` and "sent today" queries. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * PURE helper — the exact filter + update objects for the atomic counter upsert.
 *
 * The counter is the cap-enforcement primitive: it MUST be a single atomic
 * `$inc` upsert so concurrent ticks can never lose a write or over-count. This
 * helper is exported so chunk 4 can unit-test the shape without a live Mongo,
 * and `recordSent` calls it directly so the TESTED object IS the one executed.
 *
 * `_id` is `${domainId}:${day}` — unique per domain per UTC day. `$inc` creates
 * the field at 0 then adds 1 on insert; `$setOnInsert` stamps the immutable
 * coordinates only when the doc is first created.
 *
 * `brandId` is stamped on insert so the counter belongs to the brand that owns
 * the domain. The `_id` key stays `${domainId}:${day}` — a domain belongs to
 * exactly one brand so the key remains globally unique.
 */
export function counterUpsert(
  domainId: number,
  day: string,
  brandId: number,
): { filter: { _id: string }; update: object } {
  return {
    filter: { _id: `${domainId}:${day}` },
    update: {
      $inc: { sentCount: 1 },
      $setOnInsert: { domainId, day, brandId },
    },
  };
}

/**
 * PURE helper — the aggregation-pipeline update for the soft-fail branch.
 *
 * A pipeline update lets a single atomic statement reference the pre-update
 * `attempts` value: it increments attempts by 1 and flips status to 'failed'
 * once the NEW attempts value (`$attempts + 1`) reaches 3, else keeps it
 * 'pending' for retry. No prior SELECT, so concurrent soft fails cannot race.
 */
export function softFailUpdatePipeline(error: string | null): object[] {
  return [
    {
      $set: {
        attempts: { $add: ['$attempts', 1] },
        failReason: error,
        status: {
          $cond: [
            { $gte: [{ $add: ['$attempts', 1] }, 3] },
            'failed',
            'pending',
          ],
        },
      },
    },
  ];
}

export async function buildPorts(brandId: number): Promise<TickPorts> {
  const encKey = process.env.SMTP_ENC_KEY!;
  // The CAN-SPAM footer identity (company name + postal address) is per-brand,
  // read from the brand document — never a global env var in multi-tenant mode.
  const brand = await (await brandsCol()).findOne({ id: brandId });

  return {
    now: () => new Date(),
    rng: Math.random,

    getActiveCampaign: async () => {
      const col = await campaignsCol();
      const c = await col.findOne({ status: 'active', brandId });
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
      // Scope to the active campaign's assigned domains when set. Empty/missing
      // domainIds = all brand domains (back-compat with campaigns created
      // before per-campaign domain assignment).
      const campCol = await campaignsCol();
      const camp = await campCol.findOne({ status: 'active', brandId });
      const [dCol, cCol] = await Promise.all([domainsCol(), countersCol()]);
      const filter: Record<string, unknown> = {
        status: 'active',
        spfVerified: true,
        dkimVerified: true,
        dmarcVerified: true,
        brandId,
      };
      if (camp?.domainIds && camp.domainIds.length > 0) {
        filter.id = { $in: camp.domainIds };
      }
      const ds = await dCol.find(filter).toArray();
      const day = today();
      const out: Awaited<ReturnType<TickPorts['getEligibleDomains']>> = [];
      for (const d of ds) {
        const cnt = await cCol.findOne({ _id: `${d.id}:${day}` });
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
          sentToday: cnt?.sentCount ?? 0,
        });
      }
      return out;
    },

    getSuppressed: async () => {
      const col = await suppressionCol();
      const rows = await col.find({}, { projection: { _id: 1 } }).toArray();
      // `_id` is the already-lowercased email; the suppression lib also
      // self-normalizes so this Set is the canonical lookup set.
      return new Set(rows.map((r) => r._id));
    },

    getPendingRecipients: async (limit) => {
      const campCol = await campaignsCol();
      const camp = await campCol.findOne({ status: 'active', brandId });
      if (!camp) return [];
      const rCol = await recipientsCol();
      const rows = await rCol
        .find({ campaignId: camp.id, status: 'pending' })
        .limit(limit)
        .toArray();
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
      // Scope to the active campaign's selected templates when set. If
      // templateIds is missing/empty, fall back to all active brand templates
      // (backward compat with campaigns created before per-campaign selection).
      const campCol = await campaignsCol();
      const camp = await campCol.findOne({ status: 'active', brandId });
      const col = await templatesCol();
      const filter: Record<string, unknown> = { active: true, brandId };
      if (camp?.templateIds && camp.templateIds.length > 0) {
        filter.id = { $in: camp.templateIds };
      }
      const rows = await col.find(filter).toArray();
      return rows.map((t) => ({
        id: t.id,
        subject: t.subject,
        bodyHtml: t.bodyHtml,
        bodyText: t.bodyText,
        weight: t.weight,
      }));
    },

    getTotalSentToday: async () => {
      const col = await countersCol();
      const rows = await col.find({ day: today(), brandId }).toArray();
      return rows.reduce((a, r) => a + r.sentCount, 0);
    },

    lastDomainIndex: async () => -1,

    send: async (smtp, msg) => {
      // sendOne already returns { ok, response } | { ok, kind, error } — the
      // exact shape the engine expects, so pass it straight through.
      return sendOne(makeTransport(smtp), msg);
    },

    recordSent: async (x) => {
      // ATOMIC across 3 writes via a multi-document transaction. Atlas (a
      // replica set, including M0) supports interactive transactions. The
      // counter upsert runs LAST so a partial failure cannot over-count the
      // cap relative to the recipient/send-log writes — and the whole thing
      // either commits or aborts as a unit.
      const client = await getMongoClient();
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const [rCol, lCol, cCol] = await Promise.all([
            recipientsCol(),
            sendLogCol(),
            countersCol(),
          ]);

          // 1. Mark the recipient as sent.
          await rCol.updateOne(
            { id: x.recipientId },
            {
              $set: {
                status: 'sent',
                sentAt: new Date(),
                assignedDomainId: x.domainId,
                templateId: x.templateId,
              },
            },
            { session },
          );

          // 2. Append the success audit row (stamped with brandId).
          const logRow: SendLogDoc = {
            brandId,
            recipientId: x.recipientId,
            domainId: x.domainId,
            templateId: x.templateId,
            smtpResponse: x.response ?? null,
            status: 'sent',
            ts: new Date(),
          };
          await lCol.insertOne(logRow, { session });

          // 3. Atomic counter upsert — LAST. `$inc` upsert is the single
          // cap-critical write; the helper object is the same one tested.
          const { filter, update } = counterUpsert(x.domainId, today(), brandId);
          await cCol.updateOne(filter, update, { upsert: true, session });
        });
      } finally {
        await session.endSession();
      }
    },

    recordFailure: async (x) => {
      if (x.kind === 'config') {
        // SMTP DOMAIN/cred problem, NOT the recipient. Audit ONLY — do not
        // touch recipient.status or recipient.attempts (it stays pending with
        // no penalty so a healthy domain retries it). The domain pause is
        // handled separately by `pauseDomain`. Single write, no transaction.
        const lCol = await sendLogCol();
        const logRow: SendLogDoc = {
          brandId,
          recipientId: x.recipientId,
          domainId: x.domainId,
          templateId: null,
          smtpResponse: x.error ?? null,
          status: 'fail-config',
          ts: new Date(),
        };
        await lCol.insertOne(logRow);
        return;
      }

      const client = await getMongoClient();
      const session = client.startSession();
      try {
        await session.withTransaction(async () => {
          const [rCol, lCol] = await Promise.all([
            recipientsCol(),
            sendLogCol(),
          ]);

          if (x.kind === 'hard') {
            // Permanent failure: mark failed + bump attempts.
            await rCol.updateOne(
              { id: x.recipientId },
              {
                $set: { status: 'failed', failReason: x.error ?? null },
                $inc: { attempts: 1 },
              },
              { session },
            );
            const hardRow: SendLogDoc = {
              brandId,
              recipientId: x.recipientId,
              domainId: x.domainId,
              templateId: null,
              smtpResponse: x.error ?? null,
              status: 'fail-hard',
              ts: new Date(),
            };
            await lCol.insertOne(hardRow, { session });
            return;
          }

          // soft (or undefined): single atomic pipeline update — increments
          // attempts and flips status to 'failed' only once the NEW attempts
          // value reaches 3, else keeps it 'pending' for retry.
          await rCol.updateOne(
            { id: x.recipientId },
            softFailUpdatePipeline(x.error ?? null),
            { session },
          );
          const softRow: SendLogDoc = {
            brandId,
            recipientId: x.recipientId,
            domainId: x.domainId,
            templateId: null,
            smtpResponse: x.error ?? null,
            status: 'fail-soft',
            ts: new Date(),
          };
          await lCol.insertOne(softRow, { session });
        });
      } finally {
        await session.endSession();
      }
    },

    suppress: async (email, reason) => {
      // Idempotent: `$setOnInsert` only writes reason/ts when the doc is first
      // created, so an existing suppression is never overwritten.
      const col = await suppressionCol();
      await col.updateOne(
        { _id: email.toLowerCase() },
        { $setOnInsert: { reason, ts: new Date() } },
        { upsert: true },
      );
    },

    pauseDomain: async (domainId, reason) => {
      // Idempotent: paused -> paused is fine. Audit row uses recipientId 0 as
      // a sentinel for a domain-level (non-recipient) event.
      const [dCol, lCol] = await Promise.all([domainsCol(), sendLogCol()]);
      await dCol.updateOne({ id: domainId }, { $set: { status: 'paused' } });
      const auditRow: SendLogDoc = {
        brandId,
        recipientId: 0,
        domainId,
        templateId: null,
        smtpResponse: reason,
        status: `paused:${reason}`,
        ts: new Date(),
      };
      await lCol.insertOne(auditRow);
    },

    cfg: {
      companyName: brand?.name ?? 'Company',
      companyAddress: brand?.companyAddress ?? '',
      baseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
    },
  };
}

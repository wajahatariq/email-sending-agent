import { domainsCol, recipientsCol, repliesCol } from '../db/collections';
import { decryptSecret } from './crypto';
import { fetchNewMessages } from './imap';
import type { PollPorts } from './pollReplies';

/**
 * Wire every `PollPorts` member to MongoDB and the IMAP helper.
 * All queries are intentionally simple — no transactions needed here:
 * the upsert dedup on (domainId, imapUid) is the only idempotency invariant.
 */
export function buildPollPorts(): PollPorts {
  const encKey = process.env.SMTP_ENC_KEY!;

  return {
    now: () => new Date(),

    getImapDomains: async () => {
      const col = await domainsCol();
      const docs = await col
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .find({ imapHost: { $exists: true, $nin: [null, ''] } } as any)
        .toArray();

      const out: Awaited<ReturnType<PollPorts['getImapDomains']>> = [];

      for (const d of docs) {
        // Skip domains missing any required IMAP field.
        if (
          !d.imapHost ||
          d.imapPort == null ||
          !d.imapUser ||
          !d.imapPassEnc
        ) {
          continue;
        }

        out.push({
          id: d.id,
          imap: {
            host: d.imapHost,
            port: d.imapPort,
            user: d.imapUser,
            pass: decryptSecret(d.imapPassEnc, encKey),
          },
          lastUid: d.lastUid ?? 0,
          uidValidity: d.uidValidity ?? null,
        });
      }

      return out;
    },

    fetchNew: (cfg, sinceUid) => fetchNewMessages(cfg, sinceUid),

    matchRecipient: async (email) => {
      if (!email) return null;
      const col = await recipientsCol();
      const doc = await col.findOne({ email: email.toLowerCase() });
      return doc?.id ?? null;
    },

    saveReply: async (r) => {
      const col = await repliesCol();
      // Idempotent upsert: dedup key is (domainId, imapUid).
      // $setOnInsert ensures a re-poll never overwrites an already-stored reply.
      await col.updateOne(
        { domainId: r.domainId, imapUid: r.imapUid },
        { $setOnInsert: { ...r } },
        { upsert: true },
      );
    },

    markReplied: async (recipientId, at) => {
      const col = await recipientsCol();
      await col.updateOne({ id: recipientId }, { $set: { repliedAt: at } });
    },

    updateDomainCursor: async (domainId, lastUid, uidValidity) => {
      const col = await domainsCol();
      await col.updateOne({ id: domainId }, { $set: { lastUid, uidValidity } });
    },
  };
}

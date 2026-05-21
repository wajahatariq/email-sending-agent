import type { ImapConfig } from './imap';

// ---------------------------------------------------------------------------
// Ports interface (DB/IMAP-decoupled for unit testing with fakes)
// ---------------------------------------------------------------------------

export interface PollPorts {
  now: () => Date;
  // IMAP-enabled sending accounts to poll. `lastUid` defaults 0 (never polled).
  getImapDomains: () => Promise<Array<{
    id: number;
    imap: ImapConfig;
    lastUid: number;
    uidValidity: number | null;
  }>>;
  // Connects IMAP, returns new messages (uid > sinceUid) + the mailbox uidValidity.
  fetchNew: (cfg: ImapConfig, sinceUid: number) => Promise<{
    uidValidity: number;
    messages: Array<{
      uid: number; fromEmail: string; fromName: string; subject: string;
      snippet: string; receivedAt: Date; messageId: string | null; inReplyTo: string | null;
    }>;
  }>;
  // Look up a campaign recipient by (lowercased) email. null if no match.
  matchRecipient: (email: string) => Promise<number | null>;
  // Idempotent upsert into the `replies` collection (dedup on domainId+imapUid).
  saveReply: (r: {
    domainId: number; recipientId: number | null; fromEmail: string; fromName: string;
    subject: string; snippet: string; receivedAt: Date; messageId: string | null;
    inReplyTo: string | null; imapUid: number; createdAt: Date;
  }) => Promise<void>;
  // Stamp recipient.repliedAt (idempotent).
  markReplied: (recipientId: number, at: Date) => Promise<void>;
  // Persist the per-account incremental-fetch cursor.
  updateDomainCursor: (domainId: number, lastUid: number, uidValidity: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface PollResult {
  domainsPolled: number;
  newReplies: number;
  matched: number;
  errors: Array<{ domainId: number; error: string }>;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Poll all IMAP-enabled sending accounts for new replies, persist each one,
 * and update per-account fetch cursors.
 *
 * Each domain is processed independently — a failure in one account does NOT
 * abort the others. Time is taken exclusively from `ports.now()` so the
 * function is fully deterministic and unit-testable with fakes.
 */
export async function pollReplies(ports: PollPorts): Promise<PollResult> {
  const domains = await ports.getImapDomains();

  if (domains.length === 0) {
    return { domainsPolled: 0, newReplies: 0, matched: 0, errors: [] };
  }

  let domainsPolled = 0;
  let newReplies = 0;
  let matched = 0;
  const errors: Array<{ domainId: number; error: string }> = [];

  for (const domain of domains) {
    try {
      // 1. Fetch messages newer than the last known UID.
      const res = await ports.fetchNew(domain.imap, domain.lastUid);

      // 2. Persist each message and track matches.
      for (const msg of res.messages) {
        const recipientId = await ports.matchRecipient(msg.fromEmail);

        await ports.saveReply({
          domainId: domain.id,
          recipientId,
          fromEmail: msg.fromEmail,
          fromName: msg.fromName,
          subject: msg.subject,
          snippet: msg.snippet,
          receivedAt: msg.receivedAt,
          messageId: msg.messageId,
          inReplyTo: msg.inReplyTo,
          imapUid: msg.uid,
          createdAt: ports.now(),
        });

        if (recipientId !== null) {
          await ports.markReplied(recipientId, ports.now());
          matched += 1;
        }

        newReplies += 1;
      }

      // 3. Advance the cursor: take max of prior lastUid and all fetched uids.
      //    If no messages arrived, keep domain.lastUid unchanged.
      const newLastUid =
        res.messages.length > 0
          ? Math.max(domain.lastUid, ...res.messages.map((m) => m.uid))
          : domain.lastUid;

      // 4. Persist cursor.
      await ports.updateDomainCursor(domain.id, newLastUid, res.uidValidity);

      domainsPolled += 1;
    } catch (err) {
      errors.push({
        domainId: domain.id,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue to the next domain — one bad account must not abort the others.
    }
  }

  return { domainsPolled, newReplies, matched, errors };
}

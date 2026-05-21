import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface RawReply {
  uid: number;
  fromEmail: string; // normalized lowercase
  fromName: string;
  subject: string;
  snippet: string; // plaintext, truncated
  receivedAt: Date;
  messageId: string | null;
  inReplyTo: string | null;
}

export interface FetchResult {
  uidValidity: number;
  messages: RawReply[]; // only messages with uid > sinceUid
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/**
 * Normalize an email address string.
 *
 * - If the string contains `<...>`, extract the address inside the angle
 *   brackets, trim it, and lowercase it.
 * - Otherwise, trim and lowercase the whole string.
 * - Returns `''` for empty / whitespace-only input.
 */
export function normalizeEmail(raw: string): string {
  if (!raw) return '';

  const openIdx = raw.indexOf('<');
  const closeIdx = raw.lastIndexOf('>');

  if (openIdx !== -1 && closeIdx > openIdx) {
    // Extract address inside angle brackets
    return raw.slice(openIdx + 1, closeIdx).trim().toLowerCase();
  }

  // No complete angle-bracket pair — use whole string
  const trimmed = raw.trim();
  return trimmed.toLowerCase();
}

/**
 * Extract a readable snippet from plain-text email content.
 *
 * - Handles empty / undefined input → returns `''`.
 * - Collapses 3+ consecutive newlines to exactly 2.
 * - Trims leading/trailing whitespace.
 * - Hard-cuts to `maxLen` characters and appends `'…'` if the text was longer.
 */
export function extractSnippet(text: string, maxLen = 4000): string {
  if (!text) return '';

  // Collapse 3+ consecutive newlines (including \r\n runs) to 2 newlines
  let result = text.replace(/(\r?\n){3,}/g, '\n\n');

  // Trim leading/trailing whitespace (including newlines)
  result = result.trim();

  // Hard-cut to maxLen
  if (result.length > maxLen) {
    result = result.slice(0, maxLen) + '…';
  }

  return result;
}

// ---------------------------------------------------------------------------
// IMAP network function
// ---------------------------------------------------------------------------

/**
 * Fetch new messages from an account's INBOX via IMAP.
 *
 * Returns only messages whose UID is strictly greater than `sinceUid`.
 * Connection / auth errors are allowed to propagate so the caller can
 * handle per-account failures without stopping the whole poll.
 */
export async function fetchNewMessages(
  cfg: ImapConfig,
  sinceUid: number,
): Promise<FetchResult> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 993 || cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });

  await client.connect();

  const lock = await client.getMailboxLock('INBOX');
  const messages: RawReply[] = [];
  let uidValidity = 0;

  try {
    // mailbox is a MailboxObject after the lock is acquired
    const mailbox = client.mailbox as import('imapflow').MailboxObject;
    uidValidity = Number(mailbox.uidValidity);

    // Fetch UID range sinceUid+1:*
    // IMAP quirk: if the range start exceeds the highest UID, the server still
    // returns the single highest message — we filter those out below.
    for await (const msg of client.fetch(
      `${sinceUid + 1}:*`,
      { uid: true, source: true },
      { uid: true },
    )) {
      // Skip messages that the server returned due to the X:* quirk
      if (msg.uid <= sinceUid) continue;

      const parsed = await simpleParser(msg.source as Buffer);

      const addr = parsed.from?.value?.[0];
      const fromEmail = normalizeEmail(addr?.address ?? '');
      const fromName = addr?.name ?? '';

      messages.push({
        uid: msg.uid,
        fromEmail,
        fromName,
        subject: parsed.subject ?? '',
        snippet: extractSnippet(parsed.text ?? ''),
        receivedAt: parsed.date ?? new Date(),
        messageId: parsed.messageId ?? null,
        inReplyTo: (parsed.inReplyTo as string | undefined) ?? null,
      });
    }
  } finally {
    lock.release();
    try {
      await client.logout();
    } catch {
      // Suppress logout errors so they don't mask the fetch results
    }
  }

  return { uidValidity, messages };
}

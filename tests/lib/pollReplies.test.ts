import { describe, it, expect, vi } from 'vitest';
import { pollReplies, type PollPorts } from '../../src/lib/pollReplies';
import type { ImapConfig } from '../../src/lib/imap';

// ---------------------------------------------------------------------------
// Shared fake data
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-05-22T10:00:00Z');

const IMAP_CFG: ImapConfig = { host: 'imap.example.com', port: 993, user: 'u', pass: 'p' };

function makeMsg(uid: number, fromEmail = 'sender@test.com', fromName = 'Sender') {
  return {
    uid,
    fromEmail,
    fromName,
    subject: `Subject ${uid}`,
    snippet: `Snippet ${uid}`,
    receivedAt: new Date('2026-05-22T09:00:00Z'),
    messageId: `<msg-${uid}@test.com>`,
    inReplyTo: null,
  };
}

// ---------------------------------------------------------------------------
// basePorts factory (mirroring tick.test.ts pattern)
// ---------------------------------------------------------------------------

function basePorts(over: Partial<PollPorts> = {}): PollPorts {
  return {
    now: () => FIXED_NOW,
    getImapDomains: async () => ([
      { id: 1, imap: IMAP_CFG, lastUid: 0, uidValidity: null },
    ]),
    fetchNew: vi.fn().mockResolvedValue({ uidValidity: 42, messages: [makeMsg(10)] }),
    matchRecipient: vi.fn().mockResolvedValue(null),
    saveReply: vi.fn().mockResolvedValue(undefined),
    markReplied: vi.fn().mockResolvedValue(undefined),
    updateDomainCursor: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('pollReplies', () => {
  // 1. No IMAP domains → result all zeros, no errors.
  it('returns all-zeros when there are no IMAP domains', async () => {
    const p = basePorts({ getImapDomains: async () => [] });
    const r = await pollReplies(p);
    expect(r).toEqual({ domainsPolled: 0, newReplies: 0, matched: 0, errors: [] });
    expect(p.fetchNew).not.toHaveBeenCalled();
  });

  // 2. Polls a domain, saves each fetched message, returns correct newReplies count.
  it('polls a domain and saves each fetched message, counting newReplies', async () => {
    const p = basePorts({
      fetchNew: vi.fn().mockResolvedValue({
        uidValidity: 42,
        messages: [makeMsg(10), makeMsg(11), makeMsg(12)],
      }),
    });
    const r = await pollReplies(p);
    expect(r.newReplies).toBe(3);
    expect(r.domainsPolled).toBe(1);
    expect(p.saveReply).toHaveBeenCalledTimes(3);
  });

  // 3. A message whose fromEmail matches a recipient → saveReply gets that recipientId,
  //    markReplied called once with it, matched incremented.
  it('matches a recipient and marks them replied', async () => {
    const p = basePorts({
      fetchNew: vi.fn().mockResolvedValue({
        uidValidity: 42,
        messages: [makeMsg(10, 'known@test.com')],
      }),
      matchRecipient: vi.fn().mockImplementation(async (email: string) =>
        email === 'known@test.com' ? 77 : null,
      ),
    });
    const r = await pollReplies(p);
    expect(r.matched).toBe(1);
    expect(p.saveReply).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 77 }),
    );
    expect(p.markReplied).toHaveBeenCalledOnce();
    expect(p.markReplied).toHaveBeenCalledWith(77, FIXED_NOW);
  });

  // 4. A message with no recipient match → saveReply gets recipientId: null,
  //    markReplied NOT called, still counted in newReplies.
  it('handles no-match messages: saves with null recipientId, does not call markReplied', async () => {
    const p = basePorts({
      matchRecipient: vi.fn().mockResolvedValue(null),
    });
    const r = await pollReplies(p);
    expect(r.newReplies).toBe(1);
    expect(r.matched).toBe(0);
    expect(p.saveReply).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: null }),
    );
    expect(p.markReplied).not.toHaveBeenCalled();
  });

  // 5. Cursor: updateDomainCursor called with max of prior lastUid and fetched uids,
  //    and the fetched uidValidity.
  it('updates cursor with max(lastUid, ...msg.uids) and uidValidity', async () => {
    const p = basePorts({
      getImapDomains: async () => ([
        { id: 1, imap: IMAP_CFG, lastUid: 5, uidValidity: null },
      ]),
      fetchNew: vi.fn().mockResolvedValue({
        uidValidity: 99,
        messages: [makeMsg(7), makeMsg(3), makeMsg(12)],
      }),
    });
    await pollReplies(p);
    expect(p.updateDomainCursor).toHaveBeenCalledWith(1, 12, 99);
  });

  it('cursor: max does not go below prior lastUid when new uids are all lower (edge case)', async () => {
    // prior lastUid=20, fetched uids are 7 and 12 (both < 20, pathological case)
    const p = basePorts({
      getImapDomains: async () => ([
        { id: 1, imap: IMAP_CFG, lastUid: 20, uidValidity: null },
      ]),
      fetchNew: vi.fn().mockResolvedValue({
        uidValidity: 55,
        messages: [makeMsg(7), makeMsg(12)],
      }),
    });
    await pollReplies(p);
    expect(p.updateDomainCursor).toHaveBeenCalledWith(1, 20, 55);
  });

  // 6. No new messages → cursor still updated (keeps old lastUid, stores uidValidity), newReplies 0.
  it('updates cursor even when there are no new messages', async () => {
    const p = basePorts({
      getImapDomains: async () => ([
        { id: 1, imap: IMAP_CFG, lastUid: 15, uidValidity: null },
      ]),
      fetchNew: vi.fn().mockResolvedValue({
        uidValidity: 77,
        messages: [],
      }),
    });
    const r = await pollReplies(p);
    expect(r.newReplies).toBe(0);
    expect(r.domainsPolled).toBe(1);
    expect(p.updateDomainCursor).toHaveBeenCalledWith(1, 15, 77);
    expect(p.saveReply).not.toHaveBeenCalled();
  });

  // 7. Multiple domains: one domain's fetchNew throws → that domain appears in errors,
  //    the OTHER domain is still fully polled. domainsPolled counts only the successful ones.
  it('isolates domain errors: failing domain goes in errors, other domain is still polled', async () => {
    const savedReplyDomainIds: number[] = [];
    const p = basePorts({
      getImapDomains: async () => ([
        { id: 1, imap: IMAP_CFG, lastUid: 0, uidValidity: null },
        { id: 2, imap: { ...IMAP_CFG, user: 'u2' }, lastUid: 0, uidValidity: null },
      ]),
      fetchNew: vi.fn().mockImplementation(
        async (cfg: ImapConfig, _sinceUid: number) => {
          if (cfg.user === 'u2') throw new Error('Connection refused');
          return { uidValidity: 42, messages: [makeMsg(10)] };
        },
      ),
      saveReply: vi.fn().mockImplementation(
        async (r: { domainId: number }) => { savedReplyDomainIds.push(r.domainId); },
      ),
    });
    const r = await pollReplies(p);
    expect(r.domainsPolled).toBe(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toEqual({ domainId: 2, error: 'Connection refused' });
    expect(r.newReplies).toBe(1);
    expect(savedReplyDomainIds).toEqual([1]);
    expect(p.updateDomainCursor).toHaveBeenCalledWith(1, 10, 42);
    expect(p.updateDomainCursor).toHaveBeenCalledTimes(1); // domain 2 never reached updateCursor
  });

  // 8. saveReply and markReplied receive createdAt/at from the injected now.
  it('passes ports.now() as createdAt to saveReply and as at to markReplied', async () => {
    const CUSTOM_NOW = new Date('2026-01-01T00:00:00Z');
    const p = basePorts({
      now: () => CUSTOM_NOW,
      fetchNew: vi.fn().mockResolvedValue({
        uidValidity: 42,
        messages: [makeMsg(10, 'known@test.com')],
      }),
      matchRecipient: vi.fn().mockResolvedValue(55),
    });
    await pollReplies(p);
    expect(p.saveReply).toHaveBeenCalledWith(
      expect.objectContaining({ createdAt: CUSTOM_NOW }),
    );
    expect(p.markReplied).toHaveBeenCalledWith(55, CUSTOM_NOW);
  });

  // Additional: saveReply receives all expected fields.
  it('passes all expected fields to saveReply', async () => {
    const msg = makeMsg(10, 'sender@foo.com', 'Foo Bar');
    const p = basePorts({
      fetchNew: vi.fn().mockResolvedValue({ uidValidity: 5, messages: [msg] }),
      matchRecipient: vi.fn().mockResolvedValue(null),
    });
    await pollReplies(p);
    expect(p.saveReply).toHaveBeenCalledWith({
      domainId: 1,
      recipientId: null,
      fromEmail: 'sender@foo.com',
      fromName: 'Foo Bar',
      subject: msg.subject,
      snippet: msg.snippet,
      receivedAt: msg.receivedAt,
      messageId: msg.messageId,
      inReplyTo: null,
      imapUid: 10,
      createdAt: FIXED_NOW,
    });
  });

  // Additional: domainsPolled is 0 when the single domain fails.
  it('domainsPolled is 0 when the only domain throws', async () => {
    const p = basePorts({
      fetchNew: vi.fn().mockRejectedValue(new Error('IMAP auth failed')),
    });
    const r = await pollReplies(p);
    expect(r.domainsPolled).toBe(0);
    expect(r.errors).toEqual([{ domainId: 1, error: 'IMAP auth failed' }]);
    expect(r.newReplies).toBe(0);
  });
});

import Link from 'next/link';
import { repliesCol, recipientsCol, domainsCol, campaignsCol } from '@/db/collections';
import { CheckRepliesButton } from './CheckRepliesButton';

export const dynamic = 'force-dynamic';

export default async function RepliesPage() {
  const replies = await (await repliesCol())
    .find({})
    .sort({ receivedAt: -1 })
    .limit(200)
    .toArray();

  // Resolve recipients for matched replies
  const matchedRecipientIds = [
    ...new Set(replies.map(r => r.recipientId).filter((id): id is number => id !== null)),
  ];
  const recipientDocs =
    matchedRecipientIds.length > 0
      ? await (await recipientsCol())
          .find({ id: { $in: matchedRecipientIds } })
          .toArray()
      : [];
  const recipientMap = new Map(recipientDocs.map(r => [r.id, r]));

  // Resolve campaign names
  const campaignIds = [...new Set(recipientDocs.map(r => r.campaignId))];
  const campaignDocs =
    campaignIds.length > 0
      ? await (await campaignsCol())
          .find({ id: { $in: campaignIds } })
          .toArray()
      : [];
  const campaignMap = new Map(campaignDocs.map(c => [c.id, c.name]));

  // Resolve sending account (domain fromEmail)
  const domainIds = [...new Set(replies.map(r => r.domainId))];
  const domainDocs =
    domainIds.length > 0
      ? await (await domainsCol())
          .find({ id: { $in: domainIds } })
          .toArray()
      : [];
  const domainMap = new Map(domainDocs.map(d => [d.id, d.fromEmail]));

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Replies</h1>
      <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <Link href="/">Campaigns</Link>
        <Link href="/domains">Domains</Link>
        <Link href="/templates">Templates</Link>
        <Link href="/upload">Upload</Link>
        <Link href="/log">Log</Link>
        <Link href="/replies">Replies</Link>
      </nav>

      <CheckRepliesButton />

      {replies.length === 0 ? (
        <p style={{ color: '#6b7280' }}>
          No replies yet. Replies are ingested when the poller runs (cron-job.org → /api/poll-replies) or when you click Check Replies Now.
        </p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
          <thead>
            <tr>
              {['Received', 'From', 'Subject', 'Snippet', 'Matched', 'Account'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', borderBottom: '2px solid #ccc', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {replies.map(r => {
              const recipient = r.recipientId !== null ? recipientMap.get(r.recipientId) : undefined;
              const campaignName = recipient ? campaignMap.get(recipient.campaignId) : undefined;
              const accountEmail = domainMap.get(r.domainId) ?? String(r.domainId);
              const snippet = r.snippet.length > 200 ? r.snippet.slice(0, 200) + '…' : r.snippet;

              return (
                <tr key={r._id?.toString()} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '0.4rem 0.6rem', whiteSpace: 'nowrap' }}>
                    {new Date(r.receivedAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem' }}>
                    {r.fromName && (
                      <span style={{ display: 'block', fontSize: '0.8rem', color: '#555' }}>{r.fromName}</span>
                    )}
                    {r.fromEmail}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.subject}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', maxWidth: '280px', color: '#374151' }}>
                    {snippet}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', whiteSpace: 'nowrap' }}>
                    {recipient ? (
                      <span>
                        <span style={{ display: 'block' }}>{recipient.email}</span>
                        {campaignName && (
                          <span style={{ fontSize: '0.8rem', color: '#555' }}>{campaignName}</span>
                        )}
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: '0.25rem',
                        background: '#fef3c7', color: '#92400e', fontStyle: 'italic', fontSize: '0.8rem',
                      }}>unmatched</span>
                    )}
                  </td>
                  <td style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', color: '#555' }}>
                    {accountEmail}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}

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
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Replies</h1>
          <p className="page-sub">Inbound replies matched against campaign recipients.</p>
        </div>
        <div className="page-actions">
          <CheckRepliesButton />
        </div>
      </div>

      {replies.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No replies yet</p>
          <p>Replies are ingested when you click Check Replies Now or when the IMAP poller runs.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Received</th>
                <th>From</th>
                <th>Subject</th>
                <th>Snippet</th>
                <th>Matched</th>
                <th>Account</th>
              </tr>
            </thead>
            <tbody>
              {replies.map(r => {
                const recipient = r.recipientId !== null ? recipientMap.get(r.recipientId) : undefined;
                const campaignName = recipient ? campaignMap.get(recipient.campaignId) : undefined;
                const accountEmail = domainMap.get(r.domainId) ?? String(r.domainId);
                const snippet = r.snippet.length > 200 ? r.snippet.slice(0, 200) + '…' : r.snippet;

                return (
                  <tr key={r._id?.toString()}>
                    <td><span className="cell-muted mono">{new Date(r.receivedAt).toLocaleString()}</span></td>
                    <td>
                      {r.fromName && (
                        <span className="cell-muted" style={{ display: 'block', fontSize: '0.8rem' }}>{r.fromName}</span>
                      )}
                      <span className="cell-strong">{r.fromEmail}</span>
                    </td>
                    <td><span className="cell-snippet">{r.subject}</span></td>
                    <td><span className="cell-snippet">{snippet}</span></td>
                    <td>
                      {recipient ? (
                        <span>
                          <span className="cell-strong" style={{ display: 'block' }}>{recipient.email}</span>
                          {campaignName && (
                            <span className="cell-muted">{campaignName}</span>
                          )}
                        </span>
                      ) : (
                        <span className="badge badge-warning">unmatched</span>
                      )}
                    </td>
                    <td><span className="cell-muted">{accountEmail}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

import { sendLogCol, countersCol } from '@/db/collections';

export const dynamic = 'force-dynamic';

export default async function LogPage() {
  const today = new Date().toISOString().slice(0, 10);

  const logs = await (await sendLogCol()).find({}).sort({ ts: -1 }).limit(200).toArray();
  const counters = await (await countersCol()).find({ day: today }).toArray();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Send Log</h1>
          <p className="page-sub">Last 200 send events and today&apos;s per-domain counters.</p>
        </div>
      </div>

      <div className="stack">
        <div>
          <p className="section-title">Today — per domain <span className="cell-muted" style={{ fontWeight: 400, fontSize: '0.8125rem' }}>({today})</span></p>
          {counters.length === 0 ? (
            <div className="empty">
              <p className="empty-title">No sends today</p>
              <p>Use Send Now on the Campaigns page to dispatch a batch.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Domain ID</th>
                    <th className="num">Sent Today</th>
                  </tr>
                </thead>
                <tbody>
                  {counters.map(c => (
                    <tr key={c.domainId}>
                      <td><span className="cell-strong">{c.domainId}</span></td>
                      <td className="num">{c.sentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <p className="section-title">Last 200 Send Events</p>
          {logs.length === 0 ? (
            <div className="empty">
              <p className="empty-title">No log entries yet</p>
              <p>Send events will appear here after the first batch is dispatched.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th className="num">Domain</th>
                    <th className="num">Recipient</th>
                    <th>SMTP Response</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(l => (
                    <tr key={l._id.toString()}>
                      <td><span className="cell-muted mono">{new Date(l.ts).toISOString().replace('T', ' ').slice(0, 19)}</span></td>
                      <td>
                        <span className={
                          l.status === 'sent' ? 'badge badge-success' :
                          l.status === 'failed' ? 'badge badge-danger' :
                          l.status === 'fail-soft' ? 'badge badge-warning' :
                          l.status === 'fail-hard' ? 'badge badge-danger' :
                          'badge'
                        }>
                          {l.status}
                        </span>
                      </td>
                      <td className="num">{l.domainId}</td>
                      <td className="num">{l.recipientId}</td>
                      <td>
                        <span className="cell-snippet mono">{l.smtpResponse ?? '—'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

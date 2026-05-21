import Link from 'next/link';
import { sendLogCol, countersCol } from '@/db/collections';

export const dynamic = 'force-dynamic';

export default async function LogPage() {
  const today = new Date().toISOString().slice(0, 10);

  const logs = await (await sendLogCol()).find({}).sort({ ts: -1 }).limit(200).toArray();
  const counters = await (await countersCol()).find({ day: today }).toArray();

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Send Log</h1>
      <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <Link href="/">Campaigns</Link>
        <Link href="/domains">Domains</Link>
        <Link href="/templates">Templates</Link>
        <Link href="/upload">Upload</Link>
        <Link href="/log">Log</Link>
        <Link href="/replies">Replies</Link>
      </nav>

      <h2>Today&apos;s Per-Domain Counters ({today})</h2>
      {counters.length === 0 ? (
        <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>No sends today.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', marginBottom: '1.5rem' }}>
          <thead>
            <tr>
              {['Domain ID', 'Sent Today'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.75rem', borderBottom: '2px solid #ccc' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {counters.map(c => (
              <tr key={c.domainId} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.4rem 0.75rem' }}>{c.domainId}</td>
                <td style={{ padding: '0.4rem 0.75rem' }}>{c.sentCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Last 200 Send Events</h2>
      {logs.length === 0 ? (
        <p style={{ color: '#6b7280' }}>No log entries yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.875rem' }}>
          <thead>
            <tr>
              {['Timestamp', 'Status', 'Domain ID', 'Recipient ID', 'SMTP Response'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', borderBottom: '2px solid #ccc', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l._id.toString()} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.4rem 0.6rem', whiteSpace: 'nowrap' }}>
                  {new Date(l.ts).toISOString().replace('T', ' ').slice(0, 19)}
                </td>
                <td style={{ padding: '0.4rem 0.6rem' }}>
                  <span style={{
                    display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: '0.25rem',
                    background: l.status === 'sent' ? '#d1fae5' : l.status === 'failed' ? '#fee2e2' : '#f3f4f6',
                    color: l.status === 'sent' ? '#065f46' : l.status === 'failed' ? '#991b1b' : '#374151',
                  }}>{l.status}</span>
                </td>
                <td style={{ padding: '0.4rem 0.6rem' }}>{l.domainId}</td>
                <td style={{ padding: '0.4rem 0.6rem' }}>{l.recipientId}</td>
                <td style={{ padding: '0.4rem 0.6rem', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.smtpResponse ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

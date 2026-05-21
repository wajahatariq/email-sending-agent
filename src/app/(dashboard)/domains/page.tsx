import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { domainsCol, nextId } from '@/db/collections';
import { encryptSecret } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

async function addDomain(formData: FormData) {
  'use server';
  const encKey = process.env.SMTP_ENC_KEY;
  if (!encKey) throw new Error('SMTP_ENC_KEY not set');
  const smtpPass = formData.get('smtpPass') as string;
  const smtpPassEnc = encryptSecret(smtpPass, encKey);
  const today = new Date().toISOString().slice(0, 10);
  const id = await nextId('domains');

  const imapHost = ((formData.get('imapHost') as string | null) ?? '').trim();
  const imapUser = ((formData.get('imapUser') as string | null) ?? '').trim();
  const imapPass = (formData.get('imapPass') as string | null) ?? '';
  // IMAP is configured only when host, user, AND password are all provided.
  // Partial input is ignored rather than throwing (encryptSecret rejects '').
  const imapFields =
    imapHost && imapUser && imapPass
      ? {
          imapHost,
          imapPort: Number(formData.get('imapPort') ?? 993),
          imapUser,
          imapPassEnc: encryptSecret(imapPass, encKey),
        }
      : {};

  await (await domainsCol()).insertOne({
    id,
    fromName: formData.get('fromName') as string,
    fromEmail: formData.get('fromEmail') as string,
    smtpHost: formData.get('smtpHost') as string,
    smtpPort: Number(formData.get('smtpPort')),
    smtpUser: formData.get('smtpUser') as string,
    smtpPassEnc,
    dailyCap: Number(formData.get('dailyCap') ?? 40),
    warmupStartDate: (formData.get('warmupStartDate') as string) || today,
    status: 'paused',
    spfVerified: formData.get('spfVerified') === 'on',
    dkimVerified: formData.get('dkimVerified') === 'on',
    dmarcVerified: formData.get('dmarcVerified') === 'on',
    ...imapFields,
  });
  revalidatePath('/domains');
}

async function toggleDomainStatus(formData: FormData) {
  'use server';
  const id = Number(formData.get('id'));
  const current = formData.get('current') as string;
  const next = current === 'active' ? 'paused' : 'active';
  await (await domainsCol()).updateOne({ id }, { $set: { status: next } });
  revalidatePath('/domains');
}

export default async function DomainsPage() {
  const domains = await (await domainsCol()).find({}).sort({ id: 1 }).toArray();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Domains</h1>
      <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <Link href="/">Campaigns</Link>
        <Link href="/domains">Domains</Link>
        <Link href="/templates">Templates</Link>
        <Link href="/upload">Upload</Link>
        <Link href="/log">Log</Link>
        <Link href="/replies">Replies</Link>
      </nav>

      <h2>Existing Domains</h2>
      {domains.length === 0 ? (
        <p>No domains yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '2rem' }}>
          <thead>
            <tr>
              {['ID', 'From Email', 'Status', 'Daily Cap', 'Warmup Start', 'SPF', 'DKIM', 'DMARC', 'SMTP Pass', 'IMAP', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.6rem', borderBottom: '2px solid #ccc', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {domains.map(d => (
              <tr key={d.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.4rem 0.6rem' }}>{d.id}</td>
                <td style={{ padding: '0.4rem 0.6rem' }}>
                  <span style={{ display: 'block', fontSize: '0.85rem', color: '#555' }}>{d.fromName}</span>
                  {d.fromEmail}
                </td>
                <td style={{ padding: '0.4rem 0.6rem' }}>
                  <span style={{
                    display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: '0.25rem',
                    background: d.status === 'active' ? '#d1fae5' : '#fef3c7',
                    color: d.status === 'active' ? '#065f46' : '#92400e',
                  }}>{d.status}</span>
                </td>
                <td style={{ padding: '0.4rem 0.6rem' }}>{d.dailyCap}</td>
                <td style={{ padding: '0.4rem 0.6rem' }}>{d.warmupStartDate}</td>
                <td style={{ padding: '0.4rem 0.6rem' }}>{d.spfVerified ? '✓' : '✗'}</td>
                <td style={{ padding: '0.4rem 0.6rem' }}>{d.dkimVerified ? '✓' : '✗'}</td>
                <td style={{ padding: '0.4rem 0.6rem' }}>{d.dmarcVerified ? '✓' : '✗'}</td>
                <td style={{ padding: '0.4rem 0.6rem' }}>
                  <span style={{ color: '#888', fontStyle: 'italic' }}>
                    {d.smtpPassEnc ? 'set' : 'unset'}
                  </span>
                </td>
                <td style={{ padding: '0.4rem 0.6rem' }}>
                  <span style={{ color: '#888', fontStyle: 'italic' }}>
                    {d.imapPassEnc ? 'set' : 'unset'}
                  </span>
                </td>
                <td style={{ padding: '0.4rem 0.6rem' }}>
                  <form action={toggleDomainStatus}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="current" value={d.status} />
                    <button type="submit"
                      style={{ padding: '0.2rem 0.6rem', cursor: 'pointer' }}>
                      {d.status === 'active' ? 'Pause' : 'Activate'}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Add Domain</h2>
      <form action={addDomain} style={{ display: 'grid', gap: '0.75rem', maxWidth: '500px' }}>
        <label>
          From Name
          <input type="text" name="fromName" required style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <label>
          From Email
          <input type="email" name="fromEmail" required style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <label>
          SMTP Host
          <input type="text" name="smtpHost" required style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <label>
          SMTP Port
          <input type="number" name="smtpPort" required defaultValue={587} style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <label>
          SMTP User
          <input type="text" name="smtpUser" required style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <label>
          SMTP Password
          <input type="password" name="smtpPass" required style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <label>
          Daily Cap
          <input type="number" name="dailyCap" defaultValue={40} style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <label>
          Warmup Start Date
          <input type="date" name="warmupStartDate" defaultValue={today} style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <fieldset style={{ border: '1px solid #ccc', padding: '0.5rem', borderRadius: '0.25rem' }}>
          <legend>DNS Verification</legend>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <input type="checkbox" name="spfVerified" /> SPF Verified
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
            <input type="checkbox" name="dkimVerified" /> DKIM Verified
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" name="dmarcVerified" /> DMARC Verified
          </label>
        </fieldset>
        <fieldset style={{ border: '1px solid #ccc', padding: '0.75rem', borderRadius: '0.25rem' }}>
          <legend>IMAP (for reply ingestion — optional)</legend>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
            Leave IMAP Host blank to skip reply polling for this domain.
          </p>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            IMAP Host
            <input type="text" name="imapHost" placeholder="imap.hostinger.com"
              style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            IMAP Port
            <input type="number" name="imapPort" placeholder="993" defaultValue={993}
              style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
          </label>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            IMAP User
            <input type="text" name="imapUser" placeholder="usually the full email address"
              style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
          </label>
          <label style={{ display: 'block' }}>
            IMAP Password
            <input type="password" name="imapPass"
              style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
          </label>
        </fieldset>
        <button type="submit" style={{ padding: '0.4rem 1rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.25rem' }}>
          Add Domain
        </button>
      </form>
    </main>
  );
}

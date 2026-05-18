import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { encryptSecret } from '@/lib/crypto';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

async function addDomain(formData: FormData) {
  'use server';
  const db = getDb();
  const smtpPass = formData.get('smtpPass') as string;
  const smtpPassEnc = encryptSecret(smtpPass, process.env.SMTP_ENC_KEY!);
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(s.domains).values({
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
  });
  revalidatePath('/domains');
}

async function toggleDomainStatus(formData: FormData) {
  'use server';
  const id = Number(formData.get('id'));
  const current = formData.get('current') as string;
  const next = current === 'active' ? 'paused' : 'active';
  const db = getDb();
  await db.update(s.domains).set({ status: next }).where(eq(s.domains.id, id));
  revalidatePath('/domains');
}

export default async function DomainsPage() {
  const db = getDb();
  const domains = await db.select().from(s.domains).orderBy(s.domains.id);
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
      </nav>

      <h2>Existing Domains</h2>
      {domains.length === 0 ? (
        <p>No domains yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '2rem' }}>
          <thead>
            <tr>
              {['ID', 'From Email', 'Status', 'Daily Cap', 'Warmup Start', 'SPF', 'DKIM', 'DMARC', 'SMTP Pass', 'Actions'].map(h => (
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
        <button type="submit" style={{ padding: '0.4rem 1rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.25rem' }}>
          Add Domain
        </button>
      </form>
    </main>
  );
}

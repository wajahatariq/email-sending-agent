import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { eq } from 'drizzle-orm';
import { SendNowButton } from './SendNowButton';

export const dynamic = 'force-dynamic';

async function setCampaignStatus(formData: FormData) {
  'use server';
  const id = Number(formData.get('id'));
  const status = formData.get('status') as string;
  const db = getDb();
  await db.update(s.campaigns).set({ status }).where(eq(s.campaigns.id, id));
  revalidatePath('/');
}

export default async function CampaignsPage() {
  const db = getDb();
  const campaigns = await db.select().from(s.campaigns).orderBy(s.campaigns.id);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Email Sending Agent — Campaigns</h1>
      <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <Link href="/">Campaigns</Link>
        <Link href="/domains">Domains</Link>
        <Link href="/templates">Templates</Link>
        <Link href="/upload">Upload</Link>
        <Link href="/log">Log</Link>
      </nav>

      <SendNowButton />

      {campaigns.length === 0 ? (
        <p>No campaigns yet. Use the <a href="/upload">Upload</a> page to create one.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['ID', 'Name', 'Status', 'Daily Cap', 'Created', 'Actions'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.75rem', borderBottom: '2px solid #ccc' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.4rem 0.75rem' }}>{c.id}</td>
                <td style={{ padding: '0.4rem 0.75rem' }}>{c.name}</td>
                <td style={{ padding: '0.4rem 0.75rem' }}>
                  <span style={{
                    display: 'inline-block', padding: '0.1rem 0.5rem', borderRadius: '0.25rem',
                    background: c.status === 'active' ? '#d1fae5' : c.status === 'paused' ? '#fef3c7' : '#f3f4f6',
                    color: c.status === 'active' ? '#065f46' : c.status === 'paused' ? '#92400e' : '#374151',
                  }}>{c.status}</span>
                </td>
                <td style={{ padding: '0.4rem 0.75rem' }}>{c.globalDailyCap}</td>
                <td style={{ padding: '0.4rem 0.75rem' }}>{new Date(c.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: '0.4rem 0.75rem', display: 'flex', gap: '0.5rem' }}>
                  <form action={setCampaignStatus}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value="active" />
                    <button type="submit" disabled={c.status === 'active'}
                      style={{ padding: '0.2rem 0.6rem', cursor: 'pointer', background: '#d1fae5', border: '1px solid #6ee7b7' }}>
                      Start
                    </button>
                  </form>
                  <form action={setCampaignStatus}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value="paused" />
                    <button type="submit" disabled={c.status === 'paused'}
                      style={{ padding: '0.2rem 0.6rem', cursor: 'pointer', background: '#fef3c7', border: '1px solid #fcd34d' }}>
                      Stop
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

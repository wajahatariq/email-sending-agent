import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { parseRecipientsCsv } from '@/lib/csv';
import { makeUnsubToken } from '@/lib/token';

export const dynamic = 'force-dynamic';

async function importCsv(formData: FormData): Promise<void> {
  'use server';
  const db = getDb();
  const csv = formData.get('csv') as string;
  const newCampaignName = (formData.get('newCampaignName') as string).trim();
  const selectedCampaignId = formData.get('campaignId') as string;

  const { valid } = parseRecipientsCsv(csv);

  let campaignId: number;
  if (newCampaignName) {
    const [inserted] = await db.insert(s.campaigns).values({
      name: newCampaignName,
      status: 'draft',
    }).returning({ id: s.campaigns.id });
    campaignId = inserted.id;
  } else {
    campaignId = Number(selectedCampaignId);
  }

  if (valid.length > 0) {
    const cronSecret = process.env.CRON_SECRET!;
    const rows = valid.map(r => ({
      campaignId,
      email: r.email,
      name: r.name,
      company: r.company,
      vars: r.vars,
      status: 'pending' as const,
      unsubToken: makeUnsubToken(r.email, cronSecret),
    }));

    // Batch insert in chunks of 500
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(s.recipients).values(rows.slice(i, i + CHUNK));
    }
  }

  revalidatePath('/upload');
}

export default async function UploadPage() {
  const db = getDb();
  const campaigns = await db.select({
    id: s.campaigns.id,
    name: s.campaigns.name,
    status: s.campaigns.status,
  }).from(s.campaigns).orderBy(s.campaigns.id);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Upload Recipients</h1>
      <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <Link href="/">Campaigns</Link>
        <Link href="/domains">Domains</Link>
        <Link href="/templates">Templates</Link>
        <Link href="/upload">Upload</Link>
        <Link href="/log">Log</Link>
      </nav>

      <form action={importCsv} style={{ display: 'grid', gap: '0.75rem', maxWidth: '600px' }}>
        <fieldset style={{ border: '1px solid #ccc', padding: '0.75rem', borderRadius: '0.25rem' }}>
          <legend>Campaign</legend>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Select existing campaign:
            <select name="campaignId" style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }}>
              <option value="">— none —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
              ))}
            </select>
          </label>
          <p style={{ margin: '0.4rem 0', color: '#6b7280', fontSize: '0.85rem' }}>or create new:</p>
          <label>
            New campaign name
            <input type="text" name="newCampaignName"
              style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }}
              placeholder="Leave blank to use selection above" />
          </label>
        </fieldset>

        <label>
          CSV Data (paste here — first row must be header with at least an <code>email</code> column)
          <textarea name="csv" rows={12} required
            placeholder={'email,name,company\njohn@example.com,John Doe,Acme Corp'}
            style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem', fontFamily: 'monospace', fontSize: '0.85rem' }} />
        </label>

        <button type="submit" style={{ padding: '0.4rem 1rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.25rem' }}>
          Import Recipients
        </button>
      </form>
    </main>
  );
}

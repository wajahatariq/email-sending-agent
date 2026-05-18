import Link from 'next/link';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import UploadForm from './UploadForm';

export const dynamic = 'force-dynamic';

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

      <UploadForm campaigns={campaigns} />
    </main>
  );
}

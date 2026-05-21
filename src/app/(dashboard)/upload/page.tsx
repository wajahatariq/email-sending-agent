import Link from 'next/link';
import { campaignsCol } from '@/db/collections';
import UploadForm from './UploadForm';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const allCampaigns = await (await campaignsCol()).find({}).sort({ id: 1 }).toArray();
  const campaigns = allCampaigns.map(c => ({ id: c.id, name: c.name, status: c.status }));

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

import Link from 'next/link';
import { campaignsCol } from '@/db/collections';
import { getSelectedBrandId } from '@/lib/brand';
import UploadForm from './UploadForm';

export const dynamic = 'force-dynamic';

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>;
}) {
  const brandId = await getSelectedBrandId();
  const sp = await searchParams;
  const preselect = sp.campaign ? Number(sp.campaign) : undefined;
  const preselectedCampaignId = Number.isFinite(preselect) ? (preselect as number) : undefined;

  if (brandId === null) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-title">Upload Recipients</h1>
            <p className="page-sub">Import a CSV list of recipients into a campaign.</p>
          </div>
        </div>
        <div className="empty">
          <p className="empty-title">No brand selected</p>
          <p>Create a brand first.</p>
          <Link href="/brands" className="btn btn-primary">Add a brand</Link>
        </div>
      </>
    );
  }

  const allCampaigns = await (await campaignsCol()).find({ brandId }).sort({ id: 1 }).toArray();
  const campaigns = allCampaigns.map(c => ({ id: c.id, name: c.name, status: c.status }));

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Upload Recipients</h1>
          <p className="page-sub">Import a CSV list of recipients into a campaign.</p>
        </div>
      </div>

      <div className="card">
        <UploadForm campaigns={campaigns} preselectedCampaignId={preselectedCampaignId} />
      </div>
    </>
  );
}

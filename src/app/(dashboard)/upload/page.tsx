import { campaignsCol } from '@/db/collections';
import UploadForm from './UploadForm';

export const dynamic = 'force-dynamic';

export default async function UploadPage() {
  const allCampaigns = await (await campaignsCol()).find({}).sort({ id: 1 }).toArray();
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
        <UploadForm campaigns={campaigns} />
      </div>
    </>
  );
}

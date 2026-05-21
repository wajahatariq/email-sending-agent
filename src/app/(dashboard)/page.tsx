import { revalidatePath } from 'next/cache';
import { campaignsCol } from '@/db/collections';
import { SendNowButton } from './SendNowButton';

export const dynamic = 'force-dynamic';

async function setCampaignStatus(formData: FormData) {
  'use server';
  const id = Number(formData.get('id'));
  const status = formData.get('status') as string;
  await (await campaignsCol()).updateOne({ id }, { $set: { status } });
  revalidatePath('/');
}

export default async function CampaignsPage() {
  const campaigns = await (await campaignsCol()).find({}).sort({ id: 1 }).toArray();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Campaigns</h1>
          <p className="page-sub">Start a campaign, then send batches.</p>
        </div>
        <div className="page-actions">
          <SendNowButton />
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="empty">
          <p className="empty-title">No campaigns yet</p>
          <p>Use the <a href="/upload">Upload</a> page to create one and import recipients.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th className="num">Daily Cap</th>
                <th>Created</th>
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id}>
                  <td className="num"><span className="cell-muted">{c.id}</span></td>
                  <td><span className="cell-strong">{c.name}</span></td>
                  <td>
                    <span className={
                      c.status === 'active' ? 'badge badge-success' :
                      c.status === 'paused' ? 'badge badge-warning' :
                      'badge'
                    }>
                      {c.status}
                    </span>
                  </td>
                  <td className="num">{c.globalDailyCap}</td>
                  <td><span className="cell-muted">{new Date(c.createdAt).toLocaleDateString()}</span></td>
                  <td className="col-actions">
                    <form action={setCampaignStatus} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value="active" />
                      <button
                        type="submit"
                        disabled={c.status === 'active'}
                        className="btn btn-primary btn-sm"
                      >
                        Start
                      </button>
                    </form>
                    {' '}
                    <form action={setCampaignStatus} style={{ display: 'inline' }}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="status" value="paused" />
                      <button
                        type="submit"
                        disabled={c.status === 'paused'}
                        className="btn btn-sm"
                      >
                        Stop
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

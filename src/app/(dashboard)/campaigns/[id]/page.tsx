import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import {
  campaignsCol,
  recipientsCol,
  templatesCol,
  sendLogCol,
  domainsCol,
} from '@/db/collections';
import { getSelectedBrandId } from '@/lib/brand';

export const dynamic = 'force-dynamic';

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

async function setCampaignStatus(formData: FormData) {
  'use server';
  const brandId = await getSelectedBrandId();
  if (brandId === null) throw new Error('no brand selected');
  const id = Number(formData.get('id'));
  const status = formData.get('status') as string;
  await (await campaignsCol()).updateOne({ id, brandId }, { $set: { status } });
  revalidatePath(`/campaigns/${id}`);
  revalidatePath('/');
}

async function updateCampaign(formData: FormData) {
  'use server';
  const brandId = await getSelectedBrandId();
  if (brandId === null) throw new Error('no brand selected');
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  const name = ((formData.get('name') as string) ?? '').trim();
  const bhStart = clamp(Number(formData.get('bhStart')), 0, 23);
  const bhEnd = clamp(Number(formData.get('bhEnd')), 0, 23);
  const timezone = ((formData.get('timezone') as string) ?? 'UTC').trim() || 'UTC';
  const globalDailyCap = clamp(Number(formData.get('globalDailyCap')), 1, 100000);
  const perInboxCap = clamp(Number(formData.get('perInboxCap')), 1, 1000);
  const jitterPct = clamp(Number(formData.get('jitterPct')), 0, 100);
  const $set: Record<string, unknown> = {
    bhStart, bhEnd, timezone, globalDailyCap, perInboxCap, jitterPct,
  };
  if (name) $set.name = name;
  await (await campaignsCol()).updateOne({ id, brandId }, { $set });
  revalidatePath(`/campaigns/${id}`);
  revalidatePath('/');
}

async function updateCampaignTemplates(formData: FormData) {
  'use server';
  const brandId = await getSelectedBrandId();
  if (brandId === null) throw new Error('no brand selected');
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  const ids = formData.getAll('templateIds').map((v) => Number(v)).filter((n) => Number.isFinite(n));
  await (await campaignsCol()).updateOne({ id, brandId }, { $set: { templateIds: ids } });
  revalidatePath(`/campaigns/${id}`);
  revalidatePath('/');
}

async function updateCampaignDomains(formData: FormData) {
  'use server';
  const brandId = await getSelectedBrandId();
  if (brandId === null) throw new Error('no brand selected');
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  const ids = formData.getAll('domainIds').map((v) => Number(v)).filter((n) => Number.isFinite(n));
  await (await campaignsCol()).updateOne({ id, brandId }, { $set: { domainIds: ids } });
  revalidatePath(`/campaigns/${id}`);
  revalidatePath('/');
}

async function deleteCampaign(formData: FormData) {
  'use server';
  const brandId = await getSelectedBrandId();
  if (brandId === null) throw new Error('no brand selected');
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  await (await recipientsCol()).deleteMany({ campaignId: id, status: 'pending' });
  await (await campaignsCol()).deleteOne({ id, brandId });
  revalidatePath('/');
  redirect('/');
}

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const brandId = await getSelectedBrandId();
  if (brandId === null) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-title">Campaign</h1>
          </div>
        </div>
        <div className="empty">
          <p className="empty-title">No brand selected</p>
          <Link href="/brands" className="btn btn-primary">Add a brand</Link>
        </div>
      </>
    );
  }

  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const c = await (await campaignsCol()).findOne({ id, brandId });
  if (!c) notFound();

  const [templates, domains, recipientCounts, recentLog] = await Promise.all([
    (await templatesCol()).find({ brandId, active: true }).sort({ id: 1 }).toArray(),
    (await domainsCol()).find({ brandId }).sort({ id: 1 }).toArray(),
    (await recipientsCol()).aggregate<{ _id: string; n: number }>([
      { $match: { campaignId: id } },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]).toArray(),
    (await sendLogCol()).find({ brandId }).sort({ ts: -1 }).limit(20).toArray(),
  ]);

  const counts: Record<string, number> = {};
  for (const r of recipientCounts) counts[r._id] = r.n;
  const totalRecipients = Object.values(counts).reduce((a, n) => a + n, 0);

  return (
    <>
      <div className="page-header">
        <div>
          <p className="page-sub">
            <Link href="/">← Campaigns</Link>
          </p>
          <h1 className="page-title">{c.name}</h1>
          <p className="page-sub">
            Campaign #{c.id} ·{' '}
            <span className={
              c.status === 'active' ? 'badge badge-success' :
              c.status === 'paused' ? 'badge badge-warning' :
              'badge'
            }>{c.status}</span>
          </p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: 8 }}>
          <form action={setCampaignStatus} style={{ display: 'inline' }}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="status" value="active" />
            <button type="submit" disabled={c.status === 'active'} className="btn btn-primary btn-sm">Start</button>
          </form>
          <form action={setCampaignStatus} style={{ display: 'inline' }}>
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="status" value="paused" />
            <button type="submit" disabled={c.status === 'paused'} className="btn btn-sm">Stop</button>
          </form>
        </div>
      </div>

      <div className="stack">
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <p className="section-title">Recipients</p>
              <p className="section-sub">Import a CSV of recipients into this campaign.</p>
            </div>
            <Link
              href={`/upload?campaign=${c.id}`}
              className="btn btn-primary btn-sm"
            >
              Add recipients
            </Link>
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field"><span className="label">Total</span><span className="cell-strong">{totalRecipients}</span></div>
            <div className="field"><span className="label">Pending</span><span className="cell-strong">{counts.pending ?? 0}</span></div>
            <div className="field"><span className="label">Sent</span><span className="cell-strong">{counts.sent ?? 0}</span></div>
            <div className="field"><span className="label">Failed</span><span className="cell-strong">{counts.failed ?? 0}</span></div>
          </div>
        </div>

        <div className="card">
          <p className="section-title">Templates used by this campaign</p>
          <p className="section-sub">
            Check templates to scope sends. Uncheck all = falls back to every active brand template.
          </p>
          {templates.length === 0 ? (
            <p className="cell-muted">No active templates. <Link href="/templates">Create one</Link>.</p>
          ) : (
            <form action={updateCampaignTemplates}>
              <input type="hidden" name="id" value={c.id} />
              <div className="form-grid">
                {templates.map(t => {
                  const checked =
                    !c.templateIds || c.templateIds.length === 0
                      ? true
                      : c.templateIds.includes(t.id);
                  return (
                    <label key={t.id} className="check-row">
                      <input type="checkbox" name="templateIds" value={t.id} defaultChecked={checked} />
                      <span><span className="cell-strong">{t.label}</span> — <span className="cell-muted">{t.subject}</span> (weight {t.weight})</span>
                    </label>
                  );
                })}
              </div>
              <div className="form-foot">
                <button type="submit" className="btn btn-primary btn-sm">Save templates</button>
              </div>
            </form>
          )}
        </div>

        <div className="card">
          <p className="section-title">Domains used by this campaign</p>
          <p className="section-sub">
            Check domains to assign as senders. Uncheck all = use every active brand domain.
          </p>
          {domains.length === 0 ? (
            <p className="cell-muted">No domains. <Link href="/domains">Add one</Link>.</p>
          ) : (
            <form action={updateCampaignDomains}>
              <input type="hidden" name="id" value={c.id} />
              <div className="form-grid">
                {domains.map(d => {
                  const checked =
                    !c.domainIds || c.domainIds.length === 0
                      ? true
                      : c.domainIds.includes(d.id);
                  const verified = d.spfVerified && d.dkimVerified && d.dmarcVerified;
                  return (
                    <label key={d.id} className="check-row">
                      <input type="checkbox" name="domainIds" value={d.id} defaultChecked={checked} />
                      <span>
                        <span className="cell-strong">{d.fromEmail}</span>
                        {' '}
                        <span className={d.status === 'active' ? 'badge badge-success badge-plain' : 'badge badge-plain'}>
                          {d.status}
                        </span>
                        {' '}
                        <span className={verified ? 'badge badge-success badge-plain' : 'badge badge-warning badge-plain'}>
                          {verified ? 'DNS ok' : 'DNS incomplete'}
                        </span>
                        {' '}
                        <span className="cell-muted">cap {d.dailyCap}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="form-foot">
                <button type="submit" className="btn btn-primary btn-sm">Save domains</button>
              </div>
            </form>
          )}
        </div>

        <div className="card">
          <p className="section-title">Settings</p>
          <form action={updateCampaign}>
            <input type="hidden" name="id" value={c.id} />
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="name">Name</label>
                <input className="input" type="text" id="name" name="name" defaultValue={c.name} required />
              </div>
              <div className="field">
                <label className="label" htmlFor="globalDailyCap">Global Daily Cap</label>
                <input className="input" type="number" id="globalDailyCap" name="globalDailyCap" defaultValue={c.globalDailyCap} min={1} max={100000} />
              </div>
              <div className="field">
                <label className="label" htmlFor="perInboxCap">Per-Inbox Cap</label>
                <input className="input" type="number" id="perInboxCap" name="perInboxCap" defaultValue={c.perInboxCap} min={1} max={1000} />
              </div>
              <div className="field">
                <label className="label" htmlFor="bhStart">Business Hours Start (0–23)</label>
                <input className="input" type="number" id="bhStart" name="bhStart" defaultValue={c.bhStart} min={0} max={23} />
              </div>
              <div className="field">
                <label className="label" htmlFor="bhEnd">Business Hours End (0–23)</label>
                <input className="input" type="number" id="bhEnd" name="bhEnd" defaultValue={c.bhEnd} min={0} max={23} />
              </div>
              <div className="field">
                <label className="label" htmlFor="timezone">Timezone (IANA)</label>
                <input className="input" type="text" id="timezone" name="timezone" defaultValue={c.timezone} placeholder="UTC" />
              </div>
              <div className="field">
                <label className="label" htmlFor="jitterPct">Jitter % (0–100)</label>
                <input className="input" type="number" id="jitterPct" name="jitterPct" defaultValue={c.jitterPct} min={0} max={100} />
              </div>
            </div>
            <div className="form-foot">
              <button type="submit" className="btn btn-primary btn-sm">Save changes</button>
            </div>
          </form>
        </div>

        <div className="card">
          <p className="section-title">Recent send log</p>
          {recentLog.length === 0 ? (
            <p className="cell-muted">No sends yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Status</th>
                    <th className="num">Recipient #</th>
                    <th className="num">Domain #</th>
                    <th className="num">Template #</th>
                    <th>SMTP</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLog.map((l, i) => (
                    <tr key={i}>
                      <td><span className="cell-muted">{new Date(l.ts).toLocaleString()}</span></td>
                      <td>
                        <span className={
                          l.status === 'sent' ? 'badge badge-success' :
                          l.status.startsWith('fail') ? 'badge badge-warning' :
                          'badge'
                        }>{l.status}</span>
                      </td>
                      <td className="num">{l.recipientId}</td>
                      <td className="num">{l.domainId}</td>
                      <td className="num">{l.templateId ?? '—'}</td>
                      <td><span className="cell-snippet">{l.smtpResponse ?? ''}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <p className="section-title" style={{ color: 'var(--danger, #c33)' }}>Danger zone</p>
          <p className="section-sub">Delete campaign + drop its pending recipients. Sent rows + send log preserved.</p>
          <form action={deleteCampaign}>
            <input type="hidden" name="id" value={c.id} />
            <button type="submit" className="btn btn-sm btn-danger">Delete campaign</button>
          </form>
        </div>
      </div>
    </>
  );
}

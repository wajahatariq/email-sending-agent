import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { domainsCol, nextId } from '@/db/collections';
import { getSelectedBrandId } from '@/lib/brand';
import { encryptSecret } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

async function addDomain(formData: FormData) {
  'use server';
  const brandId = await getSelectedBrandId();
  if (brandId === null) throw new Error('no brand selected');
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
    brandId,
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
  const brandId = await getSelectedBrandId();

  if (brandId === null) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-title">Domains</h1>
            <p className="page-sub">Manage sending domains, SMTP credentials, and IMAP reply ingestion.</p>
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

  const domains = await (await domainsCol()).find({ brandId }).sort({ id: 1 }).toArray();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Domains</h1>
          <p className="page-sub">Manage sending domains, SMTP credentials, and IMAP reply ingestion.</p>
        </div>
      </div>

      <div className="stack">
        {domains.length === 0 ? (
          <div className="empty">
            <p className="empty-title">No domains yet</p>
            <p>Add a domain below to start sending email.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Status</th>
                  <th className="num">Daily Cap</th>
                  <th>Warmup Start</th>
                  <th>SPF</th>
                  <th>DKIM</th>
                  <th>DMARC</th>
                  <th>SMTP</th>
                  <th>IMAP</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {domains.map(d => (
                  <tr key={d.id}>
                    <td>
                      <span className="cell-strong">{d.fromEmail}</span>
                      <br />
                      <span className="cell-muted">{d.fromName}</span>
                    </td>
                    <td>
                      <span className={d.status === 'active' ? 'badge badge-success' : 'badge badge-warning'}>
                        {d.status}
                      </span>
                    </td>
                    <td className="num">{d.dailyCap}</td>
                    <td><span className="cell-muted">{d.warmupStartDate}</span></td>
                    <td>
                      <span className={d.spfVerified ? 'badge badge-success badge-plain' : 'badge badge-plain'}>
                        {d.spfVerified ? 'verified' : 'no'}
                      </span>
                    </td>
                    <td>
                      <span className={d.dkimVerified ? 'badge badge-success badge-plain' : 'badge badge-plain'}>
                        {d.dkimVerified ? 'verified' : 'no'}
                      </span>
                    </td>
                    <td>
                      <span className={d.dmarcVerified ? 'badge badge-success badge-plain' : 'badge badge-plain'}>
                        {d.dmarcVerified ? 'verified' : 'no'}
                      </span>
                    </td>
                    <td>
                      <span className="cell-muted">{d.smtpPassEnc ? 'set' : 'unset'}</span>
                    </td>
                    <td>
                      <span className="cell-muted">{d.imapPassEnc ? 'set' : 'unset'}</span>
                    </td>
                    <td className="col-actions">
                      <form action={toggleDomainStatus} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={d.id} />
                        <input type="hidden" name="current" value={d.status} />
                        <button type="submit" className="btn btn-sm">
                          {d.status === 'active' ? 'Pause' : 'Activate'}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card">
          <p className="section-title">Add Domain</p>
          <p className="section-sub">Configure a new sending domain with SMTP credentials.</p>
          <form action={addDomain}>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="fromName">From Name</label>
                <input className="input" type="text" id="fromName" name="fromName" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="fromEmail">From Email</label>
                <input className="input" type="email" id="fromEmail" name="fromEmail" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="smtpHost">SMTP Host</label>
                <input className="input" type="text" id="smtpHost" name="smtpHost" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="smtpPort">SMTP Port</label>
                <input className="input" type="number" id="smtpPort" name="smtpPort" required defaultValue={587} />
              </div>
              <div className="field">
                <label className="label" htmlFor="smtpUser">SMTP User</label>
                <input className="input" type="text" id="smtpUser" name="smtpUser" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="smtpPass">SMTP Password</label>
                <input className="input" type="password" id="smtpPass" name="smtpPass" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="dailyCap">Daily Cap</label>
                <input className="input" type="number" id="dailyCap" name="dailyCap" defaultValue={40} />
              </div>
              <div className="field">
                <label className="label" htmlFor="warmupStartDate">Warmup Start Date</label>
                <input className="input" type="date" id="warmupStartDate" name="warmupStartDate" defaultValue={today} />
              </div>
              <div className="field field-wide">
                <fieldset className="fieldset">
                  <legend>DNS Verification</legend>
                  <div className="form-grid" style={{ marginTop: '8px' }}>
                    <label className="check-row">
                      <input type="checkbox" name="spfVerified" /> SPF Verified
                    </label>
                    <label className="check-row">
                      <input type="checkbox" name="dkimVerified" /> DKIM Verified
                    </label>
                    <label className="check-row">
                      <input type="checkbox" name="dmarcVerified" /> DMARC Verified
                    </label>
                  </div>
                </fieldset>
              </div>
              <div className="field field-wide">
                <fieldset className="fieldset">
                  <legend>IMAP — reply ingestion (optional)</legend>
                  <p className="hint" style={{ margin: '8px 0 12px' }}>
                    Leave IMAP Host blank to skip reply polling for this domain.
                  </p>
                  <div className="form-grid">
                    <div className="field">
                      <label className="label" htmlFor="imapHost">IMAP Host</label>
                      <input className="input" type="text" id="imapHost" name="imapHost" placeholder="imap.hostinger.com" />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="imapPort">IMAP Port</label>
                      <input className="input" type="number" id="imapPort" name="imapPort" placeholder="993" defaultValue={993} />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="imapUser">IMAP User</label>
                      <input className="input" type="text" id="imapUser" name="imapUser" placeholder="usually the full email address" />
                    </div>
                    <div className="field">
                      <label className="label" htmlFor="imapPass">IMAP Password</label>
                      <input className="input" type="password" id="imapPass" name="imapPass" />
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>
            <div className="form-foot">
              <button type="submit" className="btn btn-primary">Add Domain</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

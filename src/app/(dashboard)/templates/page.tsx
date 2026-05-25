import { Fragment } from 'react';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { templatesCol, campaignsCol, nextId } from '@/db/collections';
import { getSelectedBrandId } from '@/lib/brand';

export const dynamic = 'force-dynamic';

async function updateTemplate(formData: FormData) {
  'use server';
  const brandId = await getSelectedBrandId();
  if (brandId === null) throw new Error('no brand selected');
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  const label = ((formData.get('label') as string) ?? '').trim();
  const subject = ((formData.get('subject') as string) ?? '').trim();
  const bodyHtml = (formData.get('bodyHtml') as string) ?? '';
  const bodyText = (formData.get('bodyText') as string) ?? '';
  const weight = Math.max(1, Math.min(1000, Number(formData.get('weight') ?? 1)));
  const active = formData.get('active') === 'on';
  const $set: Record<string, unknown> = { bodyHtml, bodyText, weight, active };
  if (label) $set.label = label;
  if (subject) $set.subject = subject;
  await (await templatesCol()).updateOne({ id, brandId }, { $set });
  revalidatePath('/templates');
}

async function addTemplate(formData: FormData) {
  'use server';
  const brandId = await getSelectedBrandId();
  if (brandId === null) throw new Error('no brand selected');
  const id = await nextId('templates');
  await (await templatesCol()).insertOne({
    id,
    brandId,
    label: formData.get('label') as string,
    subject: formData.get('subject') as string,
    bodyHtml: formData.get('bodyHtml') as string,
    bodyText: formData.get('bodyText') as string,
    weight: Number(formData.get('weight') ?? 1),
    active: formData.get('active') === 'on',
  });
  revalidatePath('/templates');
}

async function deleteTemplate(formData: FormData) {
  'use server';
  const brandId = await getSelectedBrandId();
  if (brandId === null) throw new Error('no brand selected');
  const id = Number(formData.get('id'));
  if (!Number.isFinite(id)) return;
  // Drop from any campaign that referenced it so the engine never picks a
  // dead id, then delete the template doc itself.
  await (await campaignsCol()).updateMany(
    { brandId, templateIds: id },
    { $pull: { templateIds: id } },
  );
  await (await templatesCol()).deleteOne({ id, brandId });
  revalidatePath('/templates');
  revalidatePath('/');
}

export default async function TemplatesPage() {
  const brandId = await getSelectedBrandId();

  if (brandId === null) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-title">Templates</h1>
            <p className="page-sub">Email templates used for outbound campaigns.</p>
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

  const templates = await (await templatesCol()).find({ brandId }).sort({ id: 1 }).toArray();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-sub">Email templates used for outbound campaigns.</p>
        </div>
      </div>

      <div className="stack">
        {templates.length === 0 ? (
          <div className="empty">
            <p className="empty-title">No templates yet</p>
            <p>Add a template below to get started.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Label</th>
                  <th>Subject</th>
                  <th className="num">Weight</th>
                  <th>Active</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map(t => (
                  <Fragment key={t.id}>
                  <tr>
                    <td className="num"><span className="cell-muted">{t.id}</span></td>
                    <td><span className="cell-strong">{t.label}</span></td>
                    <td><span className="cell-snippet">{t.subject}</span></td>
                    <td className="num">{t.weight}</td>
                    <td>
                      <span className={t.active ? 'badge badge-success' : 'badge'}>
                        {t.active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="col-actions">
                      <form action={deleteTemplate} style={{ display: 'inline' }}>
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          type="submit"
                          className="btn btn-sm btn-danger"
                          title="Delete template"
                        >
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={6} style={{ paddingTop: 0 }}>
                      <details>
                        <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--ink-3, #666)' }}>
                          Edit template
                        </summary>
                        <form action={updateTemplate} style={{ marginTop: 8 }}>
                          <input type="hidden" name="id" value={t.id} />
                          <div className="form-grid">
                            <div className="field">
                              <label className="label" htmlFor={`label-${t.id}`}>Label</label>
                              <input className="input" type="text" id={`label-${t.id}`} name="label" defaultValue={t.label} required />
                            </div>
                            <div className="field">
                              <label className="label" htmlFor={`weight-${t.id}`}>Weight</label>
                              <input className="input" type="number" id={`weight-${t.id}`} name="weight" defaultValue={t.weight} min={1} max={1000} />
                            </div>
                            <div className="field field-wide">
                              <label className="label" htmlFor={`subject-${t.id}`}>Subject</label>
                              <input className="input" type="text" id={`subject-${t.id}`} name="subject" defaultValue={t.subject} required />
                            </div>
                            <div className="field field-wide">
                              <label className="label" htmlFor={`bodyHtml-${t.id}`}>Body HTML</label>
                              <textarea className="textarea mono" id={`bodyHtml-${t.id}`} name="bodyHtml" rows={8} defaultValue={t.bodyHtml} required />
                            </div>
                            <div className="field field-wide">
                              <label className="label" htmlFor={`bodyText-${t.id}`}>Body Text</label>
                              <textarea className="textarea mono" id={`bodyText-${t.id}`} name="bodyText" rows={5} defaultValue={t.bodyText} required />
                            </div>
                            <div className="field field-wide">
                              <label className="check-row">
                                <input type="checkbox" name="active" defaultChecked={t.active} /> Active
                              </label>
                            </div>
                          </div>
                          <div className="form-foot">
                            <button type="submit" className="btn btn-primary btn-sm">Save changes</button>
                          </div>
                        </form>
                      </details>
                    </td>
                  </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card">
          <p className="section-title">Add Template</p>
          <p className="section-sub">Create a new email template for your campaigns.</p>
          <form action={addTemplate}>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="label">Label</label>
                <input className="input" type="text" id="label" name="label" required />
              </div>
              <div className="field">
                <label className="label" htmlFor="weight">Weight</label>
                <input className="input" type="number" id="weight" name="weight" defaultValue={1} min={1} />
              </div>
              <div className="field field-wide">
                <label className="label" htmlFor="subject">Subject</label>
                <input className="input" type="text" id="subject" name="subject" required />
              </div>
              <div className="field field-wide">
                <label className="label" htmlFor="bodyHtml">Body HTML</label>
                <textarea className="textarea mono" id="bodyHtml" name="bodyHtml" rows={8} required />
              </div>
              <div className="field field-wide">
                <label className="label" htmlFor="bodyText">Body Text</label>
                <textarea className="textarea mono" id="bodyText" name="bodyText" rows={5} required />
              </div>
              <div className="field field-wide">
                <label className="check-row">
                  <input type="checkbox" name="active" defaultChecked /> Active
                </label>
              </div>
            </div>
            <div className="form-foot">
              <button type="submit" className="btn btn-primary">Add Template</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

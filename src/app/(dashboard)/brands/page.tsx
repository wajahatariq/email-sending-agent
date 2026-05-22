import { revalidatePath } from 'next/cache';
import { brandsCol, nextId } from '@/db/collections';
import { getSelectedBrandId, setSelectedBrandCookie, listBrands } from '@/lib/brand';

export const dynamic = 'force-dynamic';

async function addBrand(formData: FormData) {
  'use server';
  const name = (formData.get('name') as string).trim();
  const companyAddress = (formData.get('companyAddress') as string).trim();
  if (!name || !companyAddress) throw new Error('name and companyAddress are required');
  const id = await nextId('brands');
  await (await brandsCol()).insertOne({ id, name, companyAddress, createdAt: new Date() });
  await setSelectedBrandCookie(id);
  revalidatePath('/', 'layout');
}

async function switchBrand(formData: FormData) {
  'use server';
  await setSelectedBrandCookie(Number(formData.get('id')));
  revalidatePath('/', 'layout');
}

export default async function BrandsPage() {
  const brands = await listBrands();
  const selectedId = await getSelectedBrandId();

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Brands</h1>
          <p className="page-sub">Each brand has its own campaigns, domains, templates, and replies.</p>
        </div>
      </div>

      <div className="stack">
        {brands.length === 0 ? (
          <div className="empty">
            <p className="empty-title">No brands yet</p>
            <p>Add your first brand to begin.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Postal Address</th>
                  <th>Created</th>
                  <th className="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {brands.map(b => (
                  <tr key={b.id}>
                    <td><span className="cell-strong">{b.name}</span></td>
                    <td><span className="cell-muted">{b.companyAddress}</span></td>
                    <td><span className="cell-muted">{new Date(b.createdAt).toLocaleDateString()}</span></td>
                    <td className="col-actions">
                      {b.id === selectedId ? (
                        <span className="badge badge-success">current</span>
                      ) : (
                        <form action={switchBrand} style={{ display: 'inline' }}>
                          <input type="hidden" name="id" value={b.id} />
                          <button type="submit" className="btn btn-sm">Switch</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="card">
          <p className="section-title">Add Brand</p>
          <p className="section-sub">Create a new brand. It will become the active brand immediately.</p>
          <form action={addBrand}>
            <div className="form-grid">
              <div className="field">
                <label className="label" htmlFor="brandName">Brand Name</label>
                <input className="input" type="text" id="brandName" name="name" required />
              </div>
              <div className="field field-wide">
                <label className="label" htmlFor="companyAddress">Company Address (CAN-SPAM footer)</label>
                <textarea className="textarea" id="companyAddress" name="companyAddress" rows={3} required />
              </div>
            </div>
            <div className="form-foot">
              <button type="submit" className="btn btn-primary">Add Brand</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

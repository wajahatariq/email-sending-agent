import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { templatesCol, nextId } from '@/db/collections';

export const dynamic = 'force-dynamic';

async function addTemplate(formData: FormData) {
  'use server';
  const id = await nextId('templates');
  await (await templatesCol()).insertOne({
    id,
    label: formData.get('label') as string,
    subject: formData.get('subject') as string,
    bodyHtml: formData.get('bodyHtml') as string,
    bodyText: formData.get('bodyText') as string,
    weight: Number(formData.get('weight') ?? 1),
    active: formData.get('active') === 'on',
  });
  revalidatePath('/templates');
}

export default async function TemplatesPage() {
  const templates = await (await templatesCol()).find({}).sort({ id: 1 }).toArray();

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '0.5rem' }}>Templates</h1>
      <nav style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
        <Link href="/">Campaigns</Link>
        <Link href="/domains">Domains</Link>
        <Link href="/templates">Templates</Link>
        <Link href="/upload">Upload</Link>
        <Link href="/log">Log</Link>
      </nav>

      <h2>Existing Templates</h2>
      {templates.length === 0 ? (
        <p>No templates yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '2rem' }}>
          <thead>
            <tr>
              {['ID', 'Label', 'Subject', 'Weight', 'Active'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0.4rem 0.75rem', borderBottom: '2px solid #ccc' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templates.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '0.4rem 0.75rem' }}>{t.id}</td>
                <td style={{ padding: '0.4rem 0.75rem' }}>{t.label}</td>
                <td style={{ padding: '0.4rem 0.75rem' }}>{t.subject}</td>
                <td style={{ padding: '0.4rem 0.75rem' }}>{t.weight}</td>
                <td style={{ padding: '0.4rem 0.75rem' }}>
                  <span style={{
                    display: 'inline-block', padding: '0.1rem 0.4rem', borderRadius: '0.25rem',
                    background: t.active ? '#d1fae5' : '#f3f4f6',
                    color: t.active ? '#065f46' : '#6b7280',
                  }}>{t.active ? 'Yes' : 'No'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Add Template</h2>
      <form action={addTemplate} style={{ display: 'grid', gap: '0.75rem', maxWidth: '600px' }}>
        <label>
          Label
          <input type="text" name="label" required style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <label>
          Subject
          <input type="text" name="subject" required style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <label>
          Body HTML
          <textarea name="bodyHtml" rows={8} required
            style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem', fontFamily: 'monospace', fontSize: '0.85rem' }} />
        </label>
        <label>
          Body Text
          <textarea name="bodyText" rows={5} required
            style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem', fontFamily: 'monospace', fontSize: '0.85rem' }} />
        </label>
        <label>
          Weight
          <input type="number" name="weight" defaultValue={1} min={1}
            style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }} />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" name="active" defaultChecked /> Active
        </label>
        <button type="submit" style={{ padding: '0.4rem 1rem', cursor: 'pointer', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.25rem' }}>
          Add Template
        </button>
      </form>
    </main>
  );
}

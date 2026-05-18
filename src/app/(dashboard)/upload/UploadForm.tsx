'use client';
import { useActionState } from 'react';
import { importCsv, ImportResult } from './actions';

interface Campaign { id: number; name: string; status: string; }

export default function UploadForm({ campaigns }: { campaigns: Campaign[] }) {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(importCsv, null);

  return (
    <div>
      {result && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: '0.25rem', background: result.errors.length > 0 ? '#fef3c7' : '#d1fae5', border: `1px solid ${result.errors.length > 0 ? '#fcd34d' : '#6ee7b7'}` }}>
          <p style={{ margin: '0 0 0.4rem', fontWeight: 600, color: result.errors.length > 0 ? '#92400e' : '#065f46' }}>
            Imported {result.imported} recipient(s).
          </p>
          {result.errors.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', color: '#92400e' }}>{result.errors.length} rejected row(s) — click to expand</summary>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#7c3aed' }}>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      <form action={action} style={{ display: 'grid', gap: '0.75rem', maxWidth: '600px' }}>
        <fieldset style={{ border: '1px solid #ccc', padding: '0.75rem', borderRadius: '0.25rem' }}>
          <legend>Campaign</legend>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Select existing campaign:
            <select name="campaignId" style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }}>
              <option value="">— none —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
              ))}
            </select>
          </label>
          <p style={{ margin: '0.4rem 0', color: '#6b7280', fontSize: '0.85rem' }}>or create new:</p>
          <label>
            New campaign name
            <input type="text" name="newCampaignName"
              style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem' }}
              placeholder="Leave blank to use selection above" />
          </label>
        </fieldset>

        <label>
          CSV Data (paste here — first row must be header with at least an <code>email</code> column)
          <textarea name="csv" rows={12} required
            placeholder={'email,name,company\njohn@example.com,John Doe,Acme Corp'}
            style={{ display: 'block', width: '100%', padding: '0.3rem', marginTop: '0.2rem', fontFamily: 'monospace', fontSize: '0.85rem' }} />
        </label>

        <button type="submit" disabled={pending}
          style={{ padding: '0.4rem 1rem', cursor: pending ? 'not-allowed' : 'pointer', background: pending ? '#93c5fd' : '#3b82f6', color: '#fff', border: 'none', borderRadius: '0.25rem' }}>
          {pending ? 'Importing…' : 'Import Recipients'}
        </button>
      </form>
    </div>
  );
}

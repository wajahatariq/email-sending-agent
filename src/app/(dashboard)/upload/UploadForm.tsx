'use client';
import { useActionState, useState } from 'react';
import { importCsv, ImportResult } from './actions';

interface Campaign { id: number; name: string; status: string; }

export default function UploadForm({
  campaigns,
  preselectedCampaignId,
}: {
  campaigns: Campaign[];
  preselectedCampaignId?: number;
}) {
  const [result, action, pending] = useActionState<ImportResult | null, FormData>(importCsv, null);
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);

  function loadFile(f: File | undefined | null) {
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(f);
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    loadFile(e.target.files?.[0]);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    loadFile(e.dataTransfer.files?.[0]);
  }

  return (
    <div>
      {result && (
        <div className="result" style={{ marginBottom: '16px', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
          <span className={result.errors.length > 0 ? 'result-warn' : 'result-ok'}>
            Imported {result.imported} recipient(s).
          </span>
          {result.errors.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer' }}>{result.errors.length} rejected row(s) — click to expand</summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      <form action={action}>
        <div className="form-grid">
          <div className="field field-wide">
            <label className="label" htmlFor="campaignId">Select existing campaign</label>
            <select
              className="select"
              id="campaignId"
              name="campaignId"
              defaultValue={preselectedCampaignId ? String(preselectedCampaignId) : ''}
            >
              <option value="">— none —</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name} ({c.status})</option>
              ))}
            </select>
          </div>
          <div className="field field-wide">
            <label className="label" htmlFor="newCampaignName">New campaign name</label>
            <input
              className="input"
              type="text"
              id="newCampaignName"
              name="newCampaignName"
              placeholder="Leave blank to use selection above"
            />
          </div>
          <div className="field field-wide">
            <label className="label" htmlFor="csvFile">Upload CSV file</label>
            <div
              onDrop={onDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onClick={() => document.getElementById('csvFile')?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') document.getElementById('csvFile')?.click(); }}
              style={{
                border: `2px dashed ${dragOver ? '#4f46e5' : 'var(--border, #d0d0d8)'}`,
                background: dragOver ? 'rgba(79,70,229,0.06)' : 'transparent',
                borderRadius: '10px',
                padding: '18px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color .15s, background .15s',
              }}
            >
              <p style={{ margin: 0, fontSize: '14px' }}>
                {dragOver ? 'Drop the CSV to load it' : 'Drag & drop a CSV here, or click to browse'}
              </p>
              {fileName && <p className="hint" style={{ marginTop: '6px' }}>Loaded <code>{fileName}</code> — review below before importing.</p>}
            </div>
            <input
              className="input"
              type="file"
              id="csvFile"
              accept=".csv,text/csv,text/plain"
              onChange={onFile}
              style={{ display: 'none' }}
            />
          </div>
          <div className="field field-wide">
            <label className="label" htmlFor="csv">CSV Data <span className="hint">(or paste directly)</span></label>
            <textarea
              className="textarea mono"
              id="csv"
              name="csv"
              rows={12}
              required
              value={csv}
              onChange={e => setCsv(e.target.value)}
              placeholder={'email,name,company\njohn@example.com,John Doe,Acme Corp'}
            />
            <p className="hint">First row must be a header. Required column: <code>email</code>. Optional: <code>name</code>, <code>company</code>, and any extra columns stored as custom fields.</p>
          </div>
        </div>
        <div className="form-foot">
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? 'Importing…' : 'Import Recipients'}
          </button>
        </div>
      </form>
    </div>
  );
}

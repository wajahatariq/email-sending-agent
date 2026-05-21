'use client';
import { useActionState } from 'react';
import { sendNow } from './actions';
import type { TickResult } from '@/lib/tick';

export function SendNowButton() {
  const [result, dispatch, pending] = useActionState<TickResult | null, FormData>(
    sendNow,
    null,
  );

  return (
    <div
      style={{
        margin: '1rem 0 1.5rem',
        padding: '1rem',
        border: '1px solid #ddd',
        borderRadius: '0.5rem',
        background: '#fafafa',
      }}
    >
      <form action={dispatch} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: '0.55rem 1.1rem',
            cursor: pending ? 'wait' : 'pointer',
            background: pending ? '#9ca3af' : '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '0.3rem',
            fontWeight: 600,
            fontSize: '0.95rem',
          }}
        >
          {pending ? 'Sending…' : 'Send Now'}
        </button>
        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          Fires one batch on the active campaign. Caps, warmup, rotation, and suppression are all
          enforced. Click again to send more.
        </span>
      </form>

      {result && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
          {result.skipped ? (
            <p style={{ color: '#92400e', margin: 0 }}>
              Skipped: <code>{result.skipped}</code>
            </p>
          ) : (
            <p style={{ color: '#065f46', margin: 0 }}>
              Sent {result.sent} · failed {result.failed}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

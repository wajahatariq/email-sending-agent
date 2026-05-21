'use client';
import { useActionState } from 'react';
import { checkRepliesNow } from './actions';
import type { PollResult } from '@/lib/pollReplies';

export function CheckRepliesButton() {
  const [result, dispatch, pending] = useActionState<PollResult | null, FormData>(
    checkRepliesNow,
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
          {pending ? 'Checking…' : 'Check Replies Now'}
        </button>
        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          Connects to each IMAP-enabled account and ingests any new replies.
        </span>
      </form>

      {result && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.9rem' }}>
          <p style={{ margin: '0 0 0.4rem', color: '#065f46' }}>
            Polled {result.domainsPolled} account(s) · {result.newReplies} new · {result.matched} matched
          </p>
          {result.errors.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer', color: '#92400e' }}>
                {result.errors.length} error(s) — click to expand
              </summary>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#7c3aed' }}>
                {result.errors.map((e, i) => (
                  <li key={i}>{e.domainId}: {e.error}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

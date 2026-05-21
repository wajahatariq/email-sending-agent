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
    <div>
      <form action={dispatch}>
        <button
          type="submit"
          disabled={pending}
          className="btn"
        >
          {pending ? 'Checking…' : 'Check Replies Now'}
        </button>
      </form>
      <p className="hint" style={{ marginTop: '6px' }}>
        Connects to each IMAP-enabled account and ingests any new replies.
      </p>

      {result && (
        <div className="result" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
          <span className="result-ok">
            Polled {result.domainsPolled} · {result.newReplies} new · {result.matched} matched
          </span>
          {result.errors.length > 0 && (
            <details>
              <summary style={{ cursor: 'pointer' }}>
                {result.errors.length} error(s) — click to expand
              </summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: '20px' }}>
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

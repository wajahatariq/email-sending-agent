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
    <div>
      <form action={dispatch}>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary"
        >
          {pending ? 'Sending…' : 'Send Now'}
        </button>
      </form>
      <p className="hint" style={{ marginTop: '6px' }}>
        Fires one batch on the active campaign. Caps, warmup, rotation, and suppression are all enforced.
      </p>

      {result && (
        <div className="result">
          {result.skipped ? (
            <span className="result-warn">Skipped: {result.skipped}</span>
          ) : (
            <span className="result-ok">Sent {result.sent} · failed {result.failed}</span>
          )}
        </div>
      )}
    </div>
  );
}

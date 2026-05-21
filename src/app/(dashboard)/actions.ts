'use server';
import { revalidatePath } from 'next/cache';
import { runTick, type TickResult } from '@/lib/tick';
import { buildPorts } from '@/lib/tickAdapters';

// Manual "Send Now" trigger. The operator initiated the send, so:
//  - business-hours window is bypassed (manual: true)
//  - one click sends the full remaining budget (still bounded by global cap,
//    per-domain cap, warmup, and BATCH_HARD_CAP=60 within the 300s timeout)
// Click again to send more.
export async function sendNow(
  _prev: TickResult | null,
  _formData: FormData,
): Promise<TickResult> {
  const result = await runTick(buildPorts(), { manual: true });
  revalidatePath('/');
  revalidatePath('/log');
  return result;
}

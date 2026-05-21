'use server';
import { revalidatePath } from 'next/cache';
import { pollReplies, type PollResult } from '@/lib/pollReplies';
import { buildPollPorts } from '@/lib/pollAdapters';

export async function checkRepliesNow(
  _prev: PollResult | null,
  _formData: FormData,
): Promise<PollResult> {
  const result = await pollReplies(buildPollPorts());
  revalidatePath('/replies');
  return result;
}

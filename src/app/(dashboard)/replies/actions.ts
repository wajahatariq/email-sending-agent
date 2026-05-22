'use server';
import { revalidatePath } from 'next/cache';
import { getSelectedBrandId } from '@/lib/brand';
import { pollReplies, type PollResult } from '@/lib/pollReplies';
import { buildPollPorts } from '@/lib/pollAdapters';

export async function checkRepliesNow(
  _prev: PollResult | null,
  _formData: FormData,
): Promise<PollResult> {
  const brandId = await getSelectedBrandId();
  if (brandId === null) {
    return { domainsPolled: 0, newReplies: 0, matched: 0, errors: [] };
  }
  const result = await pollReplies(buildPollPorts(brandId));
  revalidatePath('/replies');
  return result;
}

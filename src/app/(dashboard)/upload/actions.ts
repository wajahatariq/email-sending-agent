'use server';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { parseRecipientsCsv } from '@/lib/csv';
import { makeUnsubToken } from '@/lib/token';

export interface ImportResult { imported: number; errors: string[]; }

export async function importCsv(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const db = getDb();
  const csv = (formData.get('csv') as string) ?? '';
  const newCampaignName = ((formData.get('newCampaignName') as string) ?? '').trim();
  const selectedCampaignId = (formData.get('campaignId') as string) ?? '';
  const { valid, errors } = parseRecipientsCsv(csv);
  let campaignId: number;
  if (newCampaignName) {
    const [inserted] = await db.insert(s.campaigns).values({ name: newCampaignName, status: 'draft' }).returning({ id: s.campaigns.id });
    campaignId = inserted.id;
  } else {
    campaignId = Number(selectedCampaignId);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return { imported: 0, errors: ['No campaign selected and no new campaign name provided.', ...errors] };
    }
  }
  if (valid.length > 0) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return { imported: 0, errors: ['Server misconfigured: CRON_SECRET not set.', ...errors] };
    const rows = valid.map(r => ({
      campaignId, email: r.email, name: r.name, company: r.company, vars: r.vars,
      status: 'pending' as const, unsubToken: makeUnsubToken(r.email, cronSecret),
    }));
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) await db.insert(s.recipients).values(rows.slice(i, i + CHUNK));
  }
  revalidatePath('/upload');
  return { imported: valid.length, errors };
}

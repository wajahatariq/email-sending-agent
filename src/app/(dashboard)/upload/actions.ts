'use server';
import { revalidatePath } from 'next/cache';
import { campaignsCol, recipientsCol, nextId, nextIdBlock } from '@/db/collections';
import { getSelectedBrandId } from '@/lib/brand';
import { parseRecipientsCsv } from '@/lib/csv';
import { makeUnsubToken } from '@/lib/token';

export interface ImportResult { imported: number; errors: string[]; }

export async function importCsv(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const csv = (formData.get('csv') as string) ?? '';
  const newCampaignName = ((formData.get('newCampaignName') as string) ?? '').trim();
  const selectedCampaignId = (formData.get('campaignId') as string) ?? '';
  const { valid, errors } = parseRecipientsCsv(csv);
  let campaignId: number;
  if (newCampaignName) {
    const brandId = await getSelectedBrandId();
    if (brandId === null) {
      return { imported: 0, errors: ['No brand selected. Select a brand before importing.', ...errors] };
    }
    campaignId = await nextId('campaigns');
    await (await campaignsCol()).insertOne({
      id: campaignId,
      brandId,
      name: newCampaignName,
      status: 'draft',
      bhStart: 9,
      bhEnd: 17,
      timezone: 'UTC',
      globalDailyCap: 200,
      perInboxCap: 40,
      jitterPct: 30,
      createdAt: new Date(),
    });
  } else {
    campaignId = Number(selectedCampaignId);
    if (!Number.isFinite(campaignId) || campaignId <= 0) {
      return { imported: 0, errors: ['No campaign selected and no new campaign name provided.', ...errors] };
    }
  }
  if (valid.length > 0) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return { imported: 0, errors: ['Server misconfigured: CRON_SECRET not set.', ...errors] };
    const startId = await nextIdBlock('recipients', valid.length);
    const col = await recipientsCol();
    const CHUNK = 500;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const slice = valid.slice(i, i + CHUNK);
      const docs = slice.map((r, j) => ({
        id: startId + i + j,
        campaignId,
        email: r.email,
        name: r.name,
        company: r.company,
        vars: r.vars,
        status: 'pending' as const,
        unsubToken: makeUnsubToken(r.email, cronSecret),
        assignedDomainId: null,
        templateId: null,
        consentBasis: null,
        region: null,
        attempts: 0,
        failReason: null,
        sentAt: null,
      }));
      await col.insertMany(docs);
    }
  }
  revalidatePath('/upload');
  return { imported: valid.length, errors };
}

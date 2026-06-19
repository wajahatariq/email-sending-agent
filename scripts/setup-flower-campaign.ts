/* eslint-disable no-console */
// One-shot: create the Flower Shops opener template + campaign under the
// LogicTech brand (brandId 2), cloning operational settings (business hours,
// caps, jitter, domains) from an existing campaign so behaviour matches.
// Recipients are uploaded separately via the app UI.
//
// Run:  npx tsx scripts/setup-flower-campaign.ts

import { existsSync } from 'node:fs';
import {
  templatesCol,
  campaignsCol,
  nextId,
  type TemplateDoc,
  type CampaignDoc,
} from '../src/db/collections';

if (existsSync('.env')) process.loadEnvFile('.env');

const BRAND_ID = 2; // LogicTech Digital
const CLONE_FROM_CAMPAIGN = 2; // Lawncare Campaign — copy its operational settings

const bodyHtml =
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222">\r\n` +
  `<p>Hi there,</p>\r\n` +
  `<p>Came across {{company}} while looking at florists. Quick thought — a clean, fast website with easy online ordering could turn more of your local "florist near me" and same-day-delivery searches into paid orders.</p>\r\n` +
  `<p>Happy to build one for you first so you can actually see it — free to look at. If you like it it's a one-off $99; if not, no worries — you owe nothing.</p>\r\n` +
  `<p>Want a peek at recent sites we've built? <a href="{{site}}">See our recent work →</a></p>\r\n` +
  `<p>Want me to put something together for {{company}}? Just reply here, call or text (505) 225-1906, or WhatsApp +1 (801) 980-0036.</p>\r\n` +
  `<p>Cheers,<br>LogicTech Digital</p>\r\n</div>\r\n`;

const bodyText =
  `Hi there,\r\n\r\n` +
  `Came across {{company}} while looking at florists. Quick thought - a clean, fast website with easy online ordering could turn more of your local "florist near me" and same-day-delivery searches into paid orders.\r\n\r\n` +
  `Happy to build one for you first so you can actually see it - free to look at. If you like it it's a one-off $99; if not, no worries - you owe nothing.\r\n\r\n` +
  `Want a peek at recent sites we've built? See our recent work: {{site}}\r\n\r\n` +
  `Want me to put something together for {{company}}? Just reply here, call or text (505) 225-1906, or WhatsApp +1 (801) 980-0036.\r\n\r\n` +
  `Cheers,\r\nLogicTech Digital\r\n`;

async function main() {
  const tCol = await templatesCol();
  const cCol = await campaignsCol();

  const clone = await cCol.findOne({ id: CLONE_FROM_CAMPAIGN });
  if (!clone) throw new Error(`clone-source campaign ${CLONE_FROM_CAMPAIGN} not found`);

  const templateId = await nextId('templates');
  const template: TemplateDoc = {
    id: templateId,
    brandId: BRAND_ID,
    label: 'Flower Shops — Free Website $99',
    subject: 'Quick idea for {{company}}',
    bodyHtml,
    bodyText,
    weight: 1,
    active: true,
  };
  await tCol.insertOne(template);
  console.log(`inserted template id=${templateId} "${template.label}"`);

  const campaignId = await nextId('campaigns');
  const campaign: CampaignDoc = {
    id: campaignId,
    brandId: BRAND_ID,
    name: 'Flower Shops Campaign',
    status: 'paused', // start paused; operator hits Start after uploading recipients
    bhStart: clone.bhStart,
    bhEnd: clone.bhEnd,
    timezone: clone.timezone,
    globalDailyCap: clone.globalDailyCap,
    perInboxCap: clone.perInboxCap,
    jitterPct: clone.jitterPct,
    templateIds: [templateId],
    domainIds: clone.domainIds ?? [],
    createdAt: new Date(),
  };
  await cCol.insertOne(campaign);
  console.log(`inserted campaign id=${campaignId} "${campaign.name}"`);
  console.log(
    `  brandId=${campaign.brandId} templateIds=${JSON.stringify(campaign.templateIds)} ` +
      `domainIds=${JSON.stringify(campaign.domainIds)} status=${campaign.status} ` +
      `cap=${campaign.globalDailyCap}`,
  );
  console.log('\nNext: upload leads/flower_shops_upload.csv as recipients to this campaign via the app UI.');
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

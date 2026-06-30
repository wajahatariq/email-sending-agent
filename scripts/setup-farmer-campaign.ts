/* eslint-disable no-console */
// One-shot: create the Farmers design-studio opener template + campaign under
// LogicTech (brandId 2). Pitch = logos / posters / labels / branding for farm
// businesses (NOT the $99 website offer). Cloning operational settings from an
// existing campaign. Recipients uploaded separately via the app UI.
//
// Run:  npx tsx scripts/setup-farmer-campaign.ts

import { existsSync } from 'node:fs';
import {
  templatesCol,
  campaignsCol,
  domainsCol,
  nextId,
  type TemplateDoc,
  type CampaignDoc,
} from '../src/db/collections';

if (existsSync('.env')) process.loadEnvFile('.env');

const BRAND_ID = 2;
const CLONE_FROM_CAMPAIGN = 2;

const bodyHtml =
  `<div style="margin:0;padding:0;background:#f4f4f7;">\r\n` +
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;"><tr><td align="center">\r\n` +
  `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">\r\n` +
  `<tr><td style="background:#111827;padding:20px 28px;"><span style="color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:.3px;">LogicTech&nbsp;Digital</span><span style="color:#9ca3af;font-size:12px;"> &middot; Design Studio</span></td></tr>\r\n` +
  `<tr><td style="padding:28px;color:#222222;font-size:15px;line-height:1.6;">\r\n` +
  `<p style="margin:0 0 14px;">Hi there,</p>\r\n` +
  `<p style="margin:0 0 14px;">Came across {{company}} and loved what you're growing. We're a design studio &mdash; we craft logos, posters, labels and packaging that make farm brands look as good as the produce they sell.</p>\r\n` +
  `<p style="margin:0 0 20px;">Happy to design a first concept for you so you can actually see it &mdash; free to look at. If you love it it&#39;s a one-off from <strong>$45</strong>; if not, no worries &mdash; you owe nothing.</p>\r\n` +
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;"><tr><td style="border-radius:8px;background:#4f46e5;"><a href="{{site}}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:15px;font-weight:bold;text-decoration:none;border-radius:8px;">See our recent work &rarr;</a></td></tr></table>\r\n` +
  `<p style="margin:0;">Want a concept for {{company}}? Just reply to this email &mdash; or reach us directly below.</p>\r\n` +
  `</td></tr>\r\n` +
  `<tr><td style="padding:0 28px 26px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #eeeeee;"><tr><td style="padding-top:16px;font-size:14px;color:#444444;line-height:1.9;">Call or text: <a href="tel:+15052251906" style="color:#4f46e5;text-decoration:none;">(505) 225-1906</a><br>WhatsApp: <a href="https://wa.me/18019800036" style="color:#4f46e5;text-decoration:none;">+1 (801) 980-0036</a><br>Website: <a href="{{site}}" style="color:#4f46e5;text-decoration:none;">logictechdigital.com</a></td></tr></table>\r\n` +
  `<p style="margin:16px 0 0;color:#555555;font-size:14px;">Cheers,<br>LogicTech Digital</p></td></tr>\r\n` +
  `</table></td></tr></table></div>\r\n`;

const bodyText =
  `Hi there,\r\n\r\n` +
  `Came across {{company}} and loved what you're growing. We're a design studio - we craft logos, posters, labels and packaging that make farm brands look as good as the produce they sell.\r\n\r\n` +
  `Happy to design a first concept for you so you can actually see it - free to look at. If you love it it's a one-off from $45; if not, no worries - you owe nothing.\r\n\r\n` +
  `See our recent work: {{site}}\r\n\r\n` +
  `Want a concept for {{company}}? Just reply to this email - or reach us directly:\r\n` +
  `Call or text: (505) 225-1906\r\nWhatsApp: +1 (801) 980-0036\r\nWebsite: logictechdigital.com\r\n\r\n` +
  `Cheers,\r\nLogicTech Digital\r\n`;

async function main() {
  const tCol = await templatesCol();
  const cCol = await campaignsCol();
  const dCol = await domainsCol();

  const clone = await cCol.findOne({ id: CLONE_FROM_CAMPAIGN });
  if (!clone) throw new Error(`clone-source campaign ${CLONE_FROM_CAMPAIGN} not found`);

  const domainIds = (await dCol.find({ brandId: BRAND_ID }).project({ id: 1, _id: 0 }).toArray())
    .map((d) => (d as { id: number }).id)
    .sort((a, b) => a - b);

  const templateId = await nextId('templates');
  const template: TemplateDoc = {
    id: templateId,
    brandId: BRAND_ID,
    label: 'Farmers — Design Studio (logos/posters)',
    subject: 'A fresh look for {{company}}',
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
    name: 'Farmers — Design Studio Campaign',
    status: 'paused',
    bhStart: clone.bhStart,
    bhEnd: clone.bhEnd,
    timezone: clone.timezone,
    globalDailyCap: clone.globalDailyCap,
    perInboxCap: clone.perInboxCap,
    jitterPct: clone.jitterPct,
    templateIds: [templateId],
    domainIds,
    createdAt: new Date(),
  };
  await cCol.insertOne(campaign);
  console.log(`inserted campaign id=${campaignId} "${campaign.name}"`);
  console.log(`  brandId=${campaign.brandId} templateIds=[${templateId}] domainIds=[${domainIds.join(',')}] status=paused cap=${campaign.globalDailyCap}`);
  console.log('\nNext: upload leads/farmers_upload.csv as recipients to this campaign via the app UI.');
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

/* eslint-disable no-console */
// Add the async hard-bounced addresses to the suppression list so they are
// never sent again (the send engine skips any address in `suppression`).
// Mirrors the app's own suppress(): upsert with $setOnInsert.
//
// Run:  npx tsx scripts/suppress-bounces.ts

import { existsSync } from 'node:fs';
import { getDb } from '../src/db/client';
import type { SuppressionDoc } from '../src/db/collections';

if (existsSync('.env')) process.loadEnvFile('.env');

const BOUNCED = [
  'contact@agreenerview.com.au',
  'info@likemowing.com.au',
  'info@rcciviloz.com.au',
];

async function main() {
  const db = await getDb();
  const supp = db.collection<SuppressionDoc>('suppression');
  for (const email of BOUNCED) {
    const id = email.toLowerCase();
    await supp.updateOne(
      { _id: id },
      { $setOnInsert: { reason: 'bounce', ts: new Date() } },
      { upsert: true },
    );
    console.log('suppressed ' + id);
  }
  const total = await supp.countDocuments({});
  console.log('suppression list size: ' + total);
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

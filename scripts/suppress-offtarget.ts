/* eslint-disable no-console */
// Suppress off-target captures (industry assoc / marketplace / directory /
// wrong-niche) so they get no follow-ups and future runs skip them.
// Mirrors suppress(): upsert with $setOnInsert.
//
// Run:  npx tsx scripts/suppress-offtarget.ts

import { existsSync } from 'node:fs';
import { getDb } from '../src/db/client';

if (existsSync('.env')) process.loadEnvFile('.env');

const OFFTARGET = [
  'wml@wml.com.au',            // AFPA — industry association
  'enquiries@afpa.asn.au',     // AFPA — industry association
  'projects@iseekplant.com.au',// iSeekPlant — marketplace
  'advertise@top5guide.com.au',// Top5Guide — directory
  'waterworxpc@gmail.com',     // Waterworx — pressure cleaning, wrong niche
];

async function main() {
  const db = await getDb();
  const supp = db.collection('suppression');
  for (const email of OFFTARGET) {
    const id = email.toLowerCase();
    await supp.updateOne(
      { _id: id },
      { $setOnInsert: { reason: 'off-target', ts: new Date() } },
      { upsert: true },
    );
    console.log('suppressed ' + id);
  }
  const total = await supp.countDocuments({});
  console.log('suppression list size: ' + total);
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

/* eslint-disable no-console */
// One-off: enable IMAP reply-polling on the LogicTech sending domains.
// Hostinger uses the same password for SMTP and IMAP, so we copy the already-
// stored (prod-key-encrypted) smtpPassEnc into imapPassEnc — no key needed.
//
// Run:  npx tsx scripts/enable-imap.ts

import { existsSync } from 'node:fs';
import { getDb } from '../src/db/client';

if (existsSync('.env')) process.loadEnvFile('.env');

async function main() {
  const db = await getDb();
  const res = await db.collection('domains').updateMany(
    { fromEmail: { $regex: 'logictechdigital\\.com$' }, imapPassEnc: { $exists: false } },
    [
      {
        $set: {
          imapHost: 'imap.hostinger.com',
          imapPort: 993,
          imapUser: '$fromEmail',
          imapPassEnc: '$smtpPassEnc',
        },
      },
    ],
  );
  console.log('IMAP enabled on ' + res.modifiedCount + ' domain(s).');
  console.log('Now open /replies in the dashboard and click "Check Replies".');
  process.exit(0);
}

main().catch((e) => { console.error('FATAL', e); process.exit(1); });

import { config } from 'dotenv';
// Load .env.local first (Next.js convention for local secrets), then .env.
config({ path: '.env.local' });
config();
import { getDb } from './client';

export async function ensureIndexes(): Promise<void> {
  const db = await getDb();

  // Unique integer-id indexes for entity collections
  await db.collection('domains').createIndex({ id: 1 }, { unique: true });
  await db.collection('templates').createIndex({ id: 1 }, { unique: true });
  await db.collection('campaigns').createIndex({ id: 1 }, { unique: true });
  await db.collection('recipients').createIndex({ id: 1 }, { unique: true });

  // Query-pattern indexes
  await db.collection('recipients').createIndex({ campaignId: 1, status: 1 });
  await db.collection('recipients').createIndex({ email: 1 });
  await db.collection('send_log').createIndex({ ts: -1 });
  await db.collection('counters').createIndex({ domainId: 1, day: 1 });

  // replies: dedup by (domainId, imapUid); list newest-first
  await db.collection('replies').createIndex(
    { domainId: 1, imapUid: 1 },
    { unique: true },
  );
  await db.collection('replies').createIndex({ receivedAt: -1 });

  // suppression: keyed by _id (email) — no extra index needed
  // counters: also keyed by _id — compound index above covers query pattern

  console.log('MongoDB indexes ensured.');
}

// Run when executed directly via tsx
ensureIndexes()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ensureIndexes failed:', err);
    process.exit(1);
  });

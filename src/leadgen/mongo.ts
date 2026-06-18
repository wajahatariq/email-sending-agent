import { MongoClient, type Db, type Collection } from "mongodb";
import type { Lead } from "./types";
import { makeUnsubToken } from "./token";

// ---------------------------------------------------------------------------
// Connection (cached across hot reloads / requests).
// Mongo is optional: if MONGODB_URI is unset, every helper degrades to a safe
// no-op (nothing suppressed, nothing deduped, nothing stored) so the crawler
// still runs standalone.
// ---------------------------------------------------------------------------

const URI = process.env.MONGODB_URI || "";
const DB_NAME = process.env.MONGODB_DB || "email_sending_agent";

let clientPromise: Promise<MongoClient> | null = null;
let disabled = false; // set if a connection attempt fails — degrade to no-op

export function mongoEnabled(): boolean {
  return URI.length > 0 && !disabled;
}

async function getDb(): Promise<Db | null> {
  if (!URI || disabled) return null;
  if (!clientPromise) {
    const client = new MongoClient(URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 8000,
    });
    clientPromise = client.connect();
  }
  try {
    const client = await clientPromise;
    return client.db(DB_NAME);
  } catch (err) {
    // Connection failed (bad URI, IP not allowlisted, etc). Disable Mongo for
    // the rest of the run rather than killing extraction.
    disabled = true;
    clientPromise = null;
    console.error(
      "[mongo] disabled — connection failed: " + (err as Error).message
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Collection docs
// ---------------------------------------------------------------------------

export interface ExtractionRunDoc {
  id: number;
  country: string;
  nichePrompt: string;
  createdAt: Date;
  leadCount: number;
}

export interface ExtractedLeadDoc {
  _id: string; // lowercased email -> free global dedupe across runs
  runId: number;
  name: string;
  company: string;
  emailType: string;
  sourceUrl: string;
  domain: string;
  region: string;
  createdAt: Date;
}

async function runsCol(): Promise<Collection<ExtractionRunDoc> | null> {
  const db = await getDb();
  return db ? db.collection<ExtractionRunDoc>("extraction_runs") : null;
}

async function leadsCol(): Promise<Collection<ExtractedLeadDoc> | null> {
  const db = await getDb();
  return db ? db.collection<ExtractedLeadDoc>("extracted_leads") : null;
}

// Sender's suppression collection (_id = lowercased email).
interface SuppressionDoc {
  _id: string;
}
async function suppressionCol(): Promise<Collection<SuppressionDoc> | null> {
  const db = await getDb();
  return db ? db.collection<SuppressionDoc>("suppression") : null;
}

// ---------------------------------------------------------------------------
// Integer-sequence helper (mirrors the sender's nextIdBlock / _sequences).
// Reserves a block of `count` ids and returns the first id of the block.
// ---------------------------------------------------------------------------

// Mirrors the sender's nextIdBlock EXACTLY (src/db/collections.ts): same
// `_sequences` collection, same `seq` field, same return (first id of block).
// Using the identical field name is REQUIRED — `recipients.id` has a unique
// index in the sender DB, so a divergent counter would cause id collisions.
export async function nextIdBlock(name: string, count: number): Promise<number> {
  const db = await getDb();
  if (!db) {
    // Standalone fallback: only used when Mongo is off, in which case push
    // mode is unavailable anyway.
    return Date.parse(new Date().toISOString());
  }
  const seq = db.collection<{ _id: string; seq: number }>("_sequences");
  const res = await seq.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: "after" }
  );
  return (res!.seq as number) - count + 1;
}

// ---------------------------------------------------------------------------
// Suppression + dedupe reads (used in BOTH export and push modes)
// ---------------------------------------------------------------------------

// True if the email is already extracted (this tool) OR suppressed (sender).
export async function isSkippable(email: string): Promise<boolean> {
  const lower = email.toLowerCase();
  const [leads, supp] = await Promise.all([leadsCol(), suppressionCol()]);
  if (!leads && !supp) return false; // mongo off -> never skip
  const checks: Promise<unknown>[] = [];
  if (leads) checks.push(leads.findOne({ _id: lower }, { projection: { _id: 1 } }));
  if (supp) checks.push(supp.findOne({ _id: lower }, { projection: { _id: 1 } }));
  const results = await Promise.all(checks);
  return results.some((r) => r != null);
}

export async function isSuppressed(email: string): Promise<boolean> {
  const supp = await suppressionCol();
  if (!supp) return false;
  const hit = await supp.findOne({ _id: email.toLowerCase() }, { projection: { _id: 1 } });
  return hit != null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createRun(country: string, nichePrompt: string): Promise<number> {
  const runs = await runsCol();
  const id = await nextIdBlock("extraction_runs", 1);
  if (runs) {
    await runs.insertOne({
      id,
      country,
      nichePrompt,
      createdAt: new Date(),
      leadCount: 0,
    });
  }
  return id;
}

// Insert a lead. Returns false if it already existed (dup key) -> caller skips.
export async function storeLead(runId: number, lead: Lead): Promise<boolean> {
  const leads = await leadsCol();
  if (!leads) return true; // mongo off -> treat as stored
  try {
    await leads.insertOne({
      _id: lead.email,
      runId,
      name: lead.name,
      company: lead.company,
      emailType: lead.emailType,
      sourceUrl: lead.sourceUrl,
      domain: lead.domain,
      region: lead.region,
      createdAt: new Date(),
    });
    return true;
  } catch (err: unknown) {
    // Duplicate key -> already extracted.
    if (typeof err === "object" && err && (err as { code?: number }).code === 11000) {
      return false;
    }
    throw err;
  }
}

export async function finalizeRun(runId: number, leadCount: number): Promise<void> {
  const runs = await runsCol();
  if (runs) await runs.updateOne({ id: runId }, { $set: { leadCount } });
}

// Fetch all leads for a run (used by CSV export + push).
export async function getRunLeads(runId: number): Promise<ExtractedLeadDoc[]> {
  const leads = await leadsCol();
  if (!leads) return [];
  return leads.find({ runId }).toArray();
}

// ---------------------------------------------------------------------------
// Push mode: insert pending recipients straight into the sender's `recipients`
// collection (shape mirrors the sender's RecipientDoc), applying suppression.
// ---------------------------------------------------------------------------

interface RecipientDoc {
  id: number;
  campaignId: number;
  email: string;
  name: string;
  company: string;
  vars: Record<string, unknown>;
  status: string;
  assignedDomainId: number | null;
  templateId: number | null;
  unsubToken: string;
  consentBasis: string;
  region: string;
  attempts: number;
  failReason: string | null;
  sentAt: Date | null;
}

export async function pushRecipients(
  runId: number,
  campaignId: number
): Promise<{ inserted: number; skipped: number }> {
  const db = await getDb();
  if (!db) throw new Error("MONGODB_URI not configured");

  const leads = await getRunLeads(runId);
  if (leads.length === 0) return { inserted: 0, skipped: 0 };

  // Suppression filter (sender's unsubscribe list).
  const kept: ExtractedLeadDoc[] = [];
  let skipped = 0;
  for (const l of leads) {
    if (await isSuppressed(l._id)) {
      skipped++;
      continue;
    }
    kept.push(l);
  }
  if (kept.length === 0) return { inserted: 0, skipped };

  const recipients = db.collection<RecipientDoc>("recipients");
  const firstId = await nextIdBlock("recipients", kept.length);

  const docs: RecipientDoc[] = kept.map((l, i) => ({
    id: firstId + i,
    campaignId,
    email: l._id,
    name: l.name,
    company: l.company,
    vars: {},
    status: "pending",
    assignedDomainId: null,
    templateId: null,
    unsubToken: makeUnsubToken(l._id),
    consentBasis: "legitimate_interest_b2b",
    region: l.region,
    attempts: 0,
    failReason: null,
    sentAt: null,
  }));

  try {
    const res = await recipients.insertMany(docs, { ordered: false });
    return { inserted: res.insertedCount, skipped };
  } catch (err: unknown) {
    // partial success on duplicate-key etc.
    const inserted = (err as { result?: { insertedCount?: number } })?.result?.insertedCount ?? 0;
    return { inserted, skipped: skipped + (kept.length - inserted) };
  }
}

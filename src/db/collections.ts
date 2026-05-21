import { Collection, ObjectId } from 'mongodb';
import { getDb } from './client';

// ---------------------------------------------------------------------------
// Document interfaces
// ---------------------------------------------------------------------------

export interface DomainDoc {
  _id?: ObjectId;
  id: number;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPassEnc: string;
  dailyCap: number;
  warmupStartDate: string; // 'YYYY-MM-DD'
  status: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
}

export interface TemplateDoc {
  _id?: ObjectId;
  id: number;
  label: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  weight: number;
  active: boolean;
}

export interface CampaignDoc {
  _id?: ObjectId;
  id: number;
  name: string;
  status: string;
  bhStart: number;
  bhEnd: number;
  timezone: string;
  globalDailyCap: number;
  perInboxCap: number;
  jitterPct: number;
  createdAt: Date;
}

export interface RecipientDoc {
  _id?: ObjectId;
  id: number;
  campaignId: number;
  email: string;
  name: string;
  company: string;
  vars: Record<string, string>;
  status: string;
  assignedDomainId: number | null;
  templateId: number | null;
  unsubToken: string;
  consentBasis: string | null;
  region: string | null;
  attempts: number;
  failReason: string | null;
  sentAt: Date | null;
}

export interface SendLogDoc {
  // Uses ObjectId _id — no integer id
  recipientId: number;
  domainId: number;
  templateId: number | null;
  smtpResponse: string | null;
  status: string;
  ts: Date;
}

export interface SuppressionDoc {
  _id: string; // lowercased email IS the _id
  reason: string;
  ts: Date;
}

export interface CounterDoc {
  _id: string; // `${domainId}:${day}`
  domainId: number;
  day: string; // 'YYYY-MM-DD'
  sentCount: number;
}

// ---------------------------------------------------------------------------
// Typed collection accessors
// ---------------------------------------------------------------------------

export async function domainsCol(): Promise<Collection<DomainDoc>> {
  return (await getDb()).collection<DomainDoc>('domains');
}

export async function templatesCol(): Promise<Collection<TemplateDoc>> {
  return (await getDb()).collection<TemplateDoc>('templates');
}

export async function campaignsCol(): Promise<Collection<CampaignDoc>> {
  return (await getDb()).collection<CampaignDoc>('campaigns');
}

export async function recipientsCol(): Promise<Collection<RecipientDoc>> {
  return (await getDb()).collection<RecipientDoc>('recipients');
}

export async function sendLogCol(): Promise<Collection<SendLogDoc>> {
  return (await getDb()).collection<SendLogDoc>('send_log');
}

export async function suppressionCol(): Promise<Collection<SuppressionDoc>> {
  return (await getDb()).collection<SuppressionDoc>('suppression');
}

export async function countersCol(): Promise<Collection<CounterDoc>> {
  return (await getDb()).collection<CounterDoc>('counters');
}

// ---------------------------------------------------------------------------
// Atomic integer sequence helper (auto-increment for integer ids)
// ---------------------------------------------------------------------------

export async function nextId(name: string): Promise<number> {
  const db = await getDb();
  const seq = db.collection<{ _id: string; seq: number }>('_sequences');
  const res = await seq.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' },
  );
  return res!.seq;
}

/**
 * Reserve a contiguous block of `count` integer ids in a single atomic op.
 * Returns the FIRST id of the block (block is [start, start+count-1]).
 */
export async function nextIdBlock(name: string, count: number): Promise<number> {
  const db = await getDb();
  const seq = db.collection<{ _id: string; seq: number }>('_sequences');
  const res = await seq.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: count } },
    { upsert: true, returnDocument: 'after' },
  );
  return res!.seq - count + 1;
}

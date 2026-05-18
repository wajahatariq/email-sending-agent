import { pgTable, serial, text, integer, timestamp, boolean, jsonb, uniqueIndex, date } from 'drizzle-orm/pg-core';

export const domains = pgTable('domains', {
  id: serial('id').primaryKey(),
  fromName: text('from_name').notNull(),
  fromEmail: text('from_email').notNull(),
  smtpHost: text('smtp_host').notNull(),
  smtpPort: integer('smtp_port').notNull(),
  smtpUser: text('smtp_user').notNull(),
  smtpPassEnc: text('smtp_pass_enc').notNull(),
  dailyCap: integer('daily_cap').notNull().default(40),
  warmupStartDate: date('warmup_start_date').notNull(),
  status: text('status').notNull().default('paused'),
  spfVerified: boolean('spf_verified').notNull().default(false),
  dkimVerified: boolean('dkim_verified').notNull().default(false),
  dmarcVerified: boolean('dmarc_verified').notNull().default(false),
});

export const templates = pgTable('templates', {
  id: serial('id').primaryKey(),
  label: text('label').notNull(),
  subject: text('subject').notNull(),
  bodyHtml: text('body_html').notNull(),
  bodyText: text('body_text').notNull(),
  weight: integer('weight').notNull().default(1),
  active: boolean('active').notNull().default(true),
});

export const campaigns = pgTable('campaigns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  bhStart: integer('bh_start').notNull().default(9),
  bhEnd: integer('bh_end').notNull().default(17),
  timezone: text('timezone').notNull().default('UTC'),
  globalDailyCap: integer('global_daily_cap').notNull().default(200),
  perInboxCap: integer('per_inbox_cap').notNull().default(40),
  jitterPct: integer('jitter_pct').notNull().default(30),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const recipients = pgTable('recipients', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').notNull(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  company: text('company').notNull().default(''),
  vars: jsonb('vars').$type<Record<string, string>>().notNull().default({}),
  status: text('status').notNull().default('pending'),
  assignedDomainId: integer('assigned_domain_id'),
  templateId: integer('template_id'),
  unsubToken: text('unsub_token').notNull(),
  consentBasis: text('consent_basis'),
  region: text('region'),
  attempts: integer('attempts').notNull().default(0),
  failReason: text('fail_reason'),
  sentAt: timestamp('sent_at'),
});

export const sendLog = pgTable('send_log', {
  id: serial('id').primaryKey(),
  recipientId: integer('recipient_id').notNull(),
  domainId: integer('domain_id').notNull(),
  templateId: integer('template_id'),
  smtpResponse: text('smtp_response'),
  status: text('status').notNull(),
  ts: timestamp('ts').notNull().defaultNow(),
});

export const suppression = pgTable('suppression', {
  email: text('email').primaryKey(),
  reason: text('reason').notNull(),
  ts: timestamp('ts').notNull().defaultNow(),
});

export const counters = pgTable('counters', {
  domainId: integer('domain_id').notNull(),
  day: date('day').notNull(),
  sentCount: integer('sent_count').notNull().default(0),
}, (t) => ({ pk: uniqueIndex('counters_domain_day').on(t.domainId, t.day) }));

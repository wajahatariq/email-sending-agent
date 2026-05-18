CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"bh_start" integer DEFAULT 9 NOT NULL,
	"bh_end" integer DEFAULT 17 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"global_daily_cap" integer DEFAULT 200 NOT NULL,
	"per_inbox_cap" integer DEFAULT 40 NOT NULL,
	"jitter_pct" integer DEFAULT 30 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"domain_id" integer NOT NULL,
	"day" date NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"smtp_host" text NOT NULL,
	"smtp_port" integer NOT NULL,
	"smtp_user" text NOT NULL,
	"smtp_pass_enc" text NOT NULL,
	"daily_cap" integer DEFAULT 40 NOT NULL,
	"warmup_start_date" date NOT NULL,
	"status" text DEFAULT 'paused' NOT NULL,
	"spf_verified" boolean DEFAULT false NOT NULL,
	"dkim_verified" boolean DEFAULT false NOT NULL,
	"dmarc_verified" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"vars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_domain_id" integer,
	"template_id" integer,
	"unsub_token" text NOT NULL,
	"consent_basis" text,
	"region" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"fail_reason" text,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "send_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_id" integer NOT NULL,
	"domain_id" integer NOT NULL,
	"template_id" integer,
	"smtp_response" text,
	"status" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "counters_domain_day" ON "counters" USING btree ("domain_id","day");
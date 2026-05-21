# Email Sending Agent — Design Spec

**Date:** 2026-05-19
**Status:** Approved (brainstorming), pending user spec review
**Owner:** wajahat@austrowebnlogo.com (Austro Web n Logo)

## 1. Purpose

An automated cold-outreach sending engine whose primary job is **deliverability protection**: keep sending domains out of spam folders and prevent domain reputation damage through enforced daily caps, warmup ramps, human-like timing, domain/inbox rotation, A/B template rotation, suppression, and compliance.

The agent does **not** write copy, source leads, or read replies. The operator supplies a recipient CSV and a small set of A/B templates; the engine handles paced, compliant delivery across multiple authenticated sending domains.

### Non-goals (YAGNI)

- AI-generated per-lead copywriting
- Reply detection / inbox reading / conversation handling *(added post-v1 — see §11)*
- Lead sourcing or third-party email verification
- Multi-tenant SaaS, advanced analytics beyond the send log
- Inbox-read bounce processing (optional future enhancement)

### Explicit constraint: legitimacy over evasion

The engine **does not** rotate IPs or use any technique whose purpose is to evade spam filters or hide sender identity. IP rotation against filters is a spammer signal and damages deliverability. Durable inbox placement comes only from authentication, reputation, list hygiene, low complaint rates, and consistent volume. Domain/inbox rotation in this design exists for **volume spreading and reputation risk isolation**, with truthful, consistent sender identity on every domain — not concealment.

## 2. Scale & Context

- Category: cold B2B outreach
- Steady-state volume: 50–500 emails/day
- Sending identity: multiple registered domains related to the Austro Web n Logo brand, each with its own SMTP credentials provided by the operator. Primary brand domain (`austrowebnlogo.com`) is **not** used for cold sending; dedicated secondary domains are.
- Each domain must have valid SPF, DKIM, and DMARC before it may send.

## 3. Architecture

Next.js (App Router) deployed on Vercel. Serverless — no long-running process. Three surfaces:

1. **Dashboard (UI)** — CSV upload; manage sending domains and SMTP creds; manage A/B templates; configure caps, business-hours window, timezone, jitter; Start/Stop campaign; view send log, counters, and domain health.
2. **`/api/tick` (cron worker)** — stateless drip worker invoked by Vercel Cron every ~10 minutes. Reads state, computes allowance, sends a bounded batch, updates state, exits within the 300s function limit.
3. **MongoDB Atlas (via the official `mongodb` driver)** — single source of truth for all state.

Sending uses `nodemailer` over per-domain SMTP, on the Node.js runtime (Fluid Compute, not edge).

**Orchestration approach: A — Cron-ticked stateless drip.** "Start" flips campaign status to `active` in the database; the cron tick performs all paced sending. Human-like timing is emergent from frequent small ticks + jitter + caps.

### Platform requirements / honest constraints

- Sub-daily Vercel Cron requires the **Vercel Pro plan** (Hobby cron ≈ once/day, too coarse).
- Each tick sends a **bounded batch** sized to finish well under the 300s function timeout; remainder waits for the next tick.
- Vercel has no persistent local disk — all state lives in MongoDB Atlas.

## 4. Data Model

**Implementation note (2026-05-22):** migrated from Postgres to MongoDB Atlas. The 7 tables below are implemented as MongoDB collections (`domains`, `templates`, `campaigns`, `recipients`, `send_log`, `suppression`, `counters`). Integer primary keys are preserved via an atomic `_sequences` collection. `suppression` is keyed by the lowercased email as `_id`; `counters` is keyed by `${domainId}:${day}` as `_id`. The Postgres `ON CONFLICT` atomic counter is now an atomic `$inc` upsert; the single-transaction `db.batch` writes are now MongoDB multi-document transactions.

- **`domains`** — id, from_name, from_email, smtp_host, smtp_port, smtp_user, `smtp_pass_encrypted`, daily_cap, warmup_start_date, status (active/paused), spf_verified, dkim_verified, dmarc_verified
- **`templates`** — id, label, subject, body_html, body_text, weight, active
- **`campaigns`** — id, name, status (draft/active/paused/done), business_hours_start, business_hours_end, timezone, global_daily_cap, per_inbox_cap, jitter_pct, created_at
- **`recipients`** — id, campaign_id, email, name, company, vars (json), status (pending/sent/failed/suppressed/unsubscribed), assigned_domain_id, template_id, sent_at, fail_reason, attempts, consent_basis, region
- **`send_log`** — id, recipient_id, domain_id, template_id, smtp_response, status, ts
- **`suppression`** — email (unique), reason (bounce/unsubscribe/manual/complaint), ts. Global; checked before every send.
- **`counters`** — (domain_id, date) → sent_count. Enforces per-domain daily cap atomically.

## 5. Deliverability Engine (per active campaign, per tick)

1. **Window check** — within campaign business hours for its timezone? Else skip.
2. **Eligible domains** — status=active, SPF+DKIM+DMARC verified, today's `counters` < min(daily_cap, warmup limit for domain's warmup-day).
3. **Warmup ramp** — per domain from warmup_start_date: day1 ≈ 10, then ×1.4–1.6/day (e.g. 10 → 15 → 22 → 33 …), hard-capped at daily_cap. New domains auto-throttled.
4. **Tick allowance** — remaining daily budget spread across remaining ticks in today's window, ± jitter_pct (default ±30%), so sends scatter rather than burst. Batch capped to stay under function timeout.
5. **Select recipients** — status=pending, not in suppression, deduped, randomized order.
6. **Rotate** — round-robin across eligible domains (load balance + risk isolation); weighted-random template (A/B footprint reduction).
7. **Send** — via that domain's SMTP, with inter-send micro-jitter within the batch.
8. **Record** — write send_log, set recipient status/sent_at/template/domain, increment `counters` via an atomic `$inc` upsert (keyed `${domainId}:${day}`), all wrapped in a MongoDB multi-document transaction (prevents cap overrun under concurrent/overlapping ticks).
9. **Stop conditions** — campaign → done when no pending recipients; domain → auto-paused on auth failure or hard-bounce rate over threshold.

### Data flow

CSV upload → parse / validate / dedupe → `recipients(pending)`. Click **Start** → `campaign.status=active`. Cron tick → engine drips per rules → state updated. **Stop** → `status=paused` (tick skips paused). All decisions auditable via `send_log` + `counters`.

## 6. Compliance (enforced, not optional)

- Every email includes: real company name, valid physical postal address in footer, working unsubscribe — one-click `List-Unsubscribe` header + mailto + link.
- **`/api/unsub?token=`** → adds email to `suppression(unsubscribe)` instantly, no login. Honored globally and permanently.
- No deception: From name/domain tied to a real entity; subject not misleading.
- Jurisdiction: CAN-SPAM (US) baseline by default. `consent_basis` + `region` fields per recipient; a hard toggle blocks sending to EU/Canada-flagged rows lacking a consent basis (GDPR/CASL require prior consent). The engine enforces this; it does not bypass it. **(v1 deviation — see §11: ships as schema fields + operator responsibility; engine-side enforcement deferred, owner-accepted.)**
- Suppression check is the **first** step before any send. Unsub/bounce/complaint addresses are never re-contacted.

## 7. Security / Secret Handling

- **SMTP passwords**: never plaintext at rest. AES-256-GCM, key from Vercel env `SMTP_ENC_KEY`. Decrypted only in `/api/tick` memory at send time. Write-only in UI (shows set/unset, never returns the value).
- **Dashboard auth**: protected — single-user credential via env (Clerk via Marketplace if multi-user later).
- **Endpoints**: only `/api/unsub` (token-scoped) and `/api/tick` are unauthenticated by session; `/api/tick` requires `Authorization: Bearer $CRON_SECRET` and rejects otherwise.
- **CSV upload**: size limit, header validation, email-syntax validation, strip CSV-formula and CRLF/header-injection in name/company fields.
- All secrets via Vercel env; never committed. `.env.example` only.

## 8. Error Handling

- **SMTP soft fail** (4xx/timeout): recipient stays `pending`, `attempts++`, retried next tick, max 3 → `failed`.
- **SMTP hard fail** (5xx / bad mailbox): recipient → `failed`, email → `suppression(bounce)`.
- **Domain hard-bounce rate** over threshold (default 5% of that domain's sends): domain auto-paused, dashboard alert. Reputation protection — core goal. **(v1 deviation — see §11: rate-based domain auto-pause deferred to v2, owner-accepted; per-recipient hard-bounce suppression IS implemented.)**
- **Auth missing** (SPF/DKIM/DMARC unverified): domain blocked from sending until verified (pre-send guard).
- **Cron overrun guard**: batch sized to complete < 300s; remainder waits next tick.
- **Concurrency**: counter increment via atomic `$inc` upsert inside a MongoDB multi-document transaction → no cap overrun on overlapping ticks.
- Every failure logged with reason in `send_log`.

## 9. Testing

- **Unit**: warmup-ramp math; tick-allowance/jitter; cap enforcement; rotation fairness; suppression filter; template-token render; encrypt/decrypt roundtrip; CSV validator (injection cases).
- **Integration**: `/api/tick` against a test Postgres + fake SMTP (nodemailer test account or local Mailpit) — caps respected across a simulated multi-tick day; warmup ramp; suppression honored; paused campaign skipped; concurrent-tick no overrun.
- **Compliance test**: rendered email always carries unsubscribe header + physical address; unsub endpoint suppresses.
- **No real sends in tests** — SMTP transport mocked or pointed at a local sink.

## 10. Open Items for Implementation Planning

- Exact warmup curve constants and per-inbox default caps (tunable config).
- Dashboard auth mechanism choice (env credential vs Clerk) — env credential for v1.
- MongoDB Atlas provisioning via Vercel Marketplace or atlas.mongodb.com.
- Concrete cron interval and business-hours defaults.

## 11. v1 Implementation Deviations (owner-accepted 2026-05-19)

The following two spec requirements ship deferred in v1, explicitly accepted by the owner (wajahat@austrowebnlogo.com) after the final implementation review. They are documented here so the spec and the shipped code do not silently diverge.

1. **GDPR/CASL consent enforcement (§6).** The spec states the engine enforces blocking of EU/Canada-flagged recipients lacking a `consent_basis`. v1 ships the `consent_basis` and `region` columns on `recipients` but does **not** filter on them in the send path (`getPendingRecipients`). Honoring consent for EU/CA recipients is the operator's responsibility in v1 (also stated in the README). Engine-side enforcement is a planned v2 addition: a `consent_basis`-aware filter in `getPendingRecipients`.

2. **Domain hard-bounce-rate auto-pause (§8).** The spec calls for auto-pausing a domain when its hard-bounce rate exceeds a threshold. v1 implements per-recipient hard-bounce suppression (the recipient is suppressed and a `fail-hard` audit row written) and SMTP-config-failure domain pause, but **not** aggregate bounce-rate-based domain pause. Deferred to v2.

Neither deferral affects the cap, suppression, authentication-gating, secret-handling, one-click-unsubscribe, mandatory-footer, or no-IP-evasion guarantees, all of which are implemented and tested.

3. **DB engine changed to MongoDB Atlas (2026-05-22)** at owner request — replaces Postgres/Neon/Drizzle. Cap-enforcement guarantees are preserved (atomic `$inc` upsert + multi-doc transactions). No deliverability behavior changed.

4. **Reply ingestion added post-v1 (2026-05-22)** at owner request. Originally a non-goal (§1), reply ingestion is now implemented as a read-only IMAP polling feature:
   - Each sending domain/account can optionally carry IMAP credentials (`imapHost`, `imapPort`, `imapUser`, `imapPassEnc`), set via the `/domains` form. The IMAP password is AES-encrypted at rest with the same `SMTP_ENC_KEY`.
   - `/api/poll-replies` — Bearer `CRON_SECRET`-authenticated endpoint (same auth pattern as `/api/tick`). Connects to each configured account's IMAP INBOX, fetches messages with UID greater than the stored per-account cursor, parses them, matches sender From-address to campaign recipient email addresses, and stores results in a new `replies` MongoDB collection (deduplicated on `(domainId, imapUid)`). Matched recipients have `repliedAt` stamped on the `recipients` document.
   - `/replies` dashboard page — lists the latest 200 ingested replies (matched and unmatched) and provides a **Check Replies Now** manual trigger button.
   - Polling is triggered manually via the button or by an external scheduler hitting `/api/poll-replies` with `Authorization: Bearer <CRON_SECRET>` — exactly the same operator pattern as `/api/tick` for outbound sends.
   - No new environment variables — reuses `CRON_SECRET` and `SMTP_ENC_KEY`.
   - Scope: read-only ingestion only. No auto-replies are sent, and there is no conversation threading beyond storing `In-Reply-To` / `messageId` headers on ingested reply documents.

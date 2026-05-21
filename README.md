# Email Sending Agent

## Overview

A cold-outreach sending engine built on Next.js 15 App Router, Drizzle ORM, Neon Postgres, and nodemailer. It protects sender-domain reputation through per-domain daily caps, warmup ramp-up, SMTP-credential rotation, hard-bounce suppression, and mandatory CAN-SPAM footer compliance. The architecture is fully serverless and operator-driven: pressing **Start** on a campaign flips its status to `active`, then pressing the **Send Now** button on the dashboard fires one batch (caps, warmup, rotation, and suppression all enforced). Click again to send more. Designed to run on the Vercel **Hobby (free)** plan — no cron required.

---

## Prerequisites

- **Node >= 20** (enforced in `package.json` `engines`)
- **Vercel Hobby (free) plan is sufficient.** Sending is triggered manually from the dashboard ("Send Now" button) — no scheduled cron is required.
- Vercel CLI: `npm i -g vercel`

---

## 1. Provision the Database

Neon Postgres is provisioned through the Vercel Marketplace (no separate Neon account required):

1. Open your Vercel dashboard → **Storage** → **Connect Store** → choose **Neon**.
2. Link it to this project.
3. Pull the env vars locally:
   ```bash
   vercel link
   vercel env pull .env.local
   ```
   This writes `DATABASE_URL` (and any other Neon vars) into `.env.local`.

---

## 2. Generate Secrets

Generate cryptographically random values for the two application secrets:

```bash
# 256-bit AES key for encrypting SMTP credentials at rest
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# → set as SMTP_ENC_KEY

# Bearer token for protecting the /api/tick cron endpoint
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
# → set as CRON_SECRET
```

---

## 3. Environment Variables

Set every variable below both in Vercel and locally in `.env.local`.

**Add to Vercel production:**
```bash
vercel env add DATABASE_URL production
vercel env add SMTP_ENC_KEY production
vercel env add CRON_SECRET production
vercel env add DASHBOARD_USER production
vercel env add DASHBOARD_PASS production
vercel env add APP_BASE_URL production
vercel env add COMPANY_NAME production
vercel env add COMPANY_ADDRESS production
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (provided by Vercel Marketplace). |
| `SMTP_ENC_KEY` | Base64-encoded 32-byte key used to AES-encrypt SMTP passwords stored in the DB. |
| `CRON_SECRET` | Bearer token used in two places: (a) HMAC secret for the one-click unsubscribe token; (b) `/api/tick` validates a matching `Authorization: Bearer <CRON_SECRET>` header. The dashboard "Send Now" button invokes the tick directly via a server action (not via `/api/tick`), so this value only matters for `/api/tick` if you choose to call it externally. Still required — the unsubscribe token signing depends on it. |
| `DASHBOARD_USER` | HTTP Basic Auth username for the web dashboard. |
| `DASHBOARD_PASS` | HTTP Basic Auth password for the web dashboard. |
| `APP_BASE_URL` | The deployed `https://` URL of this app (e.g. `https://your-project.vercel.app`). Used to construct the one-click unsubscribe link in every email. |
| `COMPANY_NAME` | Your company or sender name, included in the CAN-SPAM footer of every email. |
| `COMPANY_ADDRESS` | A valid physical postal address (CAN-SPAM §5(a)(5) — **mandatory**; see Compliance section). |

> `.env*` files are gitignored. Use `.env.example` as the template for onboarding new contributors.

---

## 4. Apply Database Migrations

Migrations are tracked under `drizzle/` and committed to git. Apply them before the first run (and after any schema-changing PR):

```bash
npx drizzle-kit migrate
```

This requires `DATABASE_URL` to be set in the environment (or `.env.local`).

---

## 5. Deploy to Production

```bash
vercel --prod
```

`vercel.json` no longer declares a `crons` block — sending is operator-triggered via the dashboard's **Send Now** button on the Hobby plan. The `functions` block sets `maxDuration: 300`, which mirrors `export const maxDuration = 300` in `src/app/api/tick/route.ts` — for Next.js App Router the in-file export is the authoritative mechanism; the `vercel.json` entry is belt-and-suspenders. If you later upgrade to Pro and want automatic paced sending, re-add a `crons` entry in `vercel.json` and the same `/api/tick` endpoint will work unchanged.

---

## 6. Per-Sending-Domain Pre-Flight Checklist (MANDATORY)

Complete every item before activating any sending domain. Skipping steps risks permanent domain/IP blacklisting.

- [ ] **Own or register the sending domain.** Use a dedicated subdomain or separate domain from your primary brand domain — this isolates reputation risk. If the sending domain is damaged, your main brand domain remains unaffected.
- [ ] **Publish SPF** — add a `TXT` record to the sending domain authorizing your SMTP relay (e.g. `v=spf1 include:sendgrid.net ~all`).
- [ ] **Publish DKIM** — add the DKIM public-key `TXT` record supplied by your SMTP provider.
- [ ] **Publish DMARC** — add a `TXT` record at `_dmarc.<yourdomain>` (e.g. `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com`).
- [ ] **Verify DNS propagation** using an external checker (e.g. [MXToolbox](https://mxtoolbox.com/SuperTool.aspx), `dig TXT _dmarc.<yourdomain>`).
- [ ] **Add the domain in the dashboard** with its SMTP credentials, set `warmup_start_date = today`, and set a conservative `daily_cap` (start at 20–50/day and ramp up over weeks).
- [ ] **Set verified flags only after DNS passes.** In the dashboard, set `status = active` and flip `spf_verified`, `dkim_verified`, and `dmarc_verified` to `true`. The engine **refuses to send** from a domain unless all three verified flags are `true`.

---

## 7. Operating the Engine

| Action | Where |
|---|---|
| Upload recipients (CSV) | Dashboard `/upload` — invalid/duplicate rows are reported but not imported. |
| Add or edit email templates (A/B) | Dashboard `/templates` |
| Start a campaign | Dashboard `/` → Start button — flips campaign `status` to `active`. The engine only considers `active` campaigns. |
| **Send a batch (manual trigger)** | Dashboard `/` → **Send Now** button — fires one tick on the active campaign. Sends the full remaining budget (capped by global daily cap, per-domain cap, warmup, and `BATCH_HARD_CAP = 60` per click). Result is shown inline (sent / failed / skipped). Click again to send more. |
| Stop/pause a campaign | Dashboard `/` → Stop button — pauses without losing progress. |
| View send log + per-domain counters | Dashboard `/log` — shows today's sent count per domain alongside full send history. |

**How "Send Now" works.** The button calls a server action that invokes `runTick(buildPorts(), { manual: true })` directly on Vercel Functions (Node.js runtime, ≤300s). Manual mode skips the business-hours window check (operator-driven) and takes the full remaining budget in one shot (not the per-tick "spread across remaining ticks" jitter that the automated path uses). Every other guarantee is unchanged: caps, warmup, domain rotation, template A/B rotation, suppression, hard-bounce → suppress, config-failure → pause domain, atomic counter increment.

**Tradeoff vs. a cron.** No auto-pacing across the day. The operator decides cadence by clicking. For a true cold-outreach drip you would either upgrade to Vercel Pro and add a `crons` entry, or use an external scheduler (GitHub Actions cron, cron-job.org, etc.) to hit `/api/tick` with `Authorization: Bearer <CRON_SECRET>` on the cadence you want. The `/api/tick` endpoint is still wired and authenticated — only the schedule is gone.

---

## 8. Deliverability Discipline (Non-Negotiable)

- Only send to addresses for which you have a **lawful basis** to contact (opt-in, existing business relationship, etc.).
- **Honor every unsubscribe.** The one-click unsubscribe endpoint (`/api/unsub`) is wired into every email's `List-Unsubscribe` header and footer link. Unsubscribes are permanent and global — the recipient is suppressed across all campaigns.
- **Keep complaint rates low.** Major inbox providers (Google, Microsoft) throttle and blacklist senders above ~0.1% complaint rate.
- The engine does **not** IP-hop or rotate IPs to evade filters. Deliverability is earned through proper authentication, warmup, and low complaint rates — not evasion.
- A domain is **auto-paused** on SMTP configuration failure (bad credentials, connection refused). Fix the credentials in the dashboard and re-activate.
- Recipients that hard-bounce are **auto-suppressed** — they will not be retried.

---

## 9. Compliance

### CAN-SPAM (US)
- `COMPANY_ADDRESS` **must** be a real, valid physical postal address. The CAN-SPAM Act (15 U.S.C. § 7704(a)(5)) requires a valid postal address in every commercial email. The footer is mandatory and cannot be disabled.
- Every email includes a functioning unsubscribe mechanism. Unsubscribe requests are honored immediately and permanently.

### GDPR (EU) / CASL (Canada)
- The `recipients` schema includes `consent_basis` and `region` columns.
- For recipients in EU or Canadian regions, you **must** have obtained prior express consent before sending. Do not send to rows flagged with EU/CA regions without a documented lawful basis.
- The engine does not automatically enforce consent-basis filtering — this is an operator responsibility at upload time.

---

## 10. Runtime Note: Timezones

Campaign business-hours logic uses IANA timezone names resolved via the JavaScript `Intl` API (e.g. `America/New_York`). Vercel's Node.js runtime ships full ICU data, so named timezone zones work correctly in production.

If running locally on a Node.js build compiled without full ICU (common in some minimal Node installs), non-UTC timezone names may throw. Workaround: use `UTC` locally, or install the `full-icu` npm package and set `NODE_ICU_DATA`. All automated tests use UTC and do not require full ICU.

---

## 11. Running Tests

```bash
npm run test
```

Runs the full Vitest suite (unit + integration). No real emails are ever sent in tests — nodemailer's SMTP transport is mocked throughout. The test count should remain stable; a regression in the count indicates a broken test file, not a passing suite.

---

## 12. Architecture & Design Docs

- **Design spec:** [`docs/superpowers/specs/2026-05-19-email-sending-agent-design.md`](docs/superpowers/specs/2026-05-19-email-sending-agent-design.md)
- **Implementation plan:** [`docs/superpowers/plans/2026-05-19-email-sending-agent.md`](docs/superpowers/plans/2026-05-19-email-sending-agent.md)

Key architectural decisions:
- **Next.js 15 App Router** — all UI and API routes under `src/app/`.
- **Drizzle ORM + Neon Postgres** — schema-first, migrations tracked in `drizzle/`.
- **nodemailer** — SMTP sending; credentials encrypted at rest with `SMTP_ENC_KEY`.
- **Basic-auth dashboard** — `DASHBOARD_USER` / `DASHBOARD_PASS` protect all dashboard routes via Next.js middleware.
- **Manual "Send Now" trigger + `/api/tick` endpoint** — single sending loop; invoked directly via a Server Action on button click (Hobby plan), or callable externally with `Authorization: Bearer <CRON_SECRET>` if you wire up an external scheduler.
- **`/api/unsub` one-click unsubscribe** — wired into `List-Unsubscribe` header; globally suppresses the address.

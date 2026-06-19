# Email Visitor Attribution — Design

**Date:** 2026-06-19
**Status:** Approved (design), pending implementation plans
**Spans two repos:** `Lead-Extraction-Agent` (email sending) + `logictech-digital` (website)

## Goal

Identify which website visitors came from email marketing, down to the exact
recipient. Surface them in the website admin as a new "Email Leads" section
showing identity, on-site behavior, an intent (hot) flag, and the linked
outreach + reply status.

## Problem

- The website already logs visits (`logictech.visits`: sessionId, path, ref,
  ip, city, region, country, bot, createdAt) via `api/track` + `VisitTracker`,
  and renders them in an admin panel.
- Email recipients each have a unique `unsubToken` (`base64url(email).sig24`).
- **Gap:** sent emails carry no link to the site, so visitors arrive with no
  identifier (e.g. the 2026-06-19 Perth visitor came via Google → unattributable).
  No code can join a visit to a recipient without a token on the inbound link.

## Decisions

- **Identifier:** reuse the existing per-recipient `unsubToken` as the click
  token (`?lt=<unsubToken>`). Unguessable, no new field. Bonus: `base64url(email)`
  is the first segment, so the email decodes from the token even before a DB lookup.
- **Architecture:** Approach A — cross-cluster live read. The email agent and the
  website run on **separate Mongo clusters**, so the website opens a *second*,
  read-only Mongo client to the email cluster and resolves token → recipient on
  demand. No duplication, always fresh.
- **Section content:** Identity + Behavior + Hot flag + Outreach link (all four).

## Architecture

**Two separate Mongo clusters:**
- Email cluster `sr1cy8k`, DB `email_sending_agent` — `recipients`, `campaigns`,
  `send_log`, `replies`, `suppression`
- Website cluster `cluster0.souehk8`, DB `logictech` — `visits`, `messages`, `leads`

The website therefore needs a **second connection** to the email cluster to do
the join — it cannot use one client for both. Store the email cluster URI on the
website as a new env `EMAIL_DB_URI` (+ `EMAIL_DB_NAME=email_sending_agent`).
**Recommend a read-only Mongo user** for this URI — the website only reads
recipients/campaigns/send_log/replies, never writes them.

### 1. Email side — `Lead-Extraction-Agent`

`src/lib/template.ts` `renderEmail()`:
- Compute `siteUrl = ${websiteBase}/?lt=${unsubToken}` where `websiteBase` comes
  from a configured value (brand field `websiteUrl`, else env `LANDING_BASE_URL`,
  else fall back to `cfg.baseUrl`).
- Expose it to templates as context var `site` (added to `ctx` alongside
  name/company/email). HTML uses the escaped variant.
- Templates that want attribution embed `{{site}}` as a CTA link
  (e.g. asphalt template id 4: "See our recent work → {{site}}").

This is the only change required on the email side. Tiny.

### 2. Website capture — `logictech-digital`

- **Token persistence:** on first load, read `?lt=` from `location.search`; if
  present, store in `localStorage.lt_token`. Persisting means later pageviews in
  the session — including return visits that arrive via Google — stay tagged.
- `VisitTracker`: include `lt` (URL param if present, else stored token) in the
  `/api/track` POST body.
- `api/track/route.ts`: accept `lt` (cap length, sanitize), store on the `visits`
  doc as `lt`.

### 3. Website join — `logictech-digital`

`src/app/api/admin/data/route.ts`:
- Open a second cached Mongo client to `EMAIL_DB_URI` (email cluster), DB
  `EMAIL_DB_NAME`. Mirror the existing `getDb()` caching pattern in a new
  `getEmailDb()` helper so it degrades to a no-op when the env is absent.
- Collect distinct `lt` tokens from recent `visits`.
- **Offline fallback:** `unsubToken` = `base64url(email).sig24`, so the email
  address can be decoded from the token's first segment without any cross-cluster
  call. If the email cluster is unreachable, still show the decoded email +
  behavior; company/campaign/outreach degrade to blank.
- Look up `recipients` by `unsubToken ∈ tokens` → `{ email, company, phone,
  campaignId }`; resolve `campaigns` for campaign name/niche.
- For each recipient, pull outreach from `send_log` (sent timestamp/status) and
  `replies` (did they reply?).
- Build an `emailLeads` array, one entry per attributed recipient:
  - **Identity:** company, email, phone, campaign name + niche.
  - **Behavior:** distinct paths visited, first/last seen, visit count.
  - **Hot flag:** true if any visited path matches `/contact` or `/pricing`
    (intent signal); hot entries sorted to top.
  - **Outreach:** sent date, reply status.
- Return `emailLeads` alongside the existing payload (additive; existing
  visits/sessions/leads/stats untouched).

### 4. Website admin UI — `logictech-digital`

`src/app/admin/AdminApp.tsx`:
- New **"Email Leads"** section/tab rendering `emailLeads`.
- Columns: company · email/phone · campaign · pages · first/last · visits ·
  reply status. Hot rows flagged and sorted to top.

## Data flow

```
email send  ──renderEmail──>  link  https://logictechdigital.com/?lt=<unsubToken>
recipient clicks            ──>  site load reads ?lt → localStorage.lt_token
every pageview              ──VisitTracker──>  POST /api/track { sessionId, path, ref, lt }
                            ──>  logictech.visits { ..., lt }
admin opens panel           ──GET /api/admin/data──>  join visits.lt ⋈ recipients.unsubToken
                            ──>  emailLeads[]  rendered in "Email Leads" tab
```

## Prerequisites

- Website deployment (`logictech-digital`) gets a new env `EMAIL_DB_URI`
  pointing at the email cluster (`sr1cy8k`, DB `email_sending_agent`), plus
  `EMAIL_DB_NAME`. Recommend a **read-only** Mongo user for it.
- A configured website base URL on the email side: env `LANDING_BASE_URL`
  (e.g. `https://logictechdigital.com`) or a per-brand `websiteUrl` field. Without
  it, `{{site}}` renders blank and the link is simply omitted.

## Risks / non-goals

- **Token replay:** `unsubToken` in a public URL could be replayed against
  `/api/unsub` to unsubscribe that one recipient. Self-harm only, low blast
  radius. Accepted for v1; a hashed click token is the upgrade path if needed.
- **No backfill:** sends made before `{{site}}` existed (incl. the current Perth
  visitor) have no token and remain unattributable. Attribution begins with the
  next send carrying the link.
- **Index:** add an index on `visits.lt` (sparse) for the lookup; recipients
  already indexed on `unsubToken` if used for unsub (verify).
- Out of scope: changing the visit TTL (stays 30 days), redesigning the admin
  shell, server-side redirect tracking (client capture is sufficient for v1).

## Testing

- Email: unit test `renderEmail` emits `{{site}}` → correct `?lt=<token>` URL,
  HTML-escaped; falls back when no website base configured.
- Website capture: `?lt` persists to localStorage; track POST includes `lt`;
  `api/track` stores it.
- Website join: seed a visit with a known `lt` matching a recipient → admin/data
  returns the expected `emailLeads` entry with identity/behavior/hot/outreach.
- Hot flag: visit to `/contact` flips `hot=true` and sorts to top.

import { resolveMx } from "node:dns/promises";
import type { Candidate, EmailType, Lead, RegionCode } from "./types";
import { registrableDomain, sameRegistrableDomain } from "./domain";
import { isSkippable } from "./mongo";

const VALIDATE_MX = (process.env.VALIDATE_MX || "true").toLowerCase() !== "false";

const ASSET_EXT_RE = /\.(png|jpe?g|gif|webp|svg|css|js)$/i;

const PLACEHOLDER_DOMAINS = new Set([
  "example.com",
  "example.org",
  "example.net",
  "sentry.io",
  "sentry-next.wixpress.com",
  "wix.com",
  "wixpress.com",
  "godaddy.com",
  "domain.com",
  "email.com",
  "yourcompany.com",
  "yourdomain.com",
  "yourwebsite.com",
  "test.com",
  // common theme / page-builder vendor demo emails
  "edge-themes.com",
  "select-themes.com",
  "qodeinteractive.com",
  "qode-themes.com",
  "elementor.com",
  "wpengine.com",
  "squarespace.com",
]);

const FREE_MAIL = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "icloud.com",
  "aol.com",
  "live.com",
  "proton.me",
  "protonmail.com",
]);

const ROLE_LOCALPARTS = new Set([
  "info",
  "contact",
  "hello",
  "sales",
  "admin",
  "support",
  "office",
  "enquiries",
  "inquiries",
  "team",
]);

const NOREPLY_RE = /^(no-?reply|donotreply)/i;

// MX cache per domain across a run.
const mxCache = new Map<string, boolean>();

export interface CleanResult {
  lead: Lead | null;
  reason?: string; // why rejected (for logging)
}

export async function cleanCandidate(
  cand: Candidate,
  region: RegionCode
): Promise<CleanResult> {
  const email = cand.email.toLowerCase().trim();

  // structural / junk rejects
  if (ASSET_EXT_RE.test(email)) return reject("asset-extension");
  if (email.length < 6) return reject("too-short");
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return reject("malformed-at");
  const localPart = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!domain.includes(".")) return reject("no-dot-domain");
  if (PLACEHOLDER_DOMAINS.has(domain)) return reject("placeholder-domain");
  if (NOREPLY_RE.test(localPart)) return reject("noreply");

  // domain-match confidence (allowed but flagged when free-mail on a business site)
  // (confidence currently informational; both kept)
  void sameRegistrableDomain(email, cand.sourceUrl);
  void FREE_MAIL.has(domain);

  // role vs personal
  const emailType: EmailType = ROLE_LOCALPARTS.has(localPart) ? "role" : "personal";

  // MX validation
  if (VALIDATE_MX) {
    const ok = await hasMx(domain);
    if (!ok) return reject("no-mx");
  }

  // dedupe vs extracted_leads AND sender suppression
  if (await isSkippable(email)) return reject("duplicate-or-suppressed");

  const reg = registrableDomain(email) || domain;
  const lead: Lead = {
    name: cand.name || cand.company || reg,
    company: cand.company || cand.name || reg,
    email,
    emailType,
    sourceUrl: cand.sourceUrl,
    domain: reg,
    region,
  };
  return { lead };
}

async function hasMx(domain: string): Promise<boolean> {
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  let ok = false;
  try {
    const records = await resolveMx(domain);
    ok = Array.isArray(records) && records.length > 0;
  } catch {
    ok = false;
  }
  mxCache.set(domain, ok);
  return ok;
}

function reject(reason: string): CleanResult {
  return { lead: null, reason };
}

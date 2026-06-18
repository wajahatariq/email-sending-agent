// Standalone on-demand extraction CLI. Runs the same pipeline as /api/extract
// but as a one-shot process and writes a CSV into ./leads.
//
// Usage:
//   npm run extract -- <country_key> "<niche prompt>"
// Example:
//   npm run extract -- ireland "vegan bakeries with their own website"
//
// country_key one of: united_states australia canada united_kingdom ireland new_zealand
//
// Requires .env with TAVILY_API_KEY (or BRAVE) and ANTHROPIC_API_KEY.
// MONGODB_URI optional (enables cross-run dedupe + suppression).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { COUNTRIES, COUNTRY_ORDER, getCountry } from "../src/leadgen/countries";
import { planQueries } from "../src/leadgen/planner";
import { runSearches } from "../src/leadgen/search";
import { extractCandidates } from "../src/leadgen/extractor";
import { cleanCandidate } from "../src/leadgen/cleaner";
import type { CountryKey, Lead } from "../src/leadgen/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Load .env (Node >= 20.6 supports process.loadEnvFile).
try {
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
} catch {
  /* env vars may already be set in the environment */
}

function fail(msg: string): never {
  console.error("error: " + msg);
  console.error(
    'usage: npm run extract -- <country_key> "<niche>"\n' +
      "country_key: " + COUNTRY_ORDER.join(" ")
  );
  process.exit(1);
}

const countryKey = process.argv[2] as CountryKey;
const niche = process.argv.slice(3).join(" ").trim();

if (!countryKey || !(countryKey in COUNTRIES)) fail("invalid or missing country_key");
if (niche.length < 2) fail("missing niche prompt");
if (!process.env.TAVILY_API_KEY && !process.env.BRAVE_API_KEY) {
  fail("no search key set (TAVILY_API_KEY or BRAVE_API_KEY) in .env");
}

function csvCell(value: string): string {
  let v = (value ?? "").toString().replace(/^[=+\-@]+/, "").trim();
  if (/[",\r\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function stamp(): string {
  // YYYYMMDD-HHMMSS in local time, filename-safe.
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

async function main() {
  const country = getCountry(countryKey);
  console.error(`[plan] ${country.label} :: ${niche}`);
  const queries = await planQueries(niche, country);
  console.error(`[search] ${queries.length} queries`);

  const hits = await runSearches(queries, country);
  console.error(`[crawl] ${hits.length} candidate sites`);

  const leads: Lead[] = [];
  const seen = new Set<string>();
  for await (const cand of extractCandidates(hits)) {
    const key = cand.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const { lead } = await cleanCandidate(cand, country.regionCode);
    if (!lead) continue;
    leads.push(lead);
    console.error(`  + ${lead.email}  (${lead.emailType})  ${lead.name}`);
  }

  const leadsDir = join(ROOT, "leads");
  if (!existsSync(leadsDir)) mkdirSync(leadsDir, { recursive: true });

  const rows = [["email", "name", "company"]];
  for (const l of leads) rows.push([l.email, l.name, l.company]);
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

  const file = join(leadsDir, `${stamp()}-${slug(country.label)}-${slug(niche)}.csv`);
  writeFileSync(file, csv, "utf8");

  console.error(`\n[done] ${leads.length} leads -> ${file}`);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});

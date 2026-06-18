import pLimit from "p-limit";
import type { CountryConfig, SearchHit } from "./types";
import { registrableDomain } from "./domain";

const PROVIDER = (process.env.SEARCH_PROVIDER || "tavily").toLowerCase();
const MAX_RESULTS = intEnv("MAX_RESULTS_PER_QUERY", 10);
const SEARCH_CONCURRENCY = 4;

// Heuristic: is this result a directory / listicle page worth keeping even if
// we already have its domain (these yield many leads each).
function looksLikeDirectory(hit: SearchHit): boolean {
  const s = `${hit.url} ${hit.title}`.toLowerCase();
  return /\b(best|top \d+|directory|listing|guide|roundup)\b/.test(s) ||
    /(directory|listing|top-|best-)/.test(hit.url.toLowerCase());
}

// Run all queries, collect hits, dedupe by registrable domain (keeping
// directory pages), tolerate per-query failures.
export async function runSearches(
  queries: string[],
  country: CountryConfig
): Promise<SearchHit[]> {
  const limit = pLimit(SEARCH_CONCURRENCY);
  const batches = await Promise.all(
    queries.map((q) =>
      limit(async () => {
        try {
          return await searchOne(q, country);
        } catch {
          return [] as SearchHit[]; // isolate per-query failure
        }
      })
    )
  );

  const flat = batches.flat();
  return dedupeHits(flat);
}

function dedupeHits(hits: SearchHit[]): SearchHit[] {
  const seenUrl = new Set<string>();
  const domainCount = new Map<string, number>();
  const out: SearchHit[] = [];

  for (const hit of hits) {
    const url = hit.url?.trim();
    if (!url) continue;
    const norm = url.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (seenUrl.has(norm)) continue;

    const dom = registrableDomain(url);
    if (!dom) continue;

    const count = domainCount.get(dom) || 0;
    const isDir = looksLikeDirectory(hit);
    // first page per domain always kept; extra pages only if directory-like
    // (cap directory pages per domain at 4 to avoid runaway crawls)
    if (count >= 1 && !(isDir && count < 4)) continue;

    seenUrl.add(norm);
    domainCount.set(dom, count + 1);
    out.push(hit);
  }
  return out;
}

async function searchOne(query: string, country: CountryConfig): Promise<SearchHit[]> {
  const primary = PROVIDER === "brave" ? searchBrave : searchTavily;
  const secondary = PROVIDER === "brave" ? searchTavily : searchBrave;
  try {
    return await primary(query, country);
  } catch (err) {
    // Fallback to the other provider only if its key is configured.
    const hasFallbackKey =
      PROVIDER === "brave" ? !!process.env.TAVILY_API_KEY : !!process.env.BRAVE_API_KEY;
    if (hasFallbackKey) {
      return secondary(query, country);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tavily
// ---------------------------------------------------------------------------
async function searchTavily(query: string, country: CountryConfig): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY missing");

  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      max_results: MAX_RESULTS,
      include_raw_content: true,
      country: country.label.toLowerCase(),
    }),
  });
  if (!res.ok) throw new Error(`tavily ${res.status}`);
  const json = (await res.json()) as {
    results?: { url: string; title?: string; content?: string; raw_content?: string }[];
  };
  return (json.results || []).map((r) => ({
    url: r.url,
    title: r.title || "",
    content: r.raw_content || r.content || undefined,
  }));
}

// ---------------------------------------------------------------------------
// Brave
// ---------------------------------------------------------------------------
async function searchBrave(query: string, country: CountryConfig): Promise<SearchHit[]> {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error("BRAVE_API_KEY missing");

  const params = new URLSearchParams({
    q: query,
    count: String(MAX_RESULTS),
    country: country.regionCode.toLowerCase(),
  });
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": key,
    },
  });
  if (!res.ok) throw new Error(`brave ${res.status}`);
  const json = (await res.json()) as {
    web?: { results?: { url: string; title?: string; description?: string }[] };
  };
  return (json.web?.results || []).map((r) => ({
    url: r.url,
    title: r.title || "",
    content: r.description || undefined, // Brave gives snippets, not full content
  }));
}

function intEnv(name: string, def: number): number {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isNaN(n) ? def : n;
}

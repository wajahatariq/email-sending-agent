import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import pLimit from "p-limit";
import type { Candidate, SearchHit } from "./types";
import { hostnameOf } from "./domain";

const CRAWL_CONCURRENCY = intEnv("CRAWL_CONCURRENCY", 8);
const CRAWL_TIMEOUT_MS = intEnv("CRAWL_TIMEOUT_MS", 12000);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
// Obfuscated form: foo [at] bar [dot] com  /  foo (at) bar (dot) com  /  foo at bar dot com
const OBFUSCATED_RE =
  /\b[a-zA-Z0-9._%+\-]+\s*(?:\[at\]|\(at\)|\sat\s)\s*[a-zA-Z0-9.\-]+(?:\s*(?:\[dot\]|\(dot\)|\sdot\s)\s*[a-zA-Z0-9.\-]+)+\b/gi;

const CONTACT_LINK_RE = /contact|contact-us|about|team|reach|connect/i;
const NON_HTML_RE = /\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?)(\?|$)/i;

// ---------------------------------------------------------------------------
// Public: stream candidates as they are found across all hits.
// ---------------------------------------------------------------------------
export async function* extractCandidates(
  hits: SearchHit[]
): AsyncGenerator<Candidate> {
  const limit = pLimit(CRAWL_CONCURRENCY);
  const queue: Candidate[] = [];
  let active = 0;
  let resolveWaiter: (() => void) | null = null;

  const notify = () => {
    if (resolveWaiter) {
      const r = resolveWaiter;
      resolveWaiter = null;
      r();
    }
  };

  const tasks = hits.map((hit) =>
    limit(async () => {
      active++;
      try {
        const found = await extractFromHit(hit);
        for (const c of found) queue.push(c);
      } catch {
        // isolate per-site failure
      } finally {
        active--;
        notify();
      }
    })
  );

  const all = Promise.all(tasks).then(() => {
    active = -1; // sentinel: done
    notify();
  });

  for (;;) {
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    if (active === -1) break;
    await new Promise<void>((r) => {
      resolveWaiter = r;
    });
  }
  await all;
}

// ---------------------------------------------------------------------------
// Per-hit extraction
// ---------------------------------------------------------------------------
async function extractFromHit(hit: SearchHit): Promise<Candidate[]> {
  if (NON_HTML_RE.test(hit.url)) return [];

  // Prefer search-API raw content if present (saves a fetch). Still fetch when
  // we need DOM-based name pairing and the content is just text — but text
  // content alone can yield emails cheaply, so harvest it first.
  let html = "";
  if (hit.content && hit.content.length > 200) {
    html = hit.content;
  } else {
    html = (await fetchHtml(hit.url)) || "";
  }
  if (!html) return [];

  let candidates = harvest(html, hit);

  // Contact-page discovery: if homepage exposed no email, follow up to 2
  // contact/about/team links and harvest those.
  if (candidates.length === 0) {
    const links = findContactLinks(html, hit.url).slice(0, 2);
    for (const link of links) {
      await sleep(250); // small per-domain delay (politeness on repeat hits)
      const sub = await fetchHtml(link);
      if (!sub) continue;
      const subCandidates = harvest(sub, { ...hit, url: link });
      if (subCandidates.length) {
        candidates = subCandidates;
        break;
      }
    }
  }

  return candidates;
}

// Harvest emails from one HTML doc and pair each with a business name.
function harvest(html: string, hit: SearchHit): Candidate[] {
  const $ = cheerio.load(html);
  const siteName = extractSiteName($, hit);
  const out = new Map<string, Candidate>(); // dedupe by email within the page

  const add = (email: string, name: string) => {
    const e = email.toLowerCase().trim();
    if (!out.has(e)) {
      out.set(e, { email: e, name, company: name, sourceUrl: hit.url });
    }
  };

  // 1. mailto: links (highest confidence) — pair with nearest heading.
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr("href") || "";
    const email = href.replace(/^mailto:/i, "").split("?")[0].trim();
    if (!email || !email.includes("@")) return;
    const name = nearestName($, el) || siteName;
    add(email, name);
  });

  // 2. visible-text regex (plain + de-obfuscated).
  const text = $("body").length ? $("body").text() : $.root().text();
  const deob = deobfuscate(text);
  for (const src of [text, deob]) {
    const matches = src.match(EMAIL_RE);
    if (!matches) continue;
    for (const m of matches) add(m, siteName);
  }

  return [...out.values()];
}

// De-obfuscate a string: turn "foo [at] bar [dot] com" into "foo@bar.com",
// scoped to matched obfuscated tokens only so normal prose is untouched.
export function deobfuscate(text: string): string {
  return text.replace(OBFUSCATED_RE, (m) =>
    m
      .replace(/\s*(?:\[at\]|\(at\)|\sat\s)\s*/gi, "@")
      .replace(/\s*(?:\[dot\]|\(dot\)|\sdot\s)\s*/gi, ".")
  );
}

// Walk up from an element to find the nearest preceding business name / heading.
function nearestName($: cheerio.CheerioAPI, el: Element): string | null {
  let node: Element | null = el;
  for (let depth = 0; depth < 5 && node; depth++) {
    const container: cheerio.Cheerio<Element> = $(node);
    // headings within or before this container
    const heading = container
      .closest("li, article, .card, tr, section, div")
      .find("h1, h2, h3, h4, strong, b, .name, .title")
      .first();
    const txt = clean(heading.text());
    if (txt) return txt;
    const parent = container.parent().get(0);
    node = parent && parent.type === "tag" ? (parent as Element) : null;
  }
  return null;
}

// Name extraction: og:site_name -> <title> -> first <h1> -> humanized domain.
function extractSiteName($: cheerio.CheerioAPI, hit: SearchHit): string {
  const og = clean($('meta[property="og:site_name"]').attr("content") || "");
  if (og) return og;

  const title = clean(stripTagline($("title").first().text()));
  if (title) return title;

  const h1 = clean($("h1").first().text());
  if (h1) return h1;

  return humanizeDomain(hit.url) || clean(hit.title) || "Unknown";
}

// Strip taglines after | - – from a title.
function stripTagline(s: string): string {
  return s.split(/[|\-–—]/)[0];
}

function humanizeDomain(url: string): string {
  const host = hostnameOf(url);
  if (!host) return "";
  const base = host.split(".")[0];
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function findContactLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text();
    if (!CONTACT_LINK_RE.test(href) && !CONTACT_LINK_RE.test(text)) return;
    const abs = absolutize(href, baseUrl);
    if (abs && !NON_HTML_RE.test(abs)) links.add(abs);
  });
  return [...links];
}

function absolutize(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  if (NON_HTML_RE.test(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("text")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function intEnv(name: string, def: number): number {
  const n = parseInt(process.env[name] || "", 10);
  return Number.isNaN(n) ? def : n;
}

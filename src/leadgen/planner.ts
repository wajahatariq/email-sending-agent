import type { CountryConfig } from "./types";

// Query planner. Uses Groq (free, OpenAI-compatible) when GROQ_API_KEY is set,
// else falls back to a deterministic template set from niche + metros.
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_QUERIES = clampInt(process.env.MAX_QUERIES, 14, 1, 40);

const SYSTEM = `You generate web-search queries for finding small/medium business websites that publish a contact email.
Output ONLY a JSON array of query strings. No prose, no markdown, no code fences.
Mix these angles:
- direct business searches for the niche in the country and its major cities
- directory / listicle queries ("best <niche> in <city>", "<niche> directory <country>")
- contact-intent queries ("<niche> <city> contact email")
Bias phrasing and TLDs toward the target country. Keep each query short and natural.`;

export async function planQueries(
  nichePrompt: string,
  country: CountryConfig
): Promise<string[]> {
  if (process.env.GROQ_API_KEY) {
    try {
      const queries = await planWithGroq(nichePrompt, country);
      if (queries.length) return queries.slice(0, MAX_QUERIES);
    } catch {
      // fall through to deterministic fallback
    }
  }
  return fallbackQueries(nichePrompt, country);
}

async function planWithGroq(
  nichePrompt: string,
  country: CountryConfig
): Promise<string[]> {
  const user = [
    `Niche: ${nichePrompt}`,
    `Country: ${country.label} (region ${country.regionCode}, TLD bias ${country.tldBias})`,
    `Major cities: ${country.metros.join(", ")}`,
    `Return at most ${MAX_QUERIES} queries as a JSON array of strings.`,
  ].join("\n");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.4,
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`groq ${res.status}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = json.choices?.[0]?.message?.content || "";
  return parseQueryArray(text);
}

// Defensive parse: strip stray fences, JSON.parse, validate array of non-empty
// strings, dedupe, truncate.
export function parseQueryArray(raw: string): string[] {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const q = item.trim();
      if (q.length < 3) continue;
      const key = q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(q);
    }
    return out;
  } catch {
    return [];
  }
}

// Deterministic fallback when the LLM is unavailable or returns junk.
export function fallbackQueries(nichePrompt: string, country: CountryConfig): string[] {
  const niche = nichePrompt.trim();
  const { label, metros } = country;
  const out: string[] = [];

  out.push(`${niche} ${label}`);
  out.push(`${niche} directory ${label}`);
  out.push(`best ${niche} in ${label}`);
  out.push(`${niche} ${label} contact email`);

  for (const city of metros) {
    out.push(`${niche} ${city}`);
    out.push(`best ${niche} in ${city}`);
    out.push(`${niche} ${city} contact email`);
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const q of out) {
    const k = q.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(q);
  }
  return deduped.slice(0, MAX_QUERIES);
}

function clampInt(v: string | undefined, def: number, min: number, max: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

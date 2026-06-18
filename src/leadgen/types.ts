import { z } from "zod";

// Supported country keys (select-box order).
export type CountryKey =
  | "united_states"
  | "australia"
  | "canada"
  | "united_kingdom"
  | "ireland"
  | "new_zealand";

export type RegionCode = "US" | "AU" | "CA" | "GB" | "IE" | "NZ";

export interface CountryConfig {
  key: CountryKey;
  label: string;
  regionCode: RegionCode;
  tldBias: string;
  metros: string[];
}

// A search result candidate page, pre-crawl.
export interface SearchHit {
  url: string;
  title: string;
  content?: string; // raw content from the search API, if provided
}

// A raw (name, email) pair pulled from a page, pre-cleaning.
export interface Candidate {
  name: string; // business name (or person, if a contact was found)
  company: string; // business name
  email: string;
  sourceUrl: string;
}

export type EmailType = "role" | "personal";

// A cleaned, validated lead ready to emit / store.
export interface Lead {
  name: string;
  company: string;
  email: string; // lowercased, MX-validated
  emailType: EmailType;
  sourceUrl: string;
  domain: string;
  region: RegionCode;
}

// Request body for POST /api/extract
export const ExtractRequestSchema = z.object({
  country: z.enum([
    "united_states",
    "australia",
    "canada",
    "united_kingdom",
    "ireland",
    "new_zealand",
  ]),
  nichePrompt: z.string().min(2).max(500),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

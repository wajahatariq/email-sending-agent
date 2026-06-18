import type { CountryConfig, CountryKey } from "./types";

// Per-country config: label, region code (used for search hints AND the
// recipient `region` field), TLD bias, and metro list for query expansion.
export const COUNTRIES: Record<CountryKey, CountryConfig> = {
  united_states: {
    key: "united_states",
    label: "United States",
    regionCode: "US",
    tldBias: ".com",
    metros: [
      "New York",
      "Los Angeles",
      "Chicago",
      "Houston",
      "Miami",
      "Phoenix",
      "Dallas",
      "Atlanta",
    ],
  },
  australia: {
    key: "australia",
    label: "Australia",
    regionCode: "AU",
    tldBias: ".com.au",
    metros: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Gold Coast"],
  },
  canada: {
    key: "canada",
    label: "Canada",
    regionCode: "CA",
    tldBias: ".ca",
    metros: ["Toronto", "Vancouver", "Montreal", "Calgary", "Ottawa", "Edmonton"],
  },
  united_kingdom: {
    key: "united_kingdom",
    label: "United Kingdom (England)",
    regionCode: "GB",
    tldBias: ".co.uk",
    metros: ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Bristol"],
  },
  ireland: {
    key: "ireland",
    label: "Ireland",
    regionCode: "IE",
    tldBias: ".ie",
    metros: ["Dublin", "Cork", "Galway", "Limerick"],
  },
  new_zealand: {
    key: "new_zealand",
    label: "New Zealand",
    regionCode: "NZ",
    tldBias: ".co.nz",
    metros: ["Auckland", "Wellington", "Christchurch", "Hamilton"],
  },
};

// Select-box order.
export const COUNTRY_ORDER: CountryKey[] = [
  "united_states",
  "australia",
  "canada",
  "united_kingdom",
  "ireland",
  "new_zealand",
];

export function getCountry(key: CountryKey): CountryConfig {
  return COUNTRIES[key];
}

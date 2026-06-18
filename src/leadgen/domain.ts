// Lightweight domain helpers. Not a full Public Suffix List, but handles the
// common multi-part TLDs this tool targets (.co.uk, .com.au, .co.nz, .org.uk,
// etc.) well enough for dedupe and same-domain matching.

const MULTI_PART_TLDS = new Set([
  "co.uk",
  "org.uk",
  "me.uk",
  "ltd.uk",
  "plc.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "net.nz",
  "org.nz",
  "com.co",
]);

export function hostnameOf(url: string): string | null {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Registrable domain, e.g. https://shop.example.co.uk/x -> example.co.uk
export function registrableDomain(urlOrHost: string): string | null {
  const host = urlOrHost.includes("://") || urlOrHost.includes("/")
    ? hostnameOf(urlOrHost)
    : urlOrHost.toLowerCase().replace(/^www\./, "");
  if (!host) return null;
  const parts = host.split(".");
  if (parts.length <= 2) return host;

  const lastTwo = parts.slice(-2).join(".");
  const lastThree = parts.slice(-3).join(".");
  if (MULTI_PART_TLDS.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  // handle cases like example.com.au already covered by lastTwo check on
  // "com.au"; default to last two labels.
  return lastTwo === lastThree ? lastThree : parts.slice(-2).join(".");
}

// True if email domain equals the site domain or is a subdomain of it.
export function sameRegistrableDomain(a: string, b: string): boolean {
  const ra = registrableDomain(a);
  const rb = registrableDomain(b);
  return ra != null && ra === rb;
}

export function checkBasicAuth(
  header: string | null,
  env: { DASHBOARD_USER?: string; DASHBOARD_PASS?: string },
): boolean {
  if (!header || !header.startsWith('Basic ')) return false;
  if (!env.DASHBOARD_USER || !env.DASHBOARD_PASS) return false; // fail closed if unset
  let decoded: string;
  try { decoded = Buffer.from(header.slice(6), 'base64').toString('utf8'); }
  catch { return false; }
  const idx = decoded.indexOf(':');
  if (idx === -1) return false;
  const u = decoded.slice(0, idx);
  const p = decoded.slice(idx + 1);
  return u === env.DASHBOARD_USER && p === env.DASHBOARD_PASS;
}

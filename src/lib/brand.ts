import { cookies } from 'next/headers';
import { brandsCol } from '@/db/collections';

// ---------------------------------------------------------------------------
// Selected-brand context (server-side, cookie-backed)
// ---------------------------------------------------------------------------

const COOKIE = 'selected_brand';

/**
 * Returns the currently-selected brand id, or null if there are no brands.
 * Falls back to the lowest brand id when the cookie is missing/invalid.
 */
export async function getSelectedBrandId(): Promise<number | null> {
  const all = await (await brandsCol()).find({}).sort({ id: 1 }).toArray();
  if (all.length === 0) return null;
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  const wanted = raw ? Number(raw) : NaN;
  if (Number.isFinite(wanted) && all.some(b => b.id === wanted)) return wanted;
  return all[0].id;
}

/**
 * Server action helper to switch brand (called from the sidebar switcher).
 * Only valid inside a Server Action or Route Handler.
 */
export async function setSelectedBrandCookie(brandId: number): Promise<void> {
  const store = await cookies();
  store.set(COOKIE, String(brandId), { httpOnly: true, sameSite: 'lax', path: '/' });
}

/**
 * Returns all brands sorted by id ascending.
 */
export async function listBrands() {
  return (await brandsCol()).find({}).sort({ id: 1 }).toArray();
}

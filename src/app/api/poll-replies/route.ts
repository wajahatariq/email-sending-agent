import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { listBrands } from '../../../lib/brand';
import { buildPollPorts } from '../../../lib/pollAdapters';
import { pollReplies } from '../../../lib/pollReplies';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Constant-time bearer check so the auth path doesn't leak the secret via
 * response timing. Length-mismatched buffers short-circuit (timingSafeEqual
 * throws on unequal lengths) — that branch carries no secret-dependent timing.
 * CRON_SECRET is never logged or echoed.
 */
function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function GET(req: NextRequest) {
  if (!authorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const brands = await listBrands();
    if (brands.length === 0) {
      return NextResponse.json({ brands: 0, results: [] });
    }

    const results: Array<{
      brandId: number;
      domainsPolled: number;
      newReplies: number;
      matched: number;
      errors: Array<{ domainId: number; error: string }>;
    }> = [];
    for (const brand of brands) {
      const pollResult = await pollReplies(buildPollPorts(brand.id));
      results.push({ brandId: brand.id, ...pollResult });
    }

    return NextResponse.json({ brands: brands.length, results });
  } catch (err) {
    console.error('[poll-replies]', err);
    return NextResponse.json({ error: 'poll failed' }, { status: 500 });
  }
}

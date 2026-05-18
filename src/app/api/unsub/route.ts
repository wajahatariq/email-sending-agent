import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubToken } from '../../../lib/token';
import { getDb } from '../../../db/client';
import * as s from '../../../db/schema';

export const runtime = 'nodejs';

async function handle(token: string | null) {
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 });
  const email = verifyUnsubToken(token, process.env.CRON_SECRET ?? '');
  if (!email) return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  try {
    const db = getDb();
    await db.insert(s.suppression).values({ email: email.toLowerCase(), reason: 'unsubscribe' })
      .onConflictDoNothing();
  } catch (err) {
    console.error('[unsub] DB error', err);
    return new NextResponse('Unsubscribe failed, please try again later.', {
      status: 500, headers: { 'content-type': 'text/plain' },
    });
  }
  return new NextResponse('You have been unsubscribed.', {
    status: 200, headers: { 'content-type': 'text/plain' },
  });
}

export async function GET(req: NextRequest) {
  return handle(req.nextUrl.searchParams.get('token'));
}
// One-click (RFC 8058): mailbox providers POST to the same URL.
export async function POST(req: NextRequest) {
  return handle(req.nextUrl.searchParams.get('token'));
}

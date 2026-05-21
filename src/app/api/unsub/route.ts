import { NextRequest, NextResponse } from 'next/server';
import { verifyUnsubToken } from '../../../lib/token';
import { suppressionCol } from '../../../db/collections';

export const runtime = 'nodejs';

async function handle(token: string | null) {
  if (!token) return NextResponse.json({ error: 'missing token' }, { status: 400 });
  const email = verifyUnsubToken(token, process.env.CRON_SECRET ?? '');
  if (!email) return NextResponse.json({ error: 'invalid token' }, { status: 400 });
  try {
    await (await suppressionCol()).updateOne(
      { _id: email.toLowerCase() },
      { $setOnInsert: { reason: 'unsubscribe', ts: new Date() } },
      { upsert: true },
    );
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

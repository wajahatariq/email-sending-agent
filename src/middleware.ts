import { NextRequest, NextResponse } from 'next/server';
import { checkBasicAuth } from './lib/auth';

export const config = { matcher: ['/((?!api/unsub(?:/|$)|api/tick(?:/|$)|_next/static|_next/image|favicon\\.ico).*)'] };

export function middleware(req: NextRequest) {
  if (checkBasicAuth(req.headers.get('authorization'), {
    DASHBOARD_USER: process.env.DASHBOARD_USER,
    DASHBOARD_PASS: process.env.DASHBOARD_PASS,
  })) return NextResponse.next();
  return new NextResponse('Auth required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="dashboard"' },
  });
}

import { createHmac, timingSafeEqual } from 'crypto';

export function makeUnsubToken(email: string, secret: string): string {
  const b = Buffer.from(email).toString('base64url');
  const sig = createHmac('sha256', secret).update(b).digest('base64url').slice(0, 24);
  return `${b}.${sig}`;
}

export function verifyUnsubToken(token: string, secret: string): string | null {
  const [b, sig] = token.split('.');
  if (!b || !sig) return null;
  const expect = createHmac('sha256', secret).update(b).digest('base64url').slice(0, 24);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expect);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try { return Buffer.from(b, 'base64url').toString('utf8'); } catch { return null; }
}

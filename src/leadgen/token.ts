import { createHmac } from "node:crypto";

// Mirrors the email-sending-agent's makeUnsubToken (src/lib/token.ts) EXACTLY:
//   b   = base64url(email)
//   sig = HMAC-SHA256(secret, b) as base64url, first 24 chars
//   token = `${b}.${sig}`
// The sender's verifyUnsubToken decodes `b` back to the email, so the byte
// content of `email` here must match what the sender stored (lowercased).
// Only used in push mode; CRON_SECRET must equal the sender's value.
export function makeUnsubToken(email: string, secret = process.env.CRON_SECRET || ""): string {
  const b = Buffer.from(email).toString("base64url");
  const sig = createHmac("sha256", secret).update(b).digest("base64url").slice(0, 24);
  return `${b}.${sig}`;
}

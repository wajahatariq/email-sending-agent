import nodemailer, { type Transporter } from 'nodemailer';

export interface SmtpConfig {
  host: string; port: number; user: string; pass: string;
}
export interface OutMessage {
  from: string; to: string; subject: string;
  html: string; text: string; headers: Record<string, string>;
}
export type FailKind = 'soft' | 'hard';
export interface SendResult { ok: boolean; response?: string; kind?: FailKind; error?: string; }

export function makeTransport(c: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: c.host, port: c.port,
    secure: c.port === 465,
    auth: { user: c.user, pass: c.pass },
  });
}

export function classifySmtpError(e: any): FailKind {
  const code = e?.responseCode;
  if (typeof code === 'number' && code >= 500) return 'hard';
  if (e?.code === 'ETIMEDOUT' || e?.code === 'ECONNECTION') return 'soft';
  return 'soft';
}

export async function sendOne(transport: Transporter, m: OutMessage): Promise<SendResult> {
  try {
    const info: any = await transport.sendMail({
      from: m.from, to: m.to, subject: m.subject,
      html: m.html, text: m.text, headers: m.headers,
    });
    return { ok: true, response: info?.response ?? '250 OK' };
  } catch (e: any) {
    return { ok: false, kind: classifySmtpError(e), error: e?.message ?? 'send failed' };
  }
}

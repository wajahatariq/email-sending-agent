export interface TemplateInput { subject: string; bodyHtml: string; bodyText: string; }
export interface RecipientInput { email: string; name: string; company: string; vars: Record<string, string>; }
export interface RenderConfig { companyName: string; companyAddress: string; baseUrl: string; siteUrl?: string; }
export interface RenderedEmail { subject: string; html: string; text: string; headers: Record<string, string>; }

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fill(s: string, ctx: Record<string, string>): string {
  return s.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => ctx[k] ?? '');
}

function fillHtml(s: string, ctx: Record<string, string>): string {
  return s.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => escapeHtml(ctx[k] ?? ''));
}

export function renderEmail(
  t: TemplateInput, r: RecipientInput, unsubToken: string, cfg: RenderConfig,
): RenderedEmail {
  // r.vars keys intentionally override name/company/email — recipient-level personalisation takes precedence.
  // `site` is system-controlled (carries the attribution token) so it goes in AFTER vars and cannot be overridden.
  const siteBase = (cfg.siteUrl ?? '').replace(/\/+$/, '');
  const site = siteBase ? `${siteBase}/?lt=${unsubToken}` : '';
  const ctx = { name: r.name, company: r.company, email: r.email, ...r.vars, site };
  const unsubUrl = `${cfg.baseUrl}/api/unsub?token=${unsubToken}`;
  const footerHtml =
    `<hr><p style="font-size:12px;color:#888">${escapeHtml(cfg.companyName)}, ${escapeHtml(cfg.companyAddress)}.` +
    ` <a href="${escapeHtml(unsubUrl)}">Unsubscribe</a></p>`;
  const footerText = `\n\n--\n${cfg.companyName}, ${cfg.companyAddress}.\nUnsubscribe: ${unsubUrl}`;
  return {
    subject: fill(t.subject, ctx),
    html: fillHtml(t.bodyHtml, ctx) + footerHtml,
    text: fill(t.bodyText, ctx) + footerText,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>, <mailto:unsubscribe@${new URL(cfg.baseUrl).hostname}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

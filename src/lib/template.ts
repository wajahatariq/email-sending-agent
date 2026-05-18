export interface TemplateInput { subject: string; bodyHtml: string; bodyText: string; }
export interface RecipientInput { email: string; name: string; company: string; vars: Record<string, string>; }
export interface RenderConfig { companyName: string; companyAddress: string; baseUrl: string; }
export interface RenderedEmail { subject: string; html: string; text: string; headers: Record<string, string>; }

function fill(s: string, ctx: Record<string, string>): string {
  return s.replace(/\{\{\s*([\w]+)\s*\}\}/g, (_, k) => ctx[k] ?? '');
}

export function renderEmail(
  t: TemplateInput, r: RecipientInput, unsubToken: string, cfg: RenderConfig,
): RenderedEmail {
  const ctx = { name: r.name, company: r.company, email: r.email, ...r.vars };
  const unsubUrl = `${cfg.baseUrl}/api/unsub?token=${unsubToken}`;
  const footerHtml =
    `<hr><p style="font-size:12px;color:#888">${cfg.companyName}, ${cfg.companyAddress}.` +
    ` <a href="${unsubUrl}">Unsubscribe</a></p>`;
  const footerText = `\n\n--\n${cfg.companyName}, ${cfg.companyAddress}.\nUnsubscribe: ${unsubUrl}`;
  return {
    subject: fill(t.subject, ctx),
    html: fill(t.bodyHtml, ctx) + footerHtml,
    text: fill(t.bodyText, ctx) + footerText,
    headers: {
      'List-Unsubscribe': `<${unsubUrl}>, <mailto:unsubscribe@${new URL(cfg.baseUrl).hostname}?subject=unsubscribe>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

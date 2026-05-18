export interface ParsedRecipient {
  email: string;
  name: string;
  company: string;
  vars: Record<string, string>;
}
export interface CsvResult {
  valid: ParsedRecipient[];
  errors: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function sanitizeText(v: string): string {
  let s = v.replace(/[\r\n]+/g, ' ').trim();
  while (s.length && '=+-@'.includes(s[0])) s = s.slice(1).trim();
  return s;
}

export function parseRecipientsCsv(raw: string): CsvResult {
  const errors: string[] = [];
  const lines = raw.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return { valid: [], errors: ['empty file'] };

  const headers = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const emailIdx = headers.indexOf('email');
  if (emailIdx === -1) return { valid: [], errors: ['missing required email column'] };
  const nameIdx = headers.indexOf('name');
  const companyIdx = headers.indexOf('company');

  const seen = new Set<string>();
  const valid: ParsedRecipient[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const email = (cells[emailIdx] ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { errors.push(`row ${i + 1}: invalid email "${email}"`); continue; }
    if (seen.has(email)) continue;
    seen.add(email);
    const vars: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (![emailIdx, nameIdx, companyIdx].includes(idx) && h)
        vars[h] = sanitizeText(cells[idx] ?? '');
    });
    valid.push({
      email,
      name: nameIdx > -1 ? sanitizeText(cells[nameIdx] ?? '') : '',
      company: companyIdx > -1 ? sanitizeText(cells[companyIdx] ?? '') : '',
      vars,
    });
  }
  return { valid, errors };
}

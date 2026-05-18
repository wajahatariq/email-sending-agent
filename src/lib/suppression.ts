/**
 * Partition recipients into sendable and blocked lists based on a suppression set.
 *
 * Normalization is handled internally: the suppression set is lowercased once
 * before the loop, and each recipient email is also lowercased at lookup time.
 * Callers do NOT need to pre-lowercase entries in the suppressed Set — passing
 * mixed-case entries is safe and will never cause a silent false-negative
 * (i.e., emailing a suppressed/unsubscribed address — compliance-critical).
 */
export function partitionSuppressed<T extends { email: string }>(
  rcpts: T[], suppressed: Set<string>,
): { sendable: T[]; blocked: T[] } {
  // Self-defending: normalize the suppression set internally so a caller
  // passing mixed-case entries can never cause a silent false-negative
  // (emailing a suppressed/unsubscribed address — compliance-critical).
  const norm = new Set<string>();
  for (const e of suppressed) norm.add(e.toLowerCase());
  const sendable: T[] = [];
  const blocked: T[] = [];
  for (const r of rcpts) {
    if (norm.has(r.email.toLowerCase())) blocked.push(r);
    else sendable.push(r);
  }
  return { sendable, blocked };
}

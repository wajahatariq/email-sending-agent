/**
 * Partition recipients into sendable and blocked lists based on a suppression set.
 *
 * The `suppressed` Set is expected to contain already-lowercased email addresses
 * (the adapter in Task 12 lowercases on load). Recipient emails are lowercased
 * before lookup to ensure case-insensitive matching.
 */
export function partitionSuppressed<T extends { email: string }>(
  rcpts: T[],
  suppressed: Set<string>,
): { sendable: T[]; blocked: T[] } {
  const sendable: T[] = [];
  const blocked: T[] = [];
  for (const r of rcpts) {
    if (suppressed.has(r.email.toLowerCase())) blocked.push(r);
    else sendable.push(r);
  }
  return { sendable, blocked };
}

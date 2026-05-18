export function roundRobin<T>(items: T[], lastIndex: number): T {
  if (items.length === 0) throw new Error('no items to rotate');
  const len = items.length;
  const next = ((lastIndex + 1) % len + len) % len;
  return items[next];
}

export function weightedPick<T extends { weight: number }>(
  items: T[], rng: () => number = Math.random,
): T {
  if (items.length === 0) throw new Error('no items to pick');
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const it of items) {
    r -= it.weight;
    if (r < 0) return it;
  }
  return items[items.length - 1];
}

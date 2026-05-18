const DAY_MS = 86_400_000;

export function warmupDay(startDate: Date, now: Date): number {
  const diff = Math.floor((now.getTime() - startDate.getTime()) / DAY_MS);
  return Math.max(1, diff + 1);
}

export function warmupLimit(day: number, dailyCap: number): number {
  // day1=10, then *1.5 each day, rounded down.
  const raw = Math.floor(10 * Math.pow(1.5, day - 1));
  return Math.min(raw, dailyCap);
}

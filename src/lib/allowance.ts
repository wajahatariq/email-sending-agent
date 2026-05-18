function hourInTz(date: Date, tz: string): number {
  const h = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', hour12: false, timeZone: tz,
  }).format(date);
  return parseInt(h, 10) % 24;
}
function minuteInTz(date: Date, tz: string): number {
  const m = new Intl.DateTimeFormat('en-US', {
    minute: 'numeric', timeZone: tz,
  }).format(date);
  return parseInt(m, 10);
}

export function ticksRemaining(
  now: Date, startHour: number, endHour: number, tickMin: number, tz: string,
): number {
  const h = hourInTz(now, tz);
  const m = minuteInTz(now, tz);
  if (h < startHour || h >= endHour) return 0;
  const minutesLeft = (endHour - h) * 60 - m;
  return Math.max(0, Math.ceil(minutesLeft / tickMin));
}

export function tickAllowance(
  remainingBudget: number, ticksLeft: number, rng: () => number = Math.random,
): number {
  if (ticksLeft <= 0 || remainingBudget <= 0) return 0;
  const base = remainingBudget / ticksLeft;
  const jitterFactor = 1.0 + (rng() - 0.5) * 0.6; // 0.7 .. 1.3
  const n = Math.round(base * jitterFactor);
  return Math.min(remainingBudget, Math.max(0, n));
}

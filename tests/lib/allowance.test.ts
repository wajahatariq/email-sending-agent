import { describe, it, expect } from 'vitest';
import { ticksRemaining, tickAllowance } from '../../src/lib/allowance';

describe('allowance', () => {
  it('counts whole ticks left in window', () => {
    const now = new Date('2026-05-19T16:30:00Z');
    expect(ticksRemaining(now, 9, 17, 10, 'UTC')).toBe(3);
  });

  it('returns 0 outside window', () => {
    const now = new Date('2026-05-19T20:00:00Z');
    expect(ticksRemaining(now, 9, 17, 10, 'UTC')).toBe(0);
  });

  it('spreads remaining budget across remaining ticks', () => {
    expect(tickAllowance(100, 4, () => 0.5)).toBe(25);
  });

  it('applies +/-30% jitter deterministically via rng', () => {
    expect(tickAllowance(100, 4, () => 0)).toBe(18);
    expect(tickAllowance(100, 4, () => 1)).toBe(33);
  });

  it('never returns more than remaining budget', () => {
    expect(tickAllowance(5, 1, () => 1)).toBe(5);
  });

  it('returns 0 when no ticks remain', () => {
    expect(tickAllowance(100, 0, () => 0.5)).toBe(0);
  });
});

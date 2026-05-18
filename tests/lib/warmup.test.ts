import { describe, it, expect } from 'vitest';
import { warmupLimit, warmupDay } from '../../src/lib/warmup';

describe('warmup', () => {
  it('day 1 starts low', () => {
    expect(warmupLimit(1, 500)).toBe(10);
  });

  it('ramps ~1.5x per day', () => {
    expect(warmupLimit(2, 500)).toBe(15);
    expect(warmupLimit(3, 500)).toBe(22);
  });

  it('never exceeds the domain daily cap', () => {
    expect(warmupLimit(99, 50)).toBe(50);
  });

  it('computes warmup day from start date (UTC, 1-indexed)', () => {
    const start = new Date('2026-05-10T00:00:00Z');
    const now = new Date('2026-05-12T12:00:00Z');
    expect(warmupDay(start, now)).toBe(3);
  });

  it('warmup day is at least 1', () => {
    const d = new Date('2026-05-10T00:00:00Z');
    expect(warmupDay(d, d)).toBe(1);
  });
});

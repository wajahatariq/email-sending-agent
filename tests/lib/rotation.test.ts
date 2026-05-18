import { describe, it, expect } from 'vitest';
import { roundRobin, weightedPick } from '../../src/lib/rotation';

describe('rotation', () => {
  it('round-robins domains starting after last index', () => {
    const ds = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(roundRobin(ds, 0).id).toBe(2);
    expect(roundRobin(ds, 2).id).toBe(1);
  });

  it('wraps when lastIndex unknown (-1)', () => {
    expect(roundRobin([{ id: 9 }], -1).id).toBe(9);
  });

  it('weighted pick honors weights deterministically', () => {
    const ts = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }];
    expect(weightedPick(ts, () => 0.1).id).toBe('a');
    expect(weightedPick(ts, () => 0.9).id).toBe('b');
  });
});

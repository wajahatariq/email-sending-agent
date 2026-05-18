import { describe, it, expect } from 'vitest';
import { partitionSuppressed } from '../../src/lib/suppression';

describe('partitionSuppressed', () => {
  it('splits recipients by suppression set (case-insensitive)', () => {
    const rcpts = [{ email: 'A@x.com' }, { email: 'b@x.com' }, { email: 'c@x.com' }];
    const supp = new Set(['a@x.com', 'c@x.com']);
    const r = partitionSuppressed(rcpts, supp);
    expect(r.sendable.map(x => x.email)).toEqual(['b@x.com']);
    expect(r.blocked.map(x => x.email)).toEqual(['A@x.com', 'c@x.com']);
  });
});

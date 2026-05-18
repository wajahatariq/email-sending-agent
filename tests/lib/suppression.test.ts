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

  it('normalizes a mixed-case suppressed set internally (defense in depth)', () => {
    const rcpts = [{ email: 'a@x.com' }, { email: 'b@x.com' }];
    const supp = new Set(['A@X.COM']); // caller passed non-normalized
    const r = partitionSuppressed(rcpts, supp);
    expect(r.blocked.map(x => x.email)).toEqual(['a@x.com']);
    expect(r.sendable.map(x => x.email)).toEqual(['b@x.com']);
  });

  it('empty recipients -> empty buckets', () => {
    const r = partitionSuppressed([] as { email: string }[], new Set(['a@x.com']));
    expect(r).toEqual({ sendable: [], blocked: [] });
  });

  it('empty suppression set -> all sendable', () => {
    const rcpts = [{ email: 'a@x.com' }, { email: 'b@x.com' }];
    const r = partitionSuppressed(rcpts, new Set<string>());
    expect(r.blocked).toEqual([]);
    expect(r.sendable.map(x => x.email)).toEqual(['a@x.com', 'b@x.com']);
  });
});

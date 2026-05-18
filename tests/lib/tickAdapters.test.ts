import { describe, it, expect } from 'vitest';
import { incrementCounterSql, softFailStatusSql } from '../../src/lib/tickAdapters';

describe('incrementCounterSql', () => {
  it('is an atomic upsert that adds 1 on conflict (domain_id, day)', () => {
    const sql = incrementCounterSql();
    expect(sql).toMatch(/insert into counters/i);
    expect(sql).toMatch(/on conflict\s*\(\s*domain_id\s*,\s*day\s*\)/i);
    expect(sql).toMatch(/sent_count\s*=\s*counters\.sent_count\s*\+\s*1/i);
  });
  it('uses bind placeholders, not string interpolation (no injection-shaped code)', () => {
    const sql = incrementCounterSql();
    expect(sql).toContain('$1');
    expect(sql).toContain('$2');
  });
});

describe('softFailStatusSql', () => {
  it('is a CASE expression that sets failed at >= 3 attempts, else pending', () => {
    const expr = softFailStatusSql();
    expect(expr).toMatch(/case when/i);
    expect(expr).toMatch(/>= 3/);
    expect(expr).toMatch(/'failed'/);
    expect(expr).toMatch(/'pending'/);
  });
});

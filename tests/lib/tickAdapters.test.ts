import { describe, it, expect } from 'vitest';
import { incrementCounterSql } from '../../src/lib/tickAdapters';

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

import { describe, it, expect } from 'vitest';
import { counterUpsert, softFailUpdatePipeline } from '../../src/lib/tickAdapters';

describe('counterUpsert', () => {
  it('filter._id is domainId:day', () => {
    const { filter } = counterUpsert(5, '2026-05-22', 9);
    expect(filter._id).toBe('5:2026-05-22');
  });

  it('update.$inc.sentCount is 1 (atomic increment)', () => {
    const { update } = counterUpsert(5, '2026-05-22', 9) as {
      filter: { _id: string };
      update: { $inc: { sentCount: number }; $setOnInsert: { domainId: number; day: string; brandId: number } };
    };
    expect(update.$inc.sentCount).toBe(1);
  });

  it('update.$setOnInsert stamps domainId, day, and brandId on first create', () => {
    const { update } = counterUpsert(5, '2026-05-22', 9) as {
      filter: { _id: string };
      update: { $inc: { sentCount: number }; $setOnInsert: { domainId: number; day: string; brandId: number } };
    };
    expect(update.$setOnInsert.domainId).toBe(5);
    expect(update.$setOnInsert.day).toBe('2026-05-22');
    expect(update.$setOnInsert.brandId).toBe(9);
  });

  it('update contains $inc and $setOnInsert for concurrent-safe upsert', () => {
    const { update } = counterUpsert(42, '2026-01-01', 9) as Record<string, unknown>;
    expect(update).toHaveProperty('$inc');
    expect(update).toHaveProperty('$setOnInsert');
  });

  it('update does NOT contain a plain $set of sentCount (non-atomic overwrite must be absent)', () => {
    const result = counterUpsert(5, '2026-05-22', 9);
    const update = result.update as Record<string, unknown>;
    // A plain $set would overwrite sentCount non-atomically — must never exist.
    if ('$set' in update) {
      const setObj = update['$set'] as Record<string, unknown>;
      expect(setObj).not.toHaveProperty('sentCount');
    } else {
      // No $set at all — correct.
      expect(update).not.toHaveProperty('$set');
    }
  });

  it('different domainId and day produce distinct _id values', () => {
    const a = counterUpsert(1, '2026-05-22', 9);
    const b = counterUpsert(2, '2026-05-22', 9);
    const c = counterUpsert(1, '2026-05-23', 9);
    expect(a.filter._id).not.toBe(b.filter._id);
    expect(a.filter._id).not.toBe(c.filter._id);
  });
});

describe('softFailUpdatePipeline', () => {
  it('returns an array (aggregation pipeline)', () => {
    const pipeline = softFailUpdatePipeline('boom');
    expect(Array.isArray(pipeline)).toBe(true);
  });

  it('pipeline has exactly 1 stage', () => {
    const pipeline = softFailUpdatePipeline('boom');
    expect(pipeline).toHaveLength(1);
  });

  it('the single stage is a $set stage', () => {
    const [stage] = softFailUpdatePipeline('boom') as Array<Record<string, unknown>>;
    expect(stage).toHaveProperty('$set');
  });

  it('$set.failReason is the error string passed in', () => {
    const [stage] = softFailUpdatePipeline('boom') as Array<{ $set: Record<string, unknown> }>;
    expect(stage.$set.failReason).toBe('boom');
  });

  it('$set.failReason is null when null is passed', () => {
    const [stage] = softFailUpdatePipeline(null) as Array<{ $set: Record<string, unknown> }>;
    expect(stage.$set.failReason).toBeNull();
  });

  it('$set.attempts uses $add referencing "$attempts" and 1 (atomic self-reference)', () => {
    const [stage] = softFailUpdatePipeline('boom') as Array<{
      $set: { attempts: { $add: unknown[] } };
    }>;
    expect(stage.$set.attempts).toEqual({ $add: ['$attempts', 1] });
  });

  it('$set.status uses $cond with $gte against 3, choosing "failed" vs "pending"', () => {
    const [stage] = softFailUpdatePipeline('boom') as Array<{
      $set: {
        status: { $cond: [{ $gte: unknown[] }, string, string] };
      };
    }>;
    const cond = stage.$set.status.$cond;
    // condition: { $gte: [{ $add: ['$attempts', 1] }, 3] }
    expect(cond[0]).toEqual({ $gte: [{ $add: ['$attempts', 1] }, 3] });
    expect(cond[1]).toBe('failed');
    expect(cond[2]).toBe('pending');
  });

  it('status $gte threshold is 3', () => {
    const [stage] = softFailUpdatePipeline('any') as Array<{
      $set: { status: { $cond: [{ $gte: [unknown, number] }, string, string] } };
    }>;
    const threshold = stage.$set.status.$cond[0].$gte[1];
    expect(threshold).toBe(3);
  });
});

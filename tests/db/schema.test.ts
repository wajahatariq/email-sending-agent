import { describe, it, expect } from 'vitest';
import * as schema from '../../src/db/schema';

describe('schema', () => {
  it('exports all required tables', () => {
    for (const t of ['domains','templates','campaigns','recipients','sendLog','suppression','counters'])
      expect(schema).toHaveProperty(t);
  });
});

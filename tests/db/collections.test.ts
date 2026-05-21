import { describe, it, expect } from 'vitest';
import * as c from '../../src/db/collections';

describe('collections module', () => {
  it('exports all collection accessors + nextId', () => {
    for (const fn of [
      'domainsCol',
      'templatesCol',
      'campaignsCol',
      'recipientsCol',
      'sendLogCol',
      'suppressionCol',
      'countersCol',
      'nextId',
    ])
      expect(typeof (c as Record<string, unknown>)[fn]).toBe('function');
  });
});

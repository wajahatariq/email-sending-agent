import { describe, it, expect } from 'vitest';
import { makeUnsubToken, verifyUnsubToken } from '../../src/lib/token';

const SECRET = 'test-secret';

describe('unsub token', () => {
  it('roundtrips an email', () => {
    const t = makeUnsubToken('a@x.com', SECRET);
    expect(verifyUnsubToken(t, SECRET)).toBe('a@x.com');
  });
  it('rejects tampered token', () => {
    const t = makeUnsubToken('a@x.com', SECRET) + 'x';
    expect(verifyUnsubToken(t, SECRET)).toBeNull();
  });
  it('rejects token signed with a different secret', () => {
    const t = makeUnsubToken('a@x.com', SECRET);
    expect(verifyUnsubToken(t, 'other-secret')).toBeNull();
  });
  it('returns null for malformed input', () => {
    expect(verifyUnsubToken('', SECRET)).toBeNull();
    expect(verifyUnsubToken('nodot', SECRET)).toBeNull();
  });
  it('rejects a token whose signature length differs without throwing', () => {
    const t = makeUnsubToken('a@x.com', SECRET);
    const [b] = t.split('.');
    expect(verifyUnsubToken(`${b}.short`, SECRET)).toBeNull();
    expect(() => verifyUnsubToken(`${b}.short`, SECRET)).not.toThrow();
  });
});

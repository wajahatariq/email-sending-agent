import { describe, it, expect } from 'vitest';
import { encryptSecret, decryptSecret } from '../../src/lib/crypto';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('crypto', () => {
  it('roundtrips a secret', () => {
    const enc = encryptSecret('hunter2', KEY);
    expect(enc).not.toContain('hunter2');
    expect(decryptSecret(enc, KEY)).toBe('hunter2');
  });

  it('produces different ciphertext each call (random IV)', () => {
    expect(encryptSecret('x', KEY)).not.toBe(encryptSecret('x', KEY));
  });

  it('throws on tampered ciphertext', () => {
    const enc = encryptSecret('secret', KEY);
    const bad = enc.slice(0, -2) + (enc.endsWith('aa') ? 'bb' : 'aa');
    expect(() => decryptSecret(bad, KEY)).toThrow();
  });
});

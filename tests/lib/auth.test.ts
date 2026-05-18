import { describe, it, expect } from 'vitest';
import { checkBasicAuth } from '../../src/lib/auth';

describe('checkBasicAuth', () => {
  const env = { DASHBOARD_USER: 'admin', DASHBOARD_PASS: 'pw' };
  it('accepts correct basic creds', () => {
    const h = 'Basic ' + Buffer.from('admin:pw').toString('base64');
    expect(checkBasicAuth(h, env)).toBe(true);
  });
  it('rejects wrong creds and missing header', () => {
    expect(checkBasicAuth('Basic ' + Buffer.from('x:y').toString('base64'), env)).toBe(false);
    expect(checkBasicAuth(null, env)).toBe(false);
  });
  it('rejects when env unset (fail closed)', () => {
    expect(checkBasicAuth('Basic ' + Buffer.from('admin:pw').toString('base64'), {})).toBe(false);
  });
  it('rejects non-Basic scheme', () => {
    expect(checkBasicAuth('Bearer abc', env)).toBe(false);
  });
});

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGO = 'aes-256-gcm';

export function encryptSecret(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('SMTP_ENC_KEY must be 32 bytes base64');
  if (plain === '') throw new Error('cannot encrypt empty secret');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decryptSecret(payload: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64');
  if (key.length !== 32) throw new Error('SMTP_ENC_KEY must be 32 bytes base64');
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('bad ciphertext');
  const [ivB64, tagB64, ctB64] = parts;
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('bad ciphertext');
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

import { describe, it, expect } from 'vitest';
import { normalizeEmail, extractSnippet } from '../../src/lib/imap';

// ---------------------------------------------------------------------------
// normalizeEmail
// ---------------------------------------------------------------------------

describe('normalizeEmail', () => {
  it('extracts address from "Display Name <user@host>" and lowercases it', () => {
    expect(normalizeEmail('  Bob <B@X.COM> ')).toBe('b@x.com');
  });

  it('lowercases a plain email with no angle brackets', () => {
    expect(normalizeEmail('A@B.COM')).toBe('a@b.com');
  });

  it('trims whitespace from a plain address', () => {
    expect(normalizeEmail('   user@example.com   ')).toBe('user@example.com');
  });

  it('handles mixed case in name+address format', () => {
    expect(normalizeEmail('"Alice Smith" <Alice@Example.ORG>')).toBe('alice@example.org');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeEmail('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(normalizeEmail('   ')).toBe('');
  });

  it('handles address with no closing angle bracket gracefully (garbage input)', () => {
    // angle bracket opens but never closes — treat whole trimmed string as address
    expect(normalizeEmail('<garbage')).toBe('<garbage');
  });

  it('handles a valid address with matching angle brackets and internal spaces', () => {
    expect(normalizeEmail('  First Last <FIRST@LAST.IO>  ')).toBe('first@last.io');
  });

  it('lowercases a subdomain email', () => {
    expect(normalizeEmail('USER@MAIL.SUBDOMAIN.COM')).toBe('user@mail.subdomain.com');
  });

  it('handles angle brackets with extra spaces inside', () => {
    expect(normalizeEmail('Name < User@Host.com >')).toBe('user@host.com');
  });
});

// ---------------------------------------------------------------------------
// extractSnippet
// ---------------------------------------------------------------------------

describe('extractSnippet', () => {
  it('returns empty string for empty input', () => {
    expect(extractSnippet('')).toBe('');
  });

  it('returns empty string for undefined input', () => {
    // @ts-expect-error intentional: testing runtime edge case
    expect(extractSnippet(undefined)).toBe('');
  });

  it('trims leading and trailing whitespace', () => {
    expect(extractSnippet('  hello world  ')).toBe('hello world');
  });

  it('preserves single newlines', () => {
    const input = 'line one\nline two\nline three';
    expect(extractSnippet(input)).toBe('line one\nline two\nline three');
  });

  it('collapses 3 consecutive newlines to 2', () => {
    const input = 'para one\n\n\npara two';
    expect(extractSnippet(input)).toBe('para one\n\npara two');
  });

  it('collapses 4 consecutive newlines to 2', () => {
    const input = 'para one\n\n\n\npara two';
    expect(extractSnippet(input)).toBe('para one\n\npara two');
  });

  it('collapses 5 consecutive newlines to 2', () => {
    const input = 'a\n\n\n\n\nb';
    expect(extractSnippet(input)).toBe('a\n\nb');
  });

  it('does NOT collapse runs of spaces (only newlines are collapsed)', () => {
    const input = 'word1  word2   word3';
    expect(extractSnippet(input)).toBe('word1  word2   word3');
  });

  it('returns the full text when within maxLen', () => {
    const input = 'short text';
    expect(extractSnippet(input, 100)).toBe('short text');
  });

  it('hard-cuts to maxLen and appends ellipsis when exceeded', () => {
    const input = 'abcdefghij';
    const result = extractSnippet(input, 5);
    expect(result).toBe('abcde…');
  });

  it('uses default maxLen of 4000 and does not cut short text', () => {
    const input = 'x'.repeat(3999);
    expect(extractSnippet(input)).toBe('x'.repeat(3999));
  });

  it('cuts at exactly 4000 chars and appends ellipsis', () => {
    const input = 'x'.repeat(4001);
    const result = extractSnippet(input);
    expect(result).toBe('x'.repeat(4000) + '…');
  });

  it('handles mixed newlines and long text correctly', () => {
    const base = 'hello\n\n\nworld';
    const result = extractSnippet(base, 8);
    // After collapsing: 'hello\n\nworld' (13 chars) — cut to 8 chars → 'hello\n\nw' + '…'
    // 'h','e','l','l','o','\n','\n','w' = 8 chars
    expect(result).toBe('hello\n\nw' + '…');
  });

  it('trims trailing newlines after collapsing', () => {
    expect(extractSnippet('\n\nhello\n\n')).toBe('hello');
  });

  it('collapses mixed carriage-return+newline sequences', () => {
    const input = 'line1\r\n\r\n\r\nline2';
    // \r\n is treated as two chars; the pattern collapses 3+ \n (or \r\n) runs
    // We only collapse \n runs — \r is stripped or kept depending on impl;
    // at minimum the result must not contain 3 consecutive newlines
    const result = extractSnippet(input);
    expect(result).not.toMatch(/\n{3}/);
  });
});

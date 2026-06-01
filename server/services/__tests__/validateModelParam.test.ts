import { describe, expect, it } from 'vitest';
import { validateModelParam } from '../claudeRunner.js';

describe('validateModelParam', () => {
  it('accepts known aliases', () => {
    expect(validateModelParam('sonnet')).toBe('sonnet');
    expect(validateModelParam('opus')).toBe('opus');
    expect(validateModelParam('haiku')).toBe('haiku');
  });

  it('returns undefined for "auto"', () => {
    // "auto" means "let the route's hardcoded default apply" — we explicitly
    // do NOT pass it through to the CLI.
    expect(validateModelParam('auto')).toBeUndefined();
  });

  it('returns undefined for unknown strings (defends against URL tampering)', () => {
    expect(validateModelParam('gpt-4')).toBeUndefined();
    expect(validateModelParam('claude-3-5-sonnet')).toBeUndefined();
    expect(validateModelParam('')).toBeUndefined();
  });

  it('returns undefined for non-string inputs', () => {
    expect(validateModelParam(undefined)).toBeUndefined();
    expect(validateModelParam(null)).toBeUndefined();
    expect(validateModelParam(123)).toBeUndefined();
    expect(validateModelParam(['sonnet'])).toBeUndefined();
  });
});

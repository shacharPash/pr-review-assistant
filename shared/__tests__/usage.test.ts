import { describe, expect, it } from 'vitest';
import { addUsage, EMPTY_USAGE, formatTokens, totalTokens } from '../usage.js';

describe('formatTokens', () => {
  it('keeps raw numbers under 1k', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('uses k for thousands with one decimal under 10k', () => {
    expect(formatTokens(1_000)).toBe('1.0k');
    expect(formatTokens(1_234)).toBe('1.2k');
    expect(formatTokens(9_999)).toBe('10.0k');
  });

  it('uses k without decimals once well into 5-digit range', () => {
    expect(formatTokens(12_345)).toBe('12k');
    expect(formatTokens(999_999)).toBe('1000k');
  });

  it('switches to M at one million', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(1_500_000)).toBe('1.5M');
    expect(formatTokens(12_300_000)).toBe('12M');
  });
});

describe('addUsage', () => {
  it('sums all four fields', () => {
    const a = { input: 100, output: 50, cacheRead: 10, cacheCreation: 5 };
    const b = { input: 200, output: 30, cacheRead: 0, cacheCreation: 1 };
    expect(addUsage(a, b)).toEqual({ input: 300, output: 80, cacheRead: 10, cacheCreation: 6 });
  });

  it('is identity when added to EMPTY_USAGE', () => {
    const x = { input: 5, output: 5, cacheRead: 5, cacheCreation: 5 };
    expect(addUsage(EMPTY_USAGE, x)).toEqual(x);
  });
});

describe('totalTokens', () => {
  it('returns input + output (not cache)', () => {
    expect(totalTokens({ input: 100, output: 50, cacheRead: 1000, cacheCreation: 500 })).toBe(150);
  });
});

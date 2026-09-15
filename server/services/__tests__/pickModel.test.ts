import { describe, expect, it } from 'vitest';
import { pickModel } from '../claudeRunner.js';

describe('pickModel', () => {
  it('returns the explicit model choice', () => {
    expect(pickModel('opus')).toBe('opus');
    expect(pickModel('sonnet')).toBe('sonnet');
    expect(pickModel('haiku')).toBe('haiku');
  });

  it('applies the choice regardless of route tier (tier is ignored)', () => {
    expect(pickModel('haiku', 'heavy')).toBe('haiku');
    expect(pickModel('opus', 'light')).toBe('opus');
  });

  it('falls back to sonnet for missing or unknown values', () => {
    expect(pickModel(undefined)).toBe('sonnet');
    expect(pickModel('')).toBe('sonnet');
    expect(pickModel('smart')).toBe('sonnet'); // legacy value no longer recognized server-side
    expect(pickModel(123)).toBe('sonnet');
  });
});

import { describe, expect, it } from 'vitest';
import { pickModel } from '../claudeRunner.js';

describe('pickModel', () => {
  describe('heavy routes (TL;DR, diagram)', () => {
    it('returns opus when mode is smart', () => {
      expect(pickModel('smart', 'heavy')).toBe('opus');
    });

    it('returns sonnet when mode is fast', () => {
      expect(pickModel('fast', 'heavy')).toBe('sonnet');
    });

    it('defaults to smart (opus) when mode is missing or invalid', () => {
      // Demo URLs may be hand-crafted; better to err toward quality than fail.
      expect(pickModel(undefined, 'heavy')).toBe('opus');
      expect(pickModel('', 'heavy')).toBe('opus');
      expect(pickModel('opus', 'heavy')).toBe('opus');
      expect(pickModel(123, 'heavy')).toBe('opus');
    });
  });

  describe('light routes (headline, before-after, complexity, personas)', () => {
    it('always returns sonnet, regardless of mode', () => {
      // The whole point of the two-tier scheme: Opus on short outputs would
      // just burn tokens with no quality gain. Light routes are pinned.
      expect(pickModel('smart', 'light')).toBe('sonnet');
      expect(pickModel('fast', 'light')).toBe('sonnet');
      expect(pickModel(undefined, 'light')).toBe('sonnet');
      expect(pickModel('opus', 'light')).toBe('sonnet');
    });
  });
});

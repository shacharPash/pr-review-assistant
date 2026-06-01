import { describe, expect, it } from 'vitest';
import { detectJiraKeys } from '../jira.js';

describe('detectJiraKeys', () => {
  it('finds a simple ticket key', () => {
    expect(detectJiraKeys('PROJ-123: fix bug')).toEqual(['PROJ-123']);
  });

  it('finds multiple unique keys', () => {
    expect(
      detectJiraKeys('PROJ-1', 'related to PROJ-2', undefined, 'see PROJ-1 and ABC-99'),
    ).toEqual(['PROJ-1', 'PROJ-2', 'ABC-99']);
  });

  // Project key prefix must be ≥ 2 chars per the underlying regex
  // [A-Z][A-Z0-9]+ — Jira itself requires this too (RED, INGEST, PROJ, …).
  it('preserves first-seen order across the inputs', () => {
    expect(detectJiraKeys('AB-1 CD-2 AB-1 EF-3')).toEqual(['AB-1', 'CD-2', 'EF-3']);
  });

  it('does NOT match single-letter project prefixes', () => {
    expect(detectJiraKeys('A-1 B-2')).toEqual([]);
  });

  it('ignores undefined inputs gracefully', () => {
    expect(detectJiraKeys(undefined, undefined)).toEqual([]);
  });

  it('does NOT match lowercase or mixed-case prefixes', () => {
    // Convention: Jira keys are ALL-CAPS prefix + dash + digits
    expect(detectJiraKeys('proj-1 Proj-2')).toEqual([]);
  });

  it('does not collide with version strings', () => {
    // "v1.2.3-rc4" etc shouldn't match
    expect(detectJiraKeys('v1.2.3 release')).toEqual([]);
  });

  it('skips inputs that are just numbers / non-words', () => {
    expect(detectJiraKeys('123', '!@#', '   ')).toEqual([]);
  });

  describe('sub-ID dedup', () => {
    it('drops a key that is a numeric prefix of another detected key', () => {
      // PROJ-196 should be suppressed when PROJ-196023 is also present.
      expect(
        detectJiraKeys('Fixes PROJ-196023 — see also PROJ-196'),
      ).toEqual(['PROJ-196023']);
    });

    it('keeps unrelated keys with different numeric values', () => {
      expect(
        detectJiraKeys('Touches PROJ-123 and PROJ-456'),
      ).toEqual(['PROJ-123', 'PROJ-456']);
    });

    it('does not cross-suppress between different projects', () => {
      // PROJ-1 is not a prefix of ABC-1 — both kept.
      expect(detectJiraKeys('PROJ-1 ABC-1')).toEqual(['PROJ-1', 'ABC-1']);
    });

    it('handles longer chains (A is prefix of B is prefix of C)', () => {
      expect(detectJiraKeys('PROJ-12 PROJ-12345 PROJ-1')).toEqual(['PROJ-12345']);
    });
  });
});

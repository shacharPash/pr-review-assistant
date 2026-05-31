import { describe, expect, it } from 'vitest';
import { detectJiraKeys } from '../jira.js';

describe('detectJiraKeys', () => {
  it('finds a simple ticket key', () => {
    expect(detectJiraKeys('RED-123: fix bug')).toEqual(['RED-123']);
  });

  it('finds multiple unique keys', () => {
    expect(
      detectJiraKeys('RED-1', 'related to RED-2', undefined, 'see RED-1 and ABC-99'),
    ).toEqual(['RED-1', 'RED-2', 'ABC-99']);
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
    expect(detectJiraKeys('red-1 Red-2')).toEqual([]);
  });

  it('does not collide with version strings', () => {
    // "v1.2.3-rc4" etc shouldn't match
    expect(detectJiraKeys('v1.2.3 release')).toEqual([]);
  });

  it('skips inputs that are just numbers / non-words', () => {
    expect(detectJiraKeys('123', '!@#', '   ')).toEqual([]);
  });
});

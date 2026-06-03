import { describe, expect, it } from 'vitest';
import { checklistSource, detectJiraKeys } from '../jira.js';
import type { JiraInfo, JiraTicket } from '../jira.js';

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

  describe('sub-ID dedup', () => {
    it('drops a key that is a numeric prefix of another detected key', () => {
      // RED-196 should be suppressed when RED-196023 is also present.
      expect(
        detectJiraKeys('Fixes RED-196023 — see also RED-196'),
      ).toEqual(['RED-196023']);
    });

    it('keeps unrelated keys with different numeric values', () => {
      expect(
        detectJiraKeys('Touches RED-123 and RED-456'),
      ).toEqual(['RED-123', 'RED-456']);
    });

    it('does not cross-suppress between different projects', () => {
      // RED-1 is not a prefix of ABC-1 — both kept.
      expect(detectJiraKeys('RED-1 ABC-1')).toEqual(['RED-1', 'ABC-1']);
    });

    it('handles longer chains (A is prefix of B is prefix of C)', () => {
      expect(detectJiraKeys('RED-12 RED-12345 RED-1')).toEqual(['RED-12345']);
    });
  });
});

describe('checklistSource', () => {
  const ticket = (over: Partial<JiraTicket> = {}): JiraTicket => ({
    key: 'RED-1',
    title: 'Async cache eviction',
    status: 'In Progress',
    type: 'Story',
    description: 'AC: eviction must not block request threads.',
    url: 'https://x.atlassian.net/browse/RED-1',
    ...over,
  });
  const info = (over: Partial<JiraInfo> = {}): JiraInfo => ({
    configured: true,
    tickets: [ticket()],
    ...over,
  });

  it('picks Jira mode when fully configured and a ticket has a description', () => {
    const res = checklistSource(info());
    expect(res.mode).toBe('jira');
    if (res.mode === 'jira') expect(res.ticket.key).toBe('RED-1');
  });

  it('falls back to AI when configured but no ticket has a description', () => {
    expect(checklistSource(info({ tickets: [ticket({ description: '' })] })).mode).toBe('ai');
  });

  it('falls back to AI in link-only mode (configured=false)', () => {
    // Link-only stubs carry empty descriptions and configured=false.
    expect(checklistSource(info({ configured: false })).mode).toBe('ai');
  });

  it('falls back to AI when there is no Jira info at all', () => {
    expect(checklistSource(undefined).mode).toBe('ai');
  });

  it('skips description-less tickets and grounds on the first usable one', () => {
    const res = checklistSource(
      info({ tickets: [ticket({ key: 'RED-1', description: '  ' }), ticket({ key: 'RED-2' })] }),
    );
    expect(res.mode).toBe('jira');
    if (res.mode === 'jira') expect(res.ticket.key).toBe('RED-2');
  });
});

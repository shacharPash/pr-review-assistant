import { describe, it, expect } from 'vitest';
import { parsePrUrl, canonicalPrUrl, buildTargetUrl } from './prUrl.js';

describe('parsePrUrl', () => {
  it('parses a PR page URL', () => {
    expect(parsePrUrl('https://github.com/cli/cli/pull/13509')).toEqual({
      owner: 'cli',
      repo: 'cli',
      number: 13509,
    });
  });

  it('parses a PR sub-page URL (files/commits/hash)', () => {
    expect(parsePrUrl('https://github.com/cli/cli/pull/13509/files#diff-abc')).toEqual({
      owner: 'cli',
      repo: 'cli',
      number: 13509,
    });
  });

  it('returns null for a non-PR github URL', () => {
    expect(parsePrUrl('https://github.com/cli/cli/issues/42')).toBeNull();
  });

  it('returns null for a non-github URL', () => {
    expect(parsePrUrl('https://example.com/cli/cli/pull/1')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(parsePrUrl(undefined)).toBeNull();
  });

  it('returns null for PR number zero', () => {
    expect(parsePrUrl('https://github.com/cli/cli/pull/0')).toBeNull();
  });

  it('returns null for trailing garbage after the PR number', () => {
    expect(parsePrUrl('https://github.com/cli/cli/pull/13509extra')).toBeNull();
  });

  it('round-trips through canonicalPrUrl', () => {
    const url = 'https://github.com/cli/cli/pull/13509';
    expect(canonicalPrUrl(parsePrUrl(url)!)).toBe(url);
  });
});

describe('canonicalPrUrl', () => {
  it('rebuilds a clean PR URL from parsed parts', () => {
    expect(canonicalPrUrl({ owner: 'cli', repo: 'cli', number: 13509 })).toBe(
      'https://github.com/cli/cli/pull/13509',
    );
  });
});

describe('buildTargetUrl', () => {
  it('builds the localhost target with an encoded ?pr=', () => {
    expect(
      buildTargetUrl('https://github.com/cli/cli/pull/13509', 'http://localhost:5173'),
    ).toBe('http://localhost:5173/?pr=https%3A%2F%2Fgithub.com%2Fcli%2Fcli%2Fpull%2F13509');
  });

  it('uses the default localhost:5173 base when none is given', () => {
    expect(buildTargetUrl('https://github.com/cli/cli/pull/13509')).toBe(
      'http://localhost:5173/?pr=https%3A%2F%2Fgithub.com%2Fcli%2Fcli%2Fpull%2F13509',
    );
  });
});

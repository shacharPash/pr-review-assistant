import { describe, expect, it } from 'vitest';
import { parsePRRef, GHError, isValidGitHubName } from '../ghFetcher.js';

describe('parsePRRef', () => {
  it('parses a full https GitHub URL', () => {
    const r = parsePRRef('https://github.com/cli/cli/pull/13509');
    expect(r).toEqual({ owner: 'cli', repo: 'cli', number: 13509 });
  });

  it('parses an owner/repo#number shorthand', () => {
    const r = parsePRRef('cli/cli#13509');
    expect(r).toEqual({ owner: 'cli', repo: 'cli', number: 13509 });
  });

  it('strips trailing .git from the repo segment', () => {
    const r = parsePRRef('https://github.com/owner/repo.git/pull/1');
    expect(r.repo).toBe('repo');
  });

  it('tolerates surrounding whitespace', () => {
    const r = parsePRRef('  https://github.com/foo/bar/pull/42  \n');
    expect(r).toEqual({ owner: 'foo', repo: 'bar', number: 42 });
  });

  it('throws GHError on a non-GitHub URL', () => {
    expect(() => parsePRRef('https://example.com/foo/bar/pull/1')).toThrow(GHError);
  });

  it('throws GHError on a garbage input', () => {
    expect(() => parsePRRef('not a url')).toThrow(GHError);
  });

  it('throws GHError on an empty string', () => {
    expect(() => parsePRRef('')).toThrow(GHError);
  });

  // Hardening: even if a refs contains nasty characters, parsePRRef only
  // accepts inputs that match its shape — and subprocess callers use
  // execFile with array args (no shell), so a weird repo name becomes a
  // literal arg to `gh`, not shell-evaluated. We test the shape-rejection
  // here; the array-args defense is exercised in code review.
  it('rejects refs that obviously violate the shape', () => {
    expect(() => parsePRRef('foo/bar; rm -rf /#1')).toThrow(GHError);
    expect(() => parsePRRef('not a valid ref')).toThrow(GHError);
    expect(() => parsePRRef('missing-the-number')).toThrow(GHError);
  });

  it('accepts owner and repo names with dots, dashes and underscores', () => {
    const expected = { owner: 'my-org', repo: 'my_repo.js', number: 7 };
    expect(parsePRRef('https://github.com/my-org/my_repo.js/pull/7/files')).toEqual(expected);
    expect(parsePRRef('github.com/my-org/my_repo.js/pull/7')).toEqual(expected);
    expect(parsePRRef('www.github.com/my-org/my_repo.js/pull/7')).toEqual(expected);
    expect(parsePRRef('my-org/my_repo.js#7')).toEqual(expected);
  });

  it.each([
    '@.env/repo#1',
    'owner/@.env#1',
    '{owner}/{repo}#1',
    '../repo#1',
    'owner/a/b#1',
    `${'a'.repeat(101)}/repo#1`,
    'https://github.com/@.env/repo/pull/1',
    'https://github.com/owner/%7Brepo%7D/pull/1',
  ])('rejects owner or repo names gh could misread: %s', (input) => {
    expect(() => parsePRRef(input)).toThrow(GHError);
  });

  it.each([
    'https://evil.example/?next=https://github.com/a/b/pull/1',
    'https://notgithub.com/a/b/pull/1',
    'https://github.com.evil.example/a/b/pull/1',
  ])('only accepts URLs on github.com itself: %s', (input) => {
    expect(() => parsePRRef(input)).toThrow(GHError);
  });
});

describe('isValidGitHubName', () => {
  it('accepts names up to 100 characters from the GitHub name alphabet', () => {
    expect(isValidGitHubName('a'.repeat(100))).toBe(true);
    expect(isValidGitHubName('.github')).toBe(true);
  });

  it.each(['', '.', '..', 'a'.repeat(101), '@.env', '{owner}', 'a b', 'a/b', 'a#1', 42, null])('rejects %j', (value) => {
    expect(isValidGitHubName(value)).toBe(false);
  });
});

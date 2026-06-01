import { describe, expect, it } from 'vitest';
import { parsePRRef, GHError } from '../ghFetcher.js';

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
});

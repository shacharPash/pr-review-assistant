import { describe, expect, it } from 'vitest';
import { summarize, type CheckRun } from '../checks.js';

function run(name: string, bucket: CheckRun['bucket']): CheckRun {
  return {
    name,
    workflow: 'CI',
    bucket,
    state: bucket.toUpperCase(),
    link: '',
    startedAt: null,
    completedAt: null,
  };
}

describe('summarize', () => {
  it('returns overall=none for an empty list', () => {
    expect(summarize([]).overall).toBe('none');
  });

  it('overall=pass when every check passed', () => {
    const s = summarize([run('a', 'pass'), run('b', 'pass')]);
    expect(s.overall).toBe('pass');
    expect(s.passed).toBe(2);
  });

  it('one failure flips overall to fail, even with mostly passing checks', () => {
    // Failure dominates because the reviewer needs to act on it — burying it
    // under a "passing" rollup would be the worst kind of silent failure.
    const s = summarize([run('a', 'pass'), run('b', 'pass'), run('c', 'fail')]);
    expect(s.overall).toBe('fail');
    expect(s.failed).toBe(1);
  });

  it('pending wins over pass when no failures', () => {
    const s = summarize([run('a', 'pass'), run('b', 'pending')]);
    expect(s.overall).toBe('pending');
    expect(s.pending).toBe(1);
  });

  it('fail beats pending when both are present', () => {
    const s = summarize([run('a', 'pending'), run('b', 'fail')]);
    expect(s.overall).toBe('fail');
  });

  it('skipped checks do not promote overall above pass', () => {
    const s = summarize([run('a', 'pass'), run('b', 'skipping')]);
    expect(s.overall).toBe('pass');
    expect(s.skipped).toBe(1);
  });

  it('all-skipped yields pass (nothing to act on)', () => {
    expect(summarize([run('a', 'skipping'), run('b', 'skipping')]).overall).toBe('pass');
  });
});

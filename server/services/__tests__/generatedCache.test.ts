import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache, generatedIdentity, getGenerated, getReviewComments, setBundle, setGenerated, setReviewComments } from '../cache.js';
import type { PRBundle } from '../../../shared/types.js';

describe('generated context identity', () => {
  it('does not replay a different model, prompt kind or changed metadata at the same head', () => {
    const bundle = { meta: { owner: 'fixture', repo: 'repo', number: 1, headSha: 'abc', body: 'Before' }, files: [] } as unknown as PRBundle;
    const key = generatedIdentity(bundle, 'summary', 'sonnet');
    setBundle(bundle);
    setGenerated('fixture', 'repo', 1, 'abc', key, 'old result');
    expect(getGenerated('fixture', 'repo', 1, 'abc', key)).toBe('old result');
    expect(generatedIdentity(bundle, 'summary', 'opus')).not.toBe(key);
    expect(generatedIdentity(bundle, 'checklist', 'sonnet')).not.toBe(key);
    const updated = { ...bundle, meta: { ...bundle.meta, body: 'After' } };
    setBundle(updated);
    // A late old request must not become the result for the new context.
    setGenerated('fixture', 'repo', 1, 'abc', key, 'late old result');
    expect(getGenerated('fixture', 'repo', 1, 'abc', generatedIdentity(updated, 'summary', 'sonnet'))).toBeUndefined();
  });
});


afterEach(() => { clearCache(); vi.useRealTimers(); });
it('unchanged reopening preserves generated data without extending expiry or stale review activity', () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(0);
  const bundle = { meta: { owner: 'fixture', repo: 'ttl', number: 1, headSha: 'abc' }, files: [] } as unknown as PRBundle;
  const identity = generatedIdentity(bundle, 'summary', 'sonnet');
  setBundle(bundle); setGenerated('fixture', 'ttl', 1, 'abc', identity, 'cached assessment');
  setReviewComments('fixture', 'ttl', 1, 'abc', { threads: [], prLevel: [] });
  vi.setSystemTime(14 * 60_000);
  setBundle(structuredClone(bundle));
  expect(getGenerated('fixture', 'ttl', 1, 'abc', identity)).toBe('cached assessment');
  expect(getReviewComments('fixture', 'ttl', 1, 'abc')).toBeUndefined();
  vi.setSystemTime(15 * 60_000);
  expect(getGenerated('fixture', 'ttl', 1, 'abc', identity)).toBeUndefined();
});

it.each(['body', 'baseSha', 'jira'])('invalidates generated data when %s changes at the same head', (field) => {
  const bundle = { meta: { owner: 'fixture', repo: 'context', number: 1, headSha: 'abc', body: 'Before', baseSha: 'base' }, files: [] } as unknown as PRBundle;
  const identity = generatedIdentity(bundle, 'summary', 'sonnet');
  setBundle(bundle); setGenerated('fixture', 'context', 1, 'abc', identity, 'obsolete');
  const changed = field === 'jira' ? { ...bundle, jira: { summary: 'Updated context' } } : { ...bundle, meta: { ...bundle.meta, [field]: 'Changed' } };
  setBundle(changed as PRBundle);
  expect(getGenerated('fixture', 'context', 1, 'abc', identity)).toBeUndefined();
});

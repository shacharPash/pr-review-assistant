import { describe, expect, it } from 'vitest';
import { generatedIdentity, getGenerated, setBundle, setGenerated } from '../cache.js';
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

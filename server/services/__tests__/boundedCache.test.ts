import { describe, expect, it } from 'vitest';
import { BoundedCache } from '../boundedCache.js';

describe('process-local cache retention', () => {
  it('expires even a repeatedly accessed or updated entry', () => {
    let now = 0;
    const cache = new BoundedCache<string>(100, 3, 1000, () => now);
    cache.set('private', 'code');
    now = 99;
    expect(cache.get('private')).toBe('code');
    cache.set('private', 'AI output');
    now = 100;
    expect(cache.get('private')).toBeUndefined();
  });

  it('evicts least recently read entries at capacity', () => {
    const cache = new BoundedCache<string>(1000, 2);
    cache.set('a', 'a'); cache.set('b', 'b'); cache.get('a'); cache.set('c', 'c');
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('a');
  });

  it('bounds bytes, rejects oversized values and clears all entries', () => {
    const cache = new BoundedCache<string>(1000, 10, 10);
    cache.set('a', '1234'); cache.set('b', '5678');
    expect(cache.get('a')).toBeUndefined();
    cache.set('huge', 'x'.repeat(20));
    expect(cache.get('huge')).toBeUndefined();
    cache.clear();
    expect(cache.get('b')).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { applicationData, clearApplicationData, isAIEnabled } from './privacy.js';

function storageFixture(): Storage {
  const values = new Map([['pra.comments:owner/repo#1', 'private draft'], ['pra.aiEnabled', '1'], ['another-app-token', 'unrelated']]);
  return {
    get length() { return values.size; },
    key: (i) => [...values.keys()][i] ?? null,
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
    clear: () => { throw new Error('Must never clear another application'); },
  };
}

describe('local data controls', () => {
  it('defaults AI off without a recorded choice', () => { expect(isAIEnabled()).toBe(false); });
  it('exports and clears this application only', () => {
    const storage = storageFixture();
    expect(applicationData(storage)).toEqual({ 'pra.comments:owner/repo#1': 'private draft', 'pra.aiEnabled': '1' });
    clearApplicationData(storage);
    expect(storage.getItem('pra.comments:owner/repo#1')).toBeNull();
    expect(storage.getItem('another-app-token')).toBe('unrelated');
  });
});

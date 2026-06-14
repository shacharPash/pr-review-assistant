import { describe, it, expect } from 'vitest';
import { brandLogo } from './botLogos.js';

describe('brandLogo', () => {
  it('returns a logo url for a known brand', () => {
    expect(typeof brandLogo('sonarcloud')).toBe('string');
    expect(brandLogo('sonarcloud')).toBeTruthy();
  });
  it('returns null for an unknown / unmapped brand', () => {
    expect(brandLogo(null)).toBeNull();
    expect(brandLogo('bugbot-other')).toBeNull();
  });
});

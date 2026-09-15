import { BoundedCache } from './boundedCache.js';
import type { Comparison, DiffFile, PRBundle } from '../../shared/types.js';
import { comparisonKey, prComparison } from '../../shared/types.js';

const comparisons = new BoundedCache<{ comparison: Comparison; files: DiffFile[] }>(15 * 60_000, 20, 25 * 1024 * 1024);
export function clearComparisons(): void { comparisons.clear(); }

export function rememberComparison(comparison: Comparison, files: DiffFile[]) {
  const key = comparisonKey(comparison);
  comparisons.delete(key);
  comparisons.set(key, { comparison, files });
}

export function findComparison(bundle: PRBundle, key: string) {
  const full = prComparison(bundle);
  if (!key || key === comparisonKey(full)) return { comparison: full, files: bundle.files };
  const entry = comparisons.get(key);
  if (!entry) return undefined;
  const c = entry.comparison;
  return c.owner === full.owner && c.repo === full.repo && c.number === full.number &&
    c.prHeadSha === full.prHeadSha ? entry : undefined;
}

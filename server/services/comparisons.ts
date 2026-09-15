import type { Comparison, DiffFile, PRBundle } from '../../shared/types.js';
import { comparisonKey, prComparison } from '../../shared/types.js';

const comparisons = new Map<string, { comparison: Comparison; files: DiffFile[] }>();

export function rememberComparison(comparison: Comparison, files: DiffFile[]) {
  const key = comparisonKey(comparison);
  comparisons.delete(key);
  comparisons.set(key, { comparison, files });
  while (comparisons.size > 100) comparisons.delete(comparisons.keys().next().value!);
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

import type { DiffFile } from '../../shared/types.js';

/**
 * Heuristic reading order: production code first, then tests, then noise.
 * Within each group, interface-like files (small, declarative) come before
 * implementations. Stable sort: ties keep the input order from gh's diff.
 */
export function reorderForReading(files: DiffFile[]): DiffFile[] {
  return [...files]
    .map((file, idx) => ({ file, idx, score: scoreFile(file) }))
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      return a.idx - b.idx;
    })
    .map((entry) => entry.file);
}

function scoreFile(file: DiffFile): number {
  if (file.noise) return 1000; // always last

  const path = file.path.toLowerCase();
  const isTest =
    path.includes('/test/') ||
    path.includes('/tests/') ||
    path.includes('__tests__') ||
    /\.(test|spec)\.[a-z]+$/.test(path) ||
    /test\.java$/.test(path);

  let score = 0;
  if (isTest) score += 100; // tests after prod code

  // Interface-like signals: short paths, "interface" in path, .d.ts files
  if (path.includes('interface')) score -= 20;
  if (path.endsWith('.d.ts')) score -= 10;

  // Schema/config files that often anchor a change
  if (/(schema|model|types?)\.[a-z]+$/.test(path)) score -= 5;

  // Big files later within their group — small interface declarations first
  if (file.additions + file.deletions > 200) score += 5;

  return score;
}

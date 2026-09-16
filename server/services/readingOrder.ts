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

/**
 * Heuristic: is this a test file (or test fixture/resource)? Shared so the
 * AI Review can de-prioritize tests the same way the reading order does.
 * Covers Java (`*Test.java`, `src/test/…`), JS/TS (`*.test.*`, `*.spec.*`,
 * `__tests__`), and common `test/`, `tests/`, `spec/` directories.
 */
export function isTestFile(path: string): boolean {
  const p = path.toLowerCase();
  return (
    p.includes('/test/') ||
    p.includes('/tests/') ||
    p.includes('__tests__') ||
    p.includes('/spec/') ||
    /\.(test|spec)\.[a-z]+$/.test(p) ||
    /test\.java$/.test(p)
  );
}

function scoreFile(file: DiffFile): number {
  if (file.noise) return 1000; // always last

  const path = file.path.toLowerCase();

  let score = 0;
  if (isTestFile(path)) score += 100; // tests after prod code

  // Interface-like signals: short paths, "interface" in path, .d.ts files
  if (path.includes('interface')) score -= 20;
  if (path.endsWith('.d.ts')) score -= 10;

  // Schema/config files that often anchor a change
  if (/(schema|model|types?)\.[a-z]+$/.test(path)) score -= 5;

  // Big files later within their group — small interface declarations first
  if (file.additions + file.deletions > 200) score += 5;

  return score;
}

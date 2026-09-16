import type { DiffFile, Hunk, NoiseTag } from '../../shared/types.js';

const FILE_NOISE_PATTERNS: Array<{ tag: NoiseTag; test: (path: string) => boolean }> = [
  {
    tag: 'lockfile',
    test: (p) =>
      /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|Gemfile\.lock|poetry\.lock|composer\.lock|go\.sum)$/.test(p),
  },
  {
    tag: 'generated',
    test: (p) =>
      /(^|\/)(target|build|dist|out|generated|generated-sources|node_modules)\//.test(p) ||
      /\.min\.(js|css)$/.test(p) ||
      /\.(g|generated)\.[a-z]+$/.test(p),
  },
  {
    tag: 'ide-config',
    test: (p) =>
      /(^|\/)\.idea\//.test(p) ||
      /(^|\/)\.vscode\//.test(p) ||
      /\.iml$/.test(p) ||
      /(^|\/)\.DS_Store$/.test(p),
  },
];

export function classifyFileNoise(path: string): NoiseTag | null {
  for (const { tag, test } of FILE_NOISE_PATTERNS) {
    if (test(path)) return tag;
  }
  return null;
}

/**
 * Classifies a single hunk. Inspects only the *changed* lines (`+`/`-`),
 * not context, so a hunk with surrounding imports plus one real edit isn't
 * marked noise.
 */
export function classifyHunkNoise(hunk: Hunk, filePath: string): NoiseTag | null {
  // Keep order and multiplicity. Even indentation can be semantic (Python,
  // multiline strings), so only byte-identical content is safely hidden here.
  // Import edits may select different symbols or execute side effects.
  void filePath;
  return hunk.oldContent === hunk.newContent ? 'whitespace-only' : null;
}

/**
 * Mutates files: sets file-level noise tag and each hunk's noise tag.
 * Returns the same array for convenience.
 */
export function annotateNoise(files: DiffFile[]): DiffFile[] {
  for (const file of files) {
    file.noise = classifyFileNoise(file.path);
    // If the file itself is noise, don't bother classifying individual hunks.
    if (file.noise) continue;
    for (const hunk of file.hunks) {
      hunk.noise = classifyHunkNoise(hunk, file.path);
    }
  }
  return files;
}

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
  const ext = filePath.split('.').pop()?.toLowerCase();
  const isImportCapable = ext === 'java' || ext === 'kt' || ext === 'ts' ||
    ext === 'tsx' || ext === 'js' || ext === 'jsx' || ext === 'py' || ext === 'go';

  const oldLines = hunk.oldContent.split('\n');
  const newLines = hunk.newContent.split('\n');

  // Lines that differ. Quick approach: any line in newLines not in oldLines
  // and vice versa. Since hunks are small, this O(n*m) is fine.
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const changedNew = newLines.filter((l) => !oldSet.has(l));
  const changedOld = oldLines.filter((l) => !newSet.has(l));
  const changed = [...changedNew, ...changedOld];

  if (changed.length === 0) return 'whitespace-only';

  const allWhitespace = changed.every((l) => l.trim() === '');
  if (allWhitespace) return 'whitespace-only';

  if (isImportCapable) {
    const importLike = changed.every((l) => isImportLine(l, ext));
    if (importLike) return 'imports-only';
  }

  return null;
}

function isImportLine(line: string, ext: string | undefined): boolean {
  const t = line.trim();
  if (t === '' || t.startsWith('//') || t.startsWith('#') || t.startsWith('/*') || t.startsWith('*')) {
    return true; // blank/comment lines around imports
  }
  switch (ext) {
    case 'java':
    case 'kt':
      return /^import\s+[\w.*]+;?$/.test(t) || /^package\s+[\w.]+;?$/.test(t);
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return /^(import|export)\b/.test(t) && !/[{=]/.test(t.replace(/^import\s+[^=]*$/, ''));
    case 'py':
      return /^(import|from)\s+/.test(t);
    case 'go':
      return /^import\s/.test(t) || t === 'import (' || t === ')' || /^"[^"]+"$/.test(t);
    default:
      return false;
  }
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

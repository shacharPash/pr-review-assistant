import type { DiffFile, FileStatus, Hunk } from '../../shared/types.js';

/**
 * Parses unified diff output from `gh pr diff` into structured DiffFile[]
 * with per-hunk old/new content. Unchanged context lines are preserved
 * within each hunk, so Monaco's DiffEditor highlights the actual edits
 * (not just standalone changed lines).
 *
 * Note: only hunk regions are reconstructed — unchanged code far from any
 * edit is not present. M2.5 will add full-file fetch when needed.
 */
export function parseUnifiedDiff(raw: string): DiffFile[] {
  if (!raw.trim()) return [];

  const files: DiffFile[] = [];
  const lines = raw.split('\n');

  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('diff --git ')) {
      i++;
      continue;
    }

    const fileStart = i;
    const header = lines[i];
    const match = header.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    let oldPath = match?.[1];
    let newPath = match?.[2];

    let status: FileStatus = 'modified';
    let binary = false;
    i++;

    while (
      i < lines.length &&
      !lines[i].startsWith('diff --git ') &&
      !lines[i].startsWith('@@')
    ) {
      const line = lines[i];
      if (line.startsWith('new file mode')) status = 'added';
      else if (line.startsWith('deleted file mode')) status = 'removed';
      else if (line.startsWith('rename from ')) {
        oldPath = line.slice('rename from '.length);
        status = 'renamed';
      } else if (line.startsWith('rename to ')) {
        newPath = line.slice('rename to '.length);
      } else if (line.startsWith('Binary files')) {
        binary = true;
      } else if (line.startsWith('--- ')) {
        const p = line.slice(4);
        if (p !== '/dev/null') oldPath = stripPrefix(p);
      } else if (line.startsWith('+++ ')) {
        const p = line.slice(4);
        if (p !== '/dev/null') newPath = stripPrefix(p);
      }
      i++;
    }

    const hunkStart = i;
    while (i < lines.length && !lines[i].startsWith('diff --git ')) i++;

    const hunks = parseHunks(lines.slice(hunkStart, i));
    const additions = hunks.reduce((s, h) => s + h.additions, 0);
    const deletions = hunks.reduce((s, h) => s + h.deletions, 0);
    const rawPatch = lines.slice(fileStart, i).join('\n');

    const finalPath = newPath ?? oldPath ?? '(unknown)';
    files.push({
      path: finalPath,
      oldPath: status === 'renamed' ? oldPath : undefined,
      status,
      additions,
      deletions,
      hunks,
      rawPatch,
      binary,
      noise: null,
    });
  }

  return files;
}

function stripPrefix(p: string): string {
  if (p.startsWith('a/') || p.startsWith('b/')) return p.slice(2);
  return p;
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function parseHunks(lines: string[]): Hunk[] {
  const hunks: Hunk[] = [];
  let current: {
    header: RegExpMatchArray;
    oldBuf: string[];
    newBuf: string[];
    add: number;
    del: number;
  } | null = null;

  const flush = () => {
    if (!current) return;
    const [, oldStart, oldLines, newStart, newLines] = current.header;
    hunks.push({
      oldStart: Number(oldStart),
      oldLines: oldLines ? Number(oldLines) : 1,
      newStart: Number(newStart),
      newLines: newLines ? Number(newLines) : 1,
      oldContent: current.oldBuf.join('\n'),
      newContent: current.newBuf.join('\n'),
      additions: current.add,
      deletions: current.del,
      noise: null,
    });
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith('@@')) {
      flush();
      const m = line.match(HUNK_HEADER_RE);
      if (!m) continue;
      current = { header: m, oldBuf: [], newBuf: [], add: 0, del: 0 };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('\\')) continue; // "\ No newline at end of file"

    const marker = line[0];
    const body = line.slice(1);
    if (marker === '+') {
      current.newBuf.push(body);
      current.add++;
    } else if (marker === '-') {
      current.oldBuf.push(body);
      current.del++;
    } else {
      current.oldBuf.push(body);
      current.newBuf.push(body);
    }
  }
  flush();

  return hunks;
}

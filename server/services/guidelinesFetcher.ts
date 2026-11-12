import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DiffFile } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

/**
 * Well-known files a repo uses to describe its coding conventions / review
 * expectations. Fed to the AI Review prompt so suggestions align with THIS
 * repo's rules (the user's request: "some repos have files like this that
 * describe it"). Ordered by how authoritative/common they are; we stop once
 * we've gathered enough text.
 */
const CANDIDATE_PATHS = [
  'CLAUDE.md',
  'AGENTS.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
  'CONTRIBUTING.md',
  'docs/CONTRIBUTING.md',
  'CODING_GUIDELINES.md',
];

/** Total budget for concatenated guidelines. Keeps the prompt from ballooning. */
const MAX_TOTAL_CHARS = 10_000;
/** Per-file cap so one huge CONTRIBUTING.md can't crowd out the rest. */
const MAX_FILE_CHARS = 4_000;

async function fetchOne(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['api', '-H', 'Accept: application/vnd.github.raw', `repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`],
      { maxBuffer: 5 * 1024 * 1024, timeout: 10_000 },
    );
    const text = stdout.trim();
    return text ? text.slice(0, MAX_FILE_CHARS) : null;
  } catch {
    // 404 (file doesn't exist), auth, or network , all non-fatal. Guidelines
    // are optional context; the review still runs without them.
    return null;
  }
}

/**
 * Best-effort fetch of the repo's convention files at `ref`. Callers pass the
 * PR's base revision so a PR cannot supply its own review rules.
 * Returns a single formatted string ready to inline in a prompt, or '' when
 * the repo ships none (or gh is unavailable). Never throws.
 */
export async function fetchGuidelines(owner: string, repo: string, ref: string): Promise<string> {
  const results = await Promise.all(CANDIDATE_PATHS.map((p) => fetchOne(owner, repo, p, ref)));

  const sections: string[] = [];
  let total = 0;
  CANDIDATE_PATHS.forEach((path, i) => {
    const body = results[i];
    if (!body) return;
    if (total >= MAX_TOTAL_CHARS) return;
    const remaining = MAX_TOTAL_CHARS - total;
    const clipped = body.length > remaining ? body.slice(0, remaining) + '\n… [truncated]' : body;
    sections.push(`--- ${path} ---\n${clipped}`);
    total += clipped.length;
  });

  return sections.join('\n\n');
}

/** Convention files that the PR itself adds, edits, renames or deletes. */
export function changedGuidelinePaths(files: Pick<DiffFile, 'path' | 'oldPath'>[]): string[] {
  const touched = new Set(files.flatMap((f) => [f.path, f.oldPath]));
  return CANDIDATE_PATHS.filter((path) => touched.has(path));
}

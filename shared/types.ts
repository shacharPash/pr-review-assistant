export type FileStatus = 'added' | 'modified' | 'removed' | 'renamed';

/**
 * Categorical noise tag. Heuristics-only in v1 — anything tagged here is
 * deterministic and reproducible, so reviewers can trust what's hidden.
 */
export type NoiseTag =
  | 'generated'        // path matches generated/build output
  | 'lockfile'         // package-lock.json, yarn.lock, etc.
  | 'imports-only'     // hunk only changes import lines
  | 'whitespace-only'  // hunk only changes whitespace
  | 'ide-config';      // .idea/, *.iml, .vscode/

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  /** Lines of the old file represented by this hunk (no markers). */
  oldContent: string;
  /** Lines of the new file represented by this hunk (no markers). */
  newContent: string;
  additions: number;
  deletions: number;
  noise: NoiseTag | null;
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: FileStatus;
  additions: number;
  deletions: number;
  hunks: Hunk[];
  /** Raw unified diff for this file — verbatim from `gh pr diff`. */
  rawPatch: string;
  binary: boolean;
  /** Set when the whole file is noise (lockfile, generated, etc.). */
  noise: NoiseTag | null;
}

export interface PRMeta {
  owner: string;
  repo: string;
  number: number;
  title: string;
  body: string;
  author: string;
  headSha: string;
  baseSha: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
}

export interface PRBundle {
  meta: PRMeta;
  files: DiffFile[];
  commitMessages: string[];
  jira?: import('./jira.js').JiraInfo;
}

export interface APIError {
  error: string;
  detail?: string;
}

export interface TLDR {
  /** Streamed markdown text. */
  text: string;
  status: 'idle' | 'streaming' | 'done' | 'error';
  error?: string;
}

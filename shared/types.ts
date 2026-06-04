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
  /** Open PRs can be drafts; combined with `state` this gives the GitHub
   * status set: Draft / Open / Merged / Closed. */
  isDraft: boolean;
  /** GitHub's aggregate review decision, or null when none applies (e.g. no
   * reviewers requested, or the PR is closed/merged). */
  reviewDecision: 'approved' | 'changes_requested' | 'review_required' | null;
}

export interface PRCommit {
  oid: string;             // full SHA
  short: string;           // first 7
  message: string;
  author: string;          // login or name
  authoredAt: string;      // ISO
}

export interface PRBundle {
  meta: PRMeta;
  files: DiffFile[];
  commitMessages: string[];
  /** Full list of commits in this PR, newest first. */
  commits?: PRCommit[];
  jira?: import('./jira.js').JiraInfo;
  /**
   * When set, the bundle represents a partial diff scoped to a commit
   * range (a single commit, or "since last reviewed"). When unset, the
   * bundle is the full PR diff.
   */
  scope?: {
    kind: 'commit' | 'since-review';
    label: string;        // human-readable label for the chip
    baseSha: string;      // the SHA we diffed FROM
    headSha: string;      // the SHA we diffed TO (usually PR head)
  };
}

export interface APIError {
  error: string;
  detail?: string;
}

/**
 * A contiguous block of lines all written by the same commit, on the head
 * version of a file. Used to render hover-blame in the diff editor.
 */
export interface BlameRange {
  startingLine: number;
  endingLine: number;
  authorLogin: string | null;
  authorName: string | null;
  authoredDate: string; // ISO
  commitSha: string;
  commitMessageHeadline: string;
  commitUrl: string;
}

export interface TLDR {
  /** Streamed markdown text. */
  text: string;
  status: 'idle' | 'streaming' | 'done' | 'error';
  error?: string;
}

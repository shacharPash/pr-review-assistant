import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  brandOfLogin,
  type InlineReviewComment,
  type PRComments,
  type PRLevelComment,
  type ReviewAuthor,
} from '../../shared/reviewComments.js';

const execFileAsync = promisify(execFile);

interface GHUser {
  login: string;
  type: 'Bot' | 'User';
  avatar_url: string;
  html_url: string;
}

interface GHInline {
  id: number;
  node_id: string;
  user: GHUser;
  body: string;
  path: string;
  line: number | null;
  original_line: number | null;
  start_line: number | null;
  original_start_line: number | null;
  side: 'LEFT' | 'RIGHT' | null;
  created_at: string;
  html_url: string;
  pull_request_review_id?: number | null;
}

interface GHReview {
  id: number;
  user: GHUser;
  body: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  submitted_at: string | null;
  html_url: string;
}

interface GHIssueComment {
  id: number;
  user: GHUser;
  body: string;
  created_at: string;
  html_url: string;
}

function toAuthor(u: GHUser): ReviewAuthor {
  return {
    login: u.login,
    type: u.type,
    avatarUrl: u.avatar_url,
    htmlUrl: u.html_url,
    brand: u.type === 'Bot' ? (brandOfLogin(u.login) ?? 'bugbot-other') : brandOfLogin(u.login),
  };
}

async function ghApiJSON<T>(path: string): Promise<T> {
  // gh api auto-paginates with --paginate; combined output is a JSON array per call.
  const { stdout } = await execFileAsync('gh', ['api', '--paginate', path], {
    maxBuffer: 50 * 1024 * 1024,
    encoding: 'utf8',
  });
  // --paginate concatenates JSON arrays; join them.
  // The output is one JSON value per page, separated by newlines when paginated.
  const trimmed = stdout.trim();
  if (!trimmed) return [] as unknown as T;
  if (trimmed.startsWith('[')) {
    // Single page or concatenated — gh prints arrays as a single combined array.
    return JSON.parse(trimmed) as T;
  }
  // Defensive fallback: try parsing line-by-line and merging arrays.
  const out: unknown[] = [];
  for (const line of trimmed.split(/\n(?=\[)/)) {
    const parsed = JSON.parse(line) as unknown[];
    out.push(...parsed);
  }
  return out as unknown as T;
}

/**
 * Fetch all review activity on a PR: line-anchored comments, review summaries,
 * and PR-wide issue comments (where most bots post their reports).
 */
export async function fetchPRReviewComments(
  owner: string,
  repo: string,
  number: number,
): Promise<PRComments> {
  const base = `repos/${owner}/${repo}`;
  const [inlineRaw, reviewsRaw, issuesRaw] = await Promise.all([
    ghApiJSON<GHInline[]>(`${base}/pulls/${number}/comments`),
    ghApiJSON<GHReview[]>(`${base}/pulls/${number}/reviews`),
    ghApiJSON<GHIssueComment[]>(`${base}/issues/${number}/comments`),
  ]);

  const inline: InlineReviewComment[] = inlineRaw
    // Filter out outdated/orphaned line comments (line === null AND original_line === null).
    .filter((c) => (c.line ?? c.original_line) != null)
    .map((c) => ({
      id: String(c.id),
      author: toAuthor(c.user),
      body: c.body,
      path: c.path,
      line: (c.line ?? c.original_line) as number,
      startLine: (c.start_line ?? c.original_start_line) ?? undefined,
      side: c.side ?? 'RIGHT',
      createdAt: c.created_at,
      htmlUrl: c.html_url,
    }));

  const prLevel: PRLevelComment[] = [];

  for (const r of reviewsRaw) {
    if (!r.body?.trim()) continue; // Reviews with no body — usually just approves with no message.
    if (r.state === 'PENDING' || r.state === 'DISMISSED') continue;
    prLevel.push({
      id: `review:${r.id}`,
      author: toAuthor(r.user),
      body: r.body,
      createdAt: r.submitted_at ?? new Date().toISOString(),
      htmlUrl: r.html_url,
      reviewState: r.state as 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED',
      source: 'review',
    });
  }
  for (const c of issuesRaw) {
    prLevel.push({
      id: `issue:${c.id}`,
      author: toAuthor(c.user),
      body: c.body,
      createdAt: c.created_at,
      htmlUrl: c.html_url,
      source: 'issue-comment',
    });
  }

  // Sort PR-level newest first so the most recent reviewer activity is on top.
  prLevel.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Sort inline by file then line so the diff renders them in reading order.
  inline.sort((a, b) =>
    a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path),
  );

  return { inline, prLevel };
}

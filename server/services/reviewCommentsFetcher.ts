import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  brandOfLogin,
  type InlineReviewComment,
  type PRComments,
  type PRLevelComment,
  type ReviewAuthor,
  type ReviewThread,
} from '../../shared/reviewComments.js';

const execFileAsync = promisify(execFile);

interface GHUser {
  login: string;
  type: 'Bot' | 'User';
  avatar_url: string;
  html_url: string;
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

export interface GHThreadComment {
  databaseId: number;
  author: { login: string; url: string; avatarUrl: string; __typename: 'Bot' | 'User' } | null;
  body: string;
  path: string;
  line: number | null;
  originalLine: number | null;
  startLine: number | null;
  originalStartLine: number | null;
  diffSide: 'LEFT' | 'RIGHT' | null;
  createdAt: string;
  url: string;
}
export interface GHThreadNode {
  id: string;
  isResolved: boolean;
  isOutdated: boolean;
  comments: { nodes: GHThreadComment[] };
}
export interface GHThreadsResponse {
  data: { repository: { pullRequest: { reviewThreads: { nodes: GHThreadNode[] } } } };
  errors?: Array<{ message: string }>;
}

function authorFromGraphQL(a: GHThreadComment['author']): ReviewAuthor {
  if (!a) {
    return { login: 'ghost', type: 'User', avatarUrl: '', htmlUrl: 'https://github.com/ghost', brand: null };
  }
  return toAuthor({ login: a.login, type: a.__typename, avatar_url: a.avatarUrl, html_url: a.url });
}

/** Pure: GraphQL reviewThreads response -> ReviewThread[]. */
export function mapReviewThreads(resp: GHThreadsResponse): ReviewThread[] {
  const nodes = resp.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  const out: ReviewThread[] = [];
  for (const node of nodes) {
    const raw = node.comments?.nodes ?? [];
    if (raw.length === 0) continue;
    const root = raw[0];
    const comments: InlineReviewComment[] = raw.map((c) => ({
      id: String(c.databaseId),
      author: authorFromGraphQL(c.author),
      body: c.body,
      path: c.path,
      line: (c.line ?? c.originalLine) as number,
      startLine: (c.startLine ?? c.originalStartLine) ?? undefined,
      side: c.diffSide ?? 'RIGHT',
      createdAt: c.createdAt,
      htmlUrl: c.url,
    }));
    out.push({
      id: node.id,
      isResolved: node.isResolved,
      isOutdated: node.isOutdated,
      path: root.path,
      line: (root.line ?? root.originalLine) as number,
      startLine: (root.startLine ?? root.originalStartLine) ?? undefined,
      side: root.diffSide ?? 'RIGHT',
      replyToId: String(root.databaseId),
      comments,
    });
  }
  return out;
}

async function fetchReviewThreads(owner: string, repo: string, number: number): Promise<ReviewThread[]> {
  const query = `query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){ pullRequest(number:$number){
      reviewThreads(first:100){ nodes{
        id isResolved isOutdated
        comments(first:100){ nodes{
          databaseId author{ login url avatarUrl __typename }
          body path line originalLine startLine originalStartLine diffSide createdAt url
        } }
      } }
    } } }`;
  const { stdout } = await execFileAsync(
    'gh',
    ['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `repo=${repo}`, '-F', `number=${number}`],
    { maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' },
  );
  const resp = JSON.parse(stdout.trim() || '{}') as GHThreadsResponse;
  if (resp.errors?.length) {
    console.warn(
      `[pr-review-assistant] reviewThreads GraphQL returned errors: ${resp.errors.map((e) => e.message).join('; ')}`,
    );
  }
  const nodes = resp.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  if (nodes.length >= 100) {
    console.warn('[pr-review-assistant] reviewThreads hit the 100-thread page cap; some threads may be omitted.');
  }
  if (nodes.some((t) => (t.comments?.nodes?.length ?? 0) >= 100)) {
    console.warn('[pr-review-assistant] a review thread hit the 100-comment cap; some replies may be omitted.');
  }
  return mapReviewThreads(resp);
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
  const [threads, reviewsRaw, issuesRaw] = await Promise.all([
    fetchReviewThreads(owner, repo, number),
    ghApiJSON<GHReview[]>(`${base}/pulls/${number}/reviews`),
    ghApiJSON<GHIssueComment[]>(`${base}/issues/${number}/comments`),
  ]);

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
  threads.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)));

  return { threads, prLevel };
}

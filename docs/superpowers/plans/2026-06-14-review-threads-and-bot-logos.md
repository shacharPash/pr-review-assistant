# Review Threads + Bot Logos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show other reviewers'/bots' inline comments as GitHub-style threads — with Outdated/Resolved badges, collapse, a Reply box, and a Resolve/Unresolve button — and render each bot's real logo.

**Architecture:** Fetch inline comments as **threads via GitHub GraphQL `reviewThreads`** (the only API exposing `isResolved`/`isOutdated`/thread id/nested comments); PR-level stays REST. Two write routes (reply via REST `in_reply_to`, resolve via GraphQL mutation) perform the action, re-fetch, and return fresh `PRComments`. The client renders threads in the existing `ReviewCommentsLayer` Monaco view zones; `BotAvatar` gains curated per-brand logos.

**Tech Stack:** Node/Express, `gh` CLI (`gh api` REST + `gh api graphql`), React/TypeScript, Zustand, Monaco view zones, vitest.

**Reference spec:** `docs/superpowers/specs/2026-06-14-review-threads-and-bot-logos-design.md`

**Note on green builds:** intermediate commits may not all pass `npm run typecheck` (the `inline`→`threads` rename touches multiple files across tasks). CI runs on the PR, not per commit, so the **final** state must be green — Task 9 verifies the whole build/tests. Order is chosen to minimize the red window.

---

## File Structure

- `shared/reviewComments.ts` — add `ReviewThread`; `PRComments.inline` → `threads`.
- `server/services/reviewCommentsFetcher.ts` — GraphQL threads fetch + pure `mapReviewThreads`.
- `server/services/reviewCommentsWriter.ts` *(new)* — pure request builders + `gh` wrappers for reply/resolve.
- `server/routes/reviewComments.ts` — add `POST /api/pr/review-comments/reply` and `/resolve`.
- `server/services/cache.ts` — add `clearReviewComments`.
- `client/src/state/store.ts` — `threads`; `replyToThread`, `setThreadResolved`, per-thread action state.
- `client/src/components/BotAvatar.tsx` — curated logo → avatar → letter chain.
- `client/src/lib/botLogos.ts` *(new)* — `brandLogo(brand)` map (static imports).
- `client/src/assets/bot-logos/*` *(new)* — logo files (controller-provided).
- `client/src/components/ReviewCommentsLayer.tsx` — thread rendering, badges, collapse, reply, resolve.
- `client/src/components/ReviewActivityPane.tsx` — thread counts.
- `client/src/styles.css` — badges, logo chip, reply box, resolve button.
- `shared/__tests__/reviewThreads.test.ts`, `server/services/__tests__/reviewCommentsWriter.test.ts`, `client/src/lib/botLogos.test.ts` *(new tests)*.

---

## Task 1: Shared `ReviewThread` type

**Files:**
- Modify: `shared/reviewComments.ts`

- [ ] **Step 1: Add the `ReviewThread` interface and change `PRComments`**

In `shared/reviewComments.ts`, immediately after the `InlineReviewComment` interface add:

```ts
/**
 * A line-anchored review *thread* (one or more comments on the same spot),
 * from GitHub's GraphQL reviewThreads. Carries resolution/outdated state and
 * the node id needed to resolve/unresolve.
 */
export interface ReviewThread {
  id: string;            // GraphQL node id — resolve/unresolve target
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number;          // current line, or original line when outdated
  startLine?: number;
  side: 'LEFT' | 'RIGHT';
  replyToId: string;     // databaseId (string) of the root comment — REST in_reply_to
  comments: InlineReviewComment[];  // [0] is the root
}
```

Then change the `PRComments` interface from:

```ts
export interface PRComments {
  inline: InlineReviewComment[];
  prLevel: PRLevelComment[];
}
```

to:

```ts
export interface PRComments {
  threads: ReviewThread[];
  prLevel: PRLevelComment[];
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/reviewComments.ts
git commit -m "feat(types): add ReviewThread; PRComments.inline -> threads"
```

---

## Task 2: GraphQL threads fetch + pure mapper

**Files:**
- Modify: `server/services/reviewCommentsFetcher.ts`
- Test: `shared/__tests__/reviewThreads.test.ts`

The existing `toAuthor`, REST `ghApiJSON`, reviews/issues → `prLevel` logic stays. We replace only the inline-comments source and add a pure mapper.

- [ ] **Step 1: Write the failing test**

Create `shared/__tests__/reviewThreads.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapReviewThreads, type GHThreadsResponse } from '../../server/services/reviewCommentsFetcher.js';

const RESP: GHThreadsResponse = {
  data: { repository: { pullRequest: { reviewThreads: { nodes: [
    {
      id: 'THREAD_live',
      isResolved: false,
      isOutdated: false,
      comments: { nodes: [
        { databaseId: 101, author: { login: 'alice', url: 'https://github.com/alice', avatarUrl: 'https://a/alice.png', __typename: 'User' },
          body: 'nit: rename', path: 'src/a.ts', line: 42, originalLine: 40, startLine: null, originalStartLine: null, diffSide: 'RIGHT', createdAt: '2026-06-01T00:00:00Z', url: 'https://gh/c/101' },
        { databaseId: 102, author: { login: 'bob', url: 'https://github.com/bob', avatarUrl: 'https://a/bob.png', __typename: 'User' },
          body: 'agreed', path: 'src/a.ts', line: 42, originalLine: 40, startLine: null, originalStartLine: null, diffSide: 'RIGHT', createdAt: '2026-06-02T00:00:00Z', url: 'https://gh/c/102' },
      ] },
    },
    {
      id: 'THREAD_outdated_resolved',
      isResolved: true,
      isOutdated: true,
      comments: { nodes: [
        { databaseId: 200, author: { login: 'sonarcloud[bot]', url: 'https://github.com/sonar', avatarUrl: 'https://a/s.png', __typename: 'Bot' },
          body: 'code smell', path: 'src/b.ts', line: null, originalLine: 7, startLine: null, originalStartLine: null, diffSide: 'RIGHT', createdAt: '2026-05-01T00:00:00Z', url: 'https://gh/c/200' },
      ] },
    },
  ] } } } },
};

describe('mapReviewThreads', () => {
  const threads = mapReviewThreads(RESP);

  it('maps a live thread with its comments in order', () => {
    const t = threads.find((x) => x.id === 'THREAD_live')!;
    expect(t.isResolved).toBe(false);
    expect(t.isOutdated).toBe(false);
    expect(t.path).toBe('src/a.ts');
    expect(t.line).toBe(42);
    expect(t.side).toBe('RIGHT');
    expect(t.replyToId).toBe('101');
    expect(t.comments.map((c) => c.id)).toEqual(['101', '102']);
    expect(t.comments[0].author.type).toBe('User');
  });

  it('uses originalLine and flags state for an outdated, resolved bot thread', () => {
    const t = threads.find((x) => x.id === 'THREAD_outdated_resolved')!;
    expect(t.isResolved).toBe(true);
    expect(t.isOutdated).toBe(true);
    expect(t.line).toBe(7); // line was null -> originalLine
    expect(t.comments[0].author.type).toBe('Bot');
    expect(t.comments[0].author.brand).toBe('sonarcloud');
  });

  it('skips threads that have no comments', () => {
    const empty: GHThreadsResponse = { data: { repository: { pullRequest: { reviewThreads: { nodes: [
      { id: 'EMPTY', isResolved: false, isOutdated: false, comments: { nodes: [] } },
    ] } } } } };
    expect(mapReviewThreads(empty)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- reviewThreads`
Expected: FAIL — `mapReviewThreads`/`GHThreadsResponse` not exported.

- [ ] **Step 3: Add the GraphQL types, mapper, and fetch**

In `server/services/reviewCommentsFetcher.ts`, add the import of `ReviewThread`:

```ts
import {
  brandOfLogin,
  type InlineReviewComment,
  type PRComments,
  type PRLevelComment,
  type ReviewAuthor,
  type ReviewThread,
} from '../../shared/reviewComments.js';
```

Add these exported GraphQL types and the pure mapper (place above `fetchPRReviewComments`):

```ts
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
}

function authorFromGraphQL(a: GHThreadComment['author']): ReviewAuthor {
  if (!a) {
    return { login: 'ghost', type: 'User', avatarUrl: '', htmlUrl: '', brand: null };
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
  const resp = JSON.parse(stdout) as GHThreadsResponse;
  const nodes = resp.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  if (nodes.length >= 100) {
    console.warn('[pr-review-assistant] reviewThreads hit the 100-thread page cap; some threads may be omitted.');
  }
  return mapReviewThreads(resp);
}
```

- [ ] **Step 4: Replace the inline REST fetch with the threads fetch in `fetchPRReviewComments`**

Find the body of `fetchPRReviewComments`. Remove the inline REST call and the `inline` array construction, and change the return. Concretely, replace:

```ts
  const [inlineRaw, reviewsRaw, issuesRaw] = await Promise.all([
    ghApiJSON<GHInline[]>(`${base}/pulls/${number}/comments`),
    ghApiJSON<GHReview[]>(`${base}/pulls/${number}/reviews`),
    ghApiJSON<GHIssueComment[]>(`${base}/issues/${number}/comments`),
  ]);
```

with:

```ts
  const [threads, reviewsRaw, issuesRaw] = await Promise.all([
    fetchReviewThreads(owner, repo, number),
    ghApiJSON<GHReview[]>(`${base}/pulls/${number}/reviews`),
    ghApiJSON<GHIssueComment[]>(`${base}/issues/${number}/comments`),
  ]);
```

Delete the entire `const inline: InlineReviewComment[] = inlineRaw...map(...)` block and the later `inline.sort(...)` block. Sort threads instead — add before the return:

```ts
  threads.sort((a, b) => (a.path === b.path ? a.line - b.line : a.path.localeCompare(b.path)));
```

Change the final return to:

```ts
  return { threads, prLevel };
```

The `GHInline` interface is now unused — delete it to keep the file clean.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- reviewThreads`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add server/services/reviewCommentsFetcher.ts shared/__tests__/reviewThreads.test.ts
git commit -m "feat(server): fetch inline review comments as GraphQL threads"
```

---

## Task 3: Writer service + reply/resolve routes

**Files:**
- Create: `server/services/reviewCommentsWriter.ts`
- Modify: `server/services/cache.ts`, `server/routes/reviewComments.ts`
- Test: `server/services/__tests__/reviewCommentsWriter.test.ts`

- [ ] **Step 1: Write the failing test for the pure request builders**

Create `server/services/__tests__/reviewCommentsWriter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { replyArgs, resolveArgs } from '../reviewCommentsWriter.js';

describe('replyArgs', () => {
  it('builds gh REST args for a threaded reply', () => {
    expect(replyArgs('cli', 'cli', 13509, '101', 'thanks!')).toEqual([
      'api', '-X', 'POST', 'repos/cli/cli/pulls/13509/comments',
      '-f', 'body=thanks!', '-F', 'in_reply_to=101',
    ]);
  });
});

describe('resolveArgs', () => {
  it('uses resolveReviewThread when resolving', () => {
    const args = resolveArgs('THREAD_x', true);
    expect(args[0]).toBe('api');
    expect(args[1]).toBe('graphql');
    expect(args.join(' ')).toContain('resolveReviewThread');
    expect(args.join(' ')).toContain('id=THREAD_x');
  });
  it('uses unresolveReviewThread when unresolving', () => {
    expect(resolveArgs('THREAD_x', false).join(' ')).toContain('unresolveReviewThread');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- reviewCommentsWriter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the writer service**

Create `server/services/reviewCommentsWriter.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Pure: gh args to post a threaded reply via REST in_reply_to. */
export function replyArgs(
  owner: string, repo: string, number: number, inReplyTo: string, body: string,
): string[] {
  return [
    'api', '-X', 'POST', `repos/${owner}/${repo}/pulls/${number}/comments`,
    '-f', `body=${body}`, '-F', `in_reply_to=${inReplyTo}`,
  ];
}

/** Pure: gh args to resolve/unresolve a review thread via GraphQL. */
export function resolveArgs(threadId: string, resolved: boolean): string[] {
  const mutation = resolved ? 'resolveReviewThread' : 'unresolveReviewThread';
  const query = `mutation($id:ID!){ ${mutation}(input:{threadId:$id}){ thread{ id isResolved } } }`;
  return ['api', 'graphql', '-f', `query=${query}`, '-F', `id=${threadId}`];
}

export async function postReply(
  owner: string, repo: string, number: number, inReplyTo: string, body: string,
): Promise<void> {
  await execFileAsync('gh', replyArgs(owner, repo, number, inReplyTo, body), {
    maxBuffer: 10 * 1024 * 1024,
    encoding: 'utf8',
  });
}

export async function setResolved(threadId: string, resolved: boolean): Promise<void> {
  await execFileAsync('gh', resolveArgs(threadId, resolved), {
    maxBuffer: 10 * 1024 * 1024,
    encoding: 'utf8',
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- reviewCommentsWriter`
Expected: PASS (3 tests).

- [ ] **Step 5: Add a cache invalidator**

In `server/services/cache.ts`, find the existing `setReviewComments`/`getReviewComments` functions and add (mirroring their key construction — match the existing key style in that file):

```ts
export function clearReviewComments(owner: string, repo: string, number: number, headSha: string): void {
  reviewCommentsCache.delete(`${owner}/${repo}:${number}:${headSha}`);
}
```

If the cache map variable or key format differs, match what `getReviewComments`/`setReviewComments` use in this file (use the same map and key string).

- [ ] **Step 6: Add the reply and resolve routes**

In `server/routes/reviewComments.ts`, add imports:

```ts
import { postReply, setResolved } from '../services/reviewCommentsWriter.js';
import { getBundle, getReviewComments, setReviewComments, clearReviewComments } from '../services/cache.js';
```
(extend the existing cache import rather than duplicating it.)

Add a shared helper and the two routes after the existing GET route:

```ts
async function refetchAndCache(owner: string, repo: string, number: number, headSha: string) {
  const fresh = await fetchPRReviewComments(owner, repo, number);
  setReviewComments(owner, repo, number, headSha, fresh);
  return fresh;
}

reviewCommentsRouter.post('/api/pr/review-comments/reply', async (req: Request, res: Response) => {
  const { owner, repo, number, headSha, inReplyTo, body } = req.body ?? {};
  if (!owner || !repo || !number || !headSha || !inReplyTo || !body?.trim()) {
    return res.status(400).json({ ok: false, error: 'Missing required fields.' });
  }
  try {
    clearReviewComments(owner, repo, number, headSha);
    await postReply(owner, repo, Number(number), String(inReplyTo), String(body));
    const fresh = await refetchAndCache(owner, repo, Number(number), headSha);
    res.json({ ok: true, comments: fresh });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    res.status(502).json({ ok: false, error: e.stderr?.trim().split('\n').slice(-3).join('\n') ?? e.message });
  }
});

reviewCommentsRouter.post('/api/pr/review-comments/resolve', async (req: Request, res: Response) => {
  const { owner, repo, number, headSha, threadId, resolved } = req.body ?? {};
  if (!owner || !repo || !number || !headSha || !threadId || typeof resolved !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Missing required fields.' });
  }
  try {
    clearReviewComments(owner, repo, number, headSha);
    await setResolved(String(threadId), resolved);
    const fresh = await refetchAndCache(owner, repo, Number(number), headSha);
    res.json({ ok: true, comments: fresh });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    res.status(502).json({ ok: false, error: e.stderr?.trim().split('\n').slice(-3).join('\n') ?? e.message });
  }
});
```

Confirm `express.json()` is already applied app-wide (it is — `server/index.ts:43` `app.use(express.json(...))`), so `req.body` is parsed.

- [ ] **Step 7: Commit**

```bash
git add server/services/reviewCommentsWriter.ts server/services/cache.ts server/routes/reviewComments.ts server/services/__tests__/reviewCommentsWriter.test.ts
git commit -m "feat(server): reply + resolve/unresolve routes for review threads"
```

---

## Task 4: Store — threads + reply/resolve actions

**Files:**
- Modify: `client/src/state/store.ts`

- [ ] **Step 1: Add per-thread action state and action signatures to the store type**

Near the other review-comment state fields (around `reviewComments: PRComments | null;`), add:

```ts
  /** Per-thread pending/error state for reply & resolve, keyed by thread id. */
  threadActions: Record<string, { status: 'idle' | 'pending' | 'error'; message?: string }>;
```

In the actions section of the interface, add:

```ts
  replyToThread: (threadId: string, inReplyTo: string, body: string) => Promise<void>;
  setThreadResolved: (threadId: string, resolved: boolean) => Promise<void>;
```

In the initial state object (where `reviewComments: null,` is set), add:

```ts
  threadActions: {},
```

And in the `loadPR` reset block (where `reviewCommentsStatus` is reset), add `threadActions: {},`.

- [ ] **Step 2: Implement the two actions**

Add these methods next to `fetchReviewComments` in the store:

```ts
  async replyToThread(threadId, inReplyTo, body) {
    const { bundle } = get();
    if (!bundle) return;
    set((s) => ({ threadActions: { ...s.threadActions, [threadId]: { status: 'pending' } } }));
    try {
      const res = await fetch('/api/pr/review-comments/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: bundle.meta.owner, repo: bundle.meta.repo,
          number: bundle.meta.number, headSha: bundle.meta.headSha,
          inReplyTo, body,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Reply failed.');
      set((s) => ({
        reviewComments: data.comments as PRComments,
        threadActions: { ...s.threadActions, [threadId]: { status: 'idle' } },
      }));
    } catch (err) {
      set((s) => ({
        threadActions: { ...s.threadActions, [threadId]: { status: 'error', message: (err as Error).message } },
      }));
    }
  },

  async setThreadResolved(threadId, resolved) {
    const { bundle } = get();
    if (!bundle) return;
    set((s) => ({ threadActions: { ...s.threadActions, [threadId]: { status: 'pending' } } }));
    try {
      const res = await fetch('/api/pr/review-comments/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: bundle.meta.owner, repo: bundle.meta.repo,
          number: bundle.meta.number, headSha: bundle.meta.headSha,
          threadId, resolved,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Resolve failed.');
      set((s) => ({
        reviewComments: data.comments as PRComments,
        threadActions: { ...s.threadActions, [threadId]: { status: 'idle' } },
      }));
    } catch (err) {
      set((s) => ({
        threadActions: { ...s.threadActions, [threadId]: { status: 'error', message: (err as Error).message } },
      }));
    }
  },
```

- [ ] **Step 3: Verify the store compiles**

Run: `npm run typecheck 2>&1 | grep -i store || echo "store ok"`
Expected: `store ok` (no type errors in store.ts; other files still referencing `.inline` may error — fixed in later tasks).

- [ ] **Step 4: Commit**

```bash
git add client/src/state/store.ts
git commit -m "feat(client): store actions replyToThread + setThreadResolved"
```

---

## Task 5: Bot logos in `BotAvatar`

**Files:**
- Create: `client/src/lib/botLogos.ts`, `client/src/lib/botLogos.test.ts`
- Modify: `client/src/components/BotAvatar.tsx`
- Assets: `client/src/assets/bot-logos/*` (added by the controller before this task — see note)

> **Controller note:** the logo image files are added outside the subagent (the controller sources/normalizes them). This task wires them up and degrades gracefully when a brand has no file.

- [ ] **Step 1: Write the failing test**

Create `client/src/lib/botLogos.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { brandLogo } from './botLogos.js';

describe('brandLogo', () => {
  it('returns a logo url for a known brand', () => {
    expect(typeof brandLogo('sonarcloud')).toBe('string');
    expect(brandLogo('sonarcloud')).toBeTruthy();
  });
  it('returns null for an unknown / unmapped brand', () => {
    expect(brandLogo(null)).toBeNull();
    expect(brandLogo('bugbot-other')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- botLogos`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the logo map**

Create `client/src/lib/botLogos.ts` (Vite resolves these imports to served URLs; include only brands that have an asset file):

```ts
import type { BotBrand } from '@shared/reviewComments';
import sonarcloud from '../assets/bot-logos/sonarcloud.png';
import cursor from '../assets/bot-logos/cursor.png';
import jit from '../assets/bot-logos/jit.png';
import claude from '../assets/bot-logos/claude.png';
import copilot from '../assets/bot-logos/copilot.png';
import augment from '../assets/bot-logos/augment.png';

const LOGOS: Partial<Record<BotBrand, string>> = {
  sonarcloud, cursor, jit, claude, copilot, augment,
};

/** URL of a curated logo for the brand, or null to fall back to avatar/letter. */
export function brandLogo(brand: BotBrand | null): string | null {
  if (!brand) return null;
  return LOGOS[brand] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- botLogos`
Expected: PASS (2 tests). (Vite/vitest resolves the asset imports to string URLs.)

- [ ] **Step 5: Wire logos into `BotAvatar`**

Replace the bot branch of `client/src/components/BotAvatar.tsx`. Add the import at top:

```ts
import { brandLogo } from '../lib/botLogos.js';
```

Replace the comment + letter-chip block (everything after the `if (author.type === 'User')` return) with:

```ts
  const label = author.login.replace(/\[bot\]$/, '');
  const logo = brandLogo(author.brand);
  if (logo) {
    return (
      <span className={`rc-avatar bot logo brand-${author.brand}`} style={{ width: size, height: size }} title={label} aria-label={label}>
        <img src={logo} width={size} height={size} alt={label} loading="lazy" />
      </span>
    );
  }
  if (author.avatarUrl) {
    return (
      <img className="rc-avatar bot" src={author.avatarUrl} width={size} height={size} alt={label} title={label} loading="lazy" />
    );
  }
  const letter = (author.brand?.[0] ?? 'B').toUpperCase();
  return (
    <span
      className={`rc-avatar bot brand-${author.brand ?? 'none'}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
      title={label}
      aria-label={label}
    >
      {letter}
    </span>
  );
```

- [ ] **Step 6: Commit**

```bash
git add client/src/lib/botLogos.ts client/src/lib/botLogos.test.ts client/src/components/BotAvatar.tsx client/src/assets/bot-logos
git commit -m "feat(client): real bot logos in BotAvatar (logo -> avatar -> letter)"
```

---

## Task 6: Thread rendering in `ReviewCommentsLayer`

**Files:**
- Modify: `client/src/components/ReviewCommentsLayer.tsx`

This task switches the layer from flat comments to threads, adds badges + collapse + reply + resolve. Keep `ZoneSizer`, `setZoneHeight`, `realToMonaco`, the markdown helpers, and the view-zone registration machinery unchanged except where noted.

- [ ] **Step 1: Update imports and the `Zone` type**

Change the type import line to include `ReviewThread`:

```ts
import type { InlineReviewComment, ReviewThread } from '@shared/reviewComments';
```

Add the store hook usage near the top of the component (with the other `useStore` calls):

```ts
  const threadActions = useStore((s) => s.threadActions);
  const replyToThread = useStore((s) => s.replyToThread);
  const setThreadResolved = useStore((s) => s.setThreadResolved);
```

Change the `Zone` interface to carry threads:

```ts
interface Zone {
  id: string;
  node: HTMLDivElement;
  threads: ReviewThread[];
  line: number;
}
```

- [ ] **Step 2: Group threads (not comments) by line**

Replace the grouping block inside the effect:

```ts
    const inline = reviewComments?.inline ?? [];

    const groups = new Map<number, InlineReviewComment[]>();
    for (const c of inline) {
      if (c.path !== filePath) continue;
      if (c.side === 'LEFT') continue;
      const arr = groups.get(c.line) ?? [];
      arr.push(c);
      groups.set(c.line, arr);
    }
```

with:

```ts
    const allThreads = reviewComments?.threads ?? [];

    const groups = new Map<number, ReviewThread[]>();
    for (const t of allThreads) {
      if (t.path !== filePath) continue;
      if (t.side === 'LEFT') continue;
      const arr = groups.get(t.line) ?? [];
      arr.push(t);
      groups.set(t.line, arr);
    }
```

In the `editor.changeViewZones` loop, rename the destructured value and the pushed zone field from `comments` to `threads`:

```ts
      for (const [realLine, threads] of groups) {
```
and
```ts
        newZones.push({ id, node, threads, line: monacoLine });
```

- [ ] **Step 3: Render threads in the portal**

Replace the portal body (the `<div className="rc-thread">...</div>` that maps `z.comments`) with a map over `z.threads` rendering a new `ReviewThreadCard`:

```tsx
            <div className="rc-thread">
              {z.threads.map((t) => (
                <ReviewThreadCard
                  key={t.id}
                  thread={t}
                  collapsed={collapsedById[t.id] ?? (t.isResolved || t.isOutdated)}
                  onToggle={() => toggleCollapsed(t.id)}
                  action={threadActions[t.id] ?? { status: 'idle' }}
                  onReply={(body) => replyToThread(t.id, t.replyToId, body)}
                  onResolve={() => setThreadResolved(t.id, !t.isResolved)}
                />
              ))}
            </div>
```

> Note: `collapsedById[t.id] ?? (t.isResolved || t.isOutdated)` makes resolved/outdated threads start collapsed but still user-toggleable (once the user toggles, the explicit value wins).

- [ ] **Step 4: Replace `ReviewCommentCard` with `ReviewThreadCard`**

Delete the `ReviewCommentCard` function. Add `useState` to the React import at the top if not present (`import { useEffect, useLayoutEffect, useRef, useState } from 'react';` — it already imports these). Add the new component (keep `formatRelative`, `renderMarkdownish` as-is and reuse them):

```tsx
function ReviewThreadCard({
  thread,
  collapsed,
  onToggle,
  action,
  onReply,
  onResolve,
}: {
  thread: ReviewThread;
  collapsed: boolean;
  onToggle: () => void;
  action: { status: 'idle' | 'pending' | 'error'; message?: string };
  onReply: (body: string) => void;
  onResolve: () => void;
}) {
  const [replyText, setReplyText] = useState('');
  const root = thread.comments[0];
  const a = root.author;
  const pending = action.status === 'pending';
  const headLabel = a.login.replace(/\[bot\]$/, '');
  const preview = root.body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[#*`>_-]+/g, '')
    .trim()
    .split('\n')[0]
    .slice(0, 80);

  function submitReply() {
    const body = replyText.trim();
    if (!body || pending) return;
    onReply(body);
    setReplyText('');
  }

  return (
    <div className={`rc-card brand-${a.brand ?? 'none'} ${a.type === 'Bot' ? 'is-bot' : ''} ${collapsed ? 'collapsed' : ''} ${thread.isResolved ? 'resolved' : ''}`}>
      <div className="rc-head">
        <button type="button" className="rc-fold" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'} aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}>
          {collapsed ? '▸' : '▾'}
        </button>
        <BotAvatar author={a} />
        <span className="rc-name">{headLabel}</span>
        {a.type === 'Bot' && <span className="rc-bot-tag">bot</span>}
        {thread.isOutdated && <span className="rc-badge outdated">Outdated</span>}
        {thread.isResolved && <span className="rc-badge resolved">Resolved</span>}
        {thread.comments.length > 1 && <span className="rc-count">{thread.comments.length}</span>}
        {collapsed && preview && <span className="rc-preview">{preview}</span>}
        <span className="rc-when">{formatRelative(root.createdAt)}</span>
        <a className="rc-open" href={root.htmlUrl} target="_blank" rel="noreferrer" title="Open in GitHub">↗</a>
      </div>

      {!collapsed && (
        <>
          {thread.comments.map((c) => (
            <div key={c.id} className="rc-comment">
              <div className="rc-comment-head">
                <BotAvatar author={c.author} size={16} />
                <span className="rc-name">{c.author.login.replace(/\[bot\]$/, '')}</span>
                <span className="rc-when">{formatRelative(c.createdAt)}</span>
              </div>
              <div className="rc-body" dangerouslySetInnerHTML={{ __html: renderMarkdownish(c.body) }} />
            </div>
          ))}

          <div className="rc-thread-actions">
            <button type="button" className="rc-resolve-btn" onClick={onResolve} disabled={pending}>
              {thread.isResolved ? 'Unresolve' : 'Resolve conversation'}
            </button>
          </div>

          <div className="rc-reply">
            <textarea
              className="rc-reply-input"
              placeholder="Reply…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              disabled={pending}
              rows={2}
            />
            <button type="button" className="rc-reply-btn" onClick={submitReply} disabled={pending || !replyText.trim()}>
              {pending ? 'Posting…' : 'Reply'}
            </button>
          </div>

          {action.status === 'error' && (
            <div className="rc-action-error">⚠ {action.message ?? 'Action failed.'}</div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Verify the layer compiles and tests still pass**

Run: `npm run typecheck 2>&1 | grep -iE "ReviewCommentsLayer|store|BotAvatar" || echo "components ok"`
Expected: `components ok`.
Run: `npm test 2>&1 | tail -3`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/ReviewCommentsLayer.tsx
git commit -m "feat(client): render review threads with badges, collapse, reply, resolve"
```

---

## Task 7: Thread counts in `ReviewActivityPane`

**Files:**
- Modify: `client/src/components/ReviewActivityPane.tsx`

- [ ] **Step 1: Replace inline references with threads**

In `ReviewActivityPane.tsx`, replace:

```ts
  const inline = reviewComments?.inline ?? [];
```

with:

```ts
  const threads = reviewComments?.threads ?? [];
  const inline = threads.flatMap((t) => t.comments); // existing per-author summary still works
  const resolvedCount = threads.filter((t) => t.isResolved).length;
```

Then update the empty-state guard `if (prLevel.length === 0 && inline.length === 0)` — it still works since `inline` is derived. Update the inline summary header text from:

```tsx
            {inline.length} inline {inline.length === 1 ? 'comment' : 'comments'} on the diff
```

to:

```tsx
            {threads.length} {threads.length === 1 ? 'thread' : 'threads'} on the diff
            {resolvedCount > 0 ? ` · ${resolvedCount} resolved` : ''}
          </div>
          <div className="rc-inline-summary-title-sub">
            {inline.length} {inline.length === 1 ? 'comment' : 'comments'} total
```

(Adjust to the surrounding JSX structure — keep the existing per-author `inlineSummary` pills, which consume `inline`.)

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck 2>&1 | grep -i ReviewActivityPane || echo "pane ok"`
Expected: `pane ok`.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ReviewActivityPane.tsx
git commit -m "feat(client): thread + resolved counts in the activity pane"
```

---

## Task 8: Styles

**Files:**
- Modify: `client/src/styles.css`

- [ ] **Step 1: Add styles for badges, logo chip, reply box, resolve button**

Append to `client/src/styles.css` (match the existing `rc-*` look; these are additive):

```css
/* Bot logo avatar chip */
.rc-avatar.bot.logo { display: inline-flex; align-items: center; justify-content: center;
  border-radius: 5px; overflow: hidden; background: #fff; }
.rc-avatar.bot.logo img { object-fit: contain; display: block; }

/* Thread state badges */
.rc-badge { font-size: 10px; font-weight: 600; line-height: 1; padding: 2px 6px;
  border-radius: 999px; margin-left: 6px; text-transform: none; }
.rc-badge.outdated { color: #9a6700; background: #fff8c5; border: 1px solid #d4a72c55; }
.rc-badge.resolved { color: #1a7f37; background: #dafbe1; border: 1px solid #1a7f3755; }
.rc-card.resolved { opacity: 0.85; }
.rc-count { font-size: 10px; color: var(--rc-muted, #768390); margin-left: 6px; }

/* Per-comment block inside a thread */
.rc-comment + .rc-comment { border-top: 1px solid var(--rc-border, #30363d); margin-top: 6px; padding-top: 6px; }
.rc-comment-head { display: flex; align-items: center; gap: 6px; font-size: 12px; margin-bottom: 2px; }

/* Thread actions + reply */
.rc-thread-actions { margin-top: 8px; }
.rc-resolve-btn { font-size: 12px; padding: 3px 10px; border-radius: 6px;
  border: 1px solid var(--rc-border, #30363d); background: transparent; color: inherit; cursor: pointer; }
.rc-resolve-btn:hover:not(:disabled) { background: var(--rc-hover, #ffffff14); }
.rc-resolve-btn:disabled { opacity: 0.5; cursor: default; }
.rc-reply { display: flex; gap: 6px; margin-top: 8px; align-items: flex-end; }
.rc-reply-input { flex: 1; resize: vertical; font: inherit; font-size: 12px; padding: 6px 8px;
  border-radius: 6px; border: 1px solid var(--rc-border, #30363d); background: var(--rc-input-bg, #0d1117); color: inherit; }
.rc-reply-btn { font-size: 12px; padding: 6px 12px; border-radius: 6px; border: none;
  background: #238636; color: #fff; cursor: pointer; }
.rc-reply-btn:disabled { opacity: 0.5; cursor: default; }
.rc-action-error { color: #f85149; font-size: 12px; margin-top: 6px; }
```

(If the codebase defines theme CSS variables, prefer those over the hardcoded fallbacks; the `var(--x, fallback)` form degrades safely either way.)

- [ ] **Step 2: Commit**

```bash
git add client/src/styles.css
git commit -m "style(client): review thread badges, logo chip, reply + resolve UI"
```

---

## Task 9: Full verification

**Files:** none (whole-feature gate).

- [ ] **Step 1: Typecheck the whole project**

Run: `npm run typecheck`
Expected: clean (no errors). Fix any remaining `.inline` references it surfaces.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all green, including `reviewThreads`, `reviewCommentsWriter`, `botLogos`.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: builds with no errors (the logo asset imports resolve in the client bundle).

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "chore: fix up review-threads migration (typecheck/build green)" || echo "nothing to fix"
```

---

## Self-Review

**Spec coverage:**
- Outdated/Resolved badges → Task 6 (`rc-badge`), data from Task 2 mapper ✓
- Collapse resolved/outdated to badged header → Task 6 Step 3 (`collapsed = explicit ?? (resolved||outdated)`) ✓
- Reply → Task 3 (route) + Task 4 (`replyToThread`) + Task 6 (reply box) ✓
- Resolve/Unresolve → Task 3 (route) + Task 4 (`setThreadResolved`) + Task 6 (button) ✓
- Bot logos → Task 5 (`botLogos` + `BotAvatar`), assets controller-provided ✓
- GraphQL threads data source → Task 2 ✓; PR-level stays REST ✓
- Error handling (inline error, diff never blocked) → Task 4 (per-thread error state) + Task 6 (`rc-action-error`); fetch failure keeps existing banner ✓
- Thread counts in activity pane → Task 7 ✓
- Tests: mapper, request builders, logo map → Tasks 2, 3, 5 ✓

**Placeholder scan:** No TBD/"handle errors" placeholders; every code step has concrete code. The one controller-provided piece (logo image binaries) is explicitly flagged in Task 5, not a code placeholder.

**Type/name consistency:** `ReviewThread` fields (`id`, `isResolved`, `isOutdated`, `path`, `line`, `startLine`, `side`, `replyToId`, `comments`) defined in Task 1 and used identically in Tasks 2/6. Store actions `replyToThread(threadId, inReplyTo, body)` / `setThreadResolved(threadId, resolved)` defined in Task 4 and called with matching args in Task 6. Route paths `/api/pr/review-comments/{reply,resolve}` consistent between Tasks 3 and 4. `PRComments.threads` used consistently after Task 1. `mapReviewThreads`/`GHThreadsResponse` exported (Task 2) and imported by the test.

# Review Threads (Outdated / Resolved / Reply / Resolve) + Bot Logos

**Date:** 2026-06-14
**Status:** Approved (design)

## Problem

Other reviewers'/bots' inline comments render as flat, undifferentiated cards in the diff. The reviewer can't tell which comments are **outdated** (the code moved) or **resolved**, can't **reply**, and can't **resolve** a conversation without leaving for GitHub. Bots are shown as a tinted circle with a single letter — so Cursor, Claude, and Copilot all show "C", and nothing is recognizable at a glance.

## Goals

- Mark **outdated** and **resolved** threads with GitHub-style badges.
- **Collapse** resolved/outdated threads to a one-line badged header (active threads stay open) — keeps the diff clean, hides nothing.
- **Reply** to a thread from the diff (posts to GitHub).
- **Resolve / Unresolve** a thread from the diff.
- Show each bot's **real logo** instead of a letter.

## Non-Goals

- Creating brand-new top-level review comments from scratch here (the existing Composer already does pending review comments; this is about *others'* threads).
- Editing/deleting others' comments.
- Threads on the LEFT (old) side beyond what GitHub returns — we render whatever side the thread reports.

## Decisions (locked in brainstorming)

| Decision | Choice |
|---|---|
| Data source for inline | **GitHub GraphQL `reviewThreads`** (only API with `isResolved`/`isOutdated`/thread id/nested comments). PR-level stays REST. |
| Resolved/outdated display | **Collapse to a badged header**; active threads expanded. |
| Reply transport | REST `POST pulls/{n}/comments` with `in_reply_to` (root comment databaseId). |
| Resolve transport | GraphQL `resolveReviewThread` / `unresolveReviewThread` (thread node id). |
| Bot logo source | **Curated bundled logo per brand** → else GitHub `avatar_url` → else letter-chip. |
| After a write | Refetch review comments (force); show per-thread pending/error state. |

## Architecture / Data flow

```text
ReviewCommentsLayer (diff view zones)
  renders threads  ── reply box ──▶ POST /api/review-comments/reply  ── gh REST ──▶ GitHub
                   ── resolve btn ─▶ POST /api/review-comments/resolve ─ gh graphql ─▶ GitHub
                                          │ on success
  store.loadReviewComments(force) ◀───────┘
        │
        ▼
  GET /api/review-comments ── gh graphql reviewThreads ──▶ ReviewThread[]  (+ REST reviews/issues → prLevel)
```

## 1. Shared types (`shared/reviewComments.ts`)

Replace `PRComments.inline: InlineReviewComment[]` with `threads: ReviewThread[]`:

```ts
export interface ReviewThread {
  id: string;            // GraphQL node id — resolve/unresolve target
  isResolved: boolean;
  isOutdated: boolean;
  path: string;
  line: number;          // current line, or original line when outdated
  startLine?: number;
  side: 'LEFT' | 'RIGHT';
  replyToId: string;     // databaseId (as string) of root comment — REST in_reply_to
  comments: InlineReviewComment[];  // existing shape; [0] is the root
}
```
`InlineReviewComment` keeps its shape (used per comment inside a thread). `PRComments = { threads: ReviewThread[]; prLevel: PRLevelComment[] }`.

## 2. Server

**Fetch (`reviewCommentsFetcher.ts`):** replace the inline REST call with one `gh api graphql` call:
```graphql
query($owner:String!,$repo:String!,$number:Int!){
  repository(owner:$owner,name:$repo){
    pullRequest(number:$number){
      reviewThreads(first:100){ nodes{
        id isResolved isOutdated
        comments(first:100){ nodes{
          databaseId author{ login url avatarUrl __typename }
          body path line originalLine startLine originalStartLine
          diffHunk createdAt url
        } }
      } }
    }
  }
}
```
Map each thread node → `ReviewThread`: `path/line/side` from the root comment (`line ?? originalLine`; `side` from `diffSide`/default RIGHT); `isResolved`/`isOutdated` straight through; `replyToId = String(comments[0].databaseId)`; each comment → `InlineReviewComment` via existing `toAuthor` (note: GraphQL `__typename` "Bot"/"User" maps to author type). Reviews + issue comments stay on the existing REST path for `prLevel`. Paginate cap 100 threads / 100 comments — log if truncated (no silent cap).

**Write routes (`server/routes/reviewComments.ts` + a `reviewCommentsWriter.ts`):**
- `POST /api/review-comments/reply` `{owner,repo,number,inReplyTo,body}` → `gh api -X POST repos/{o}/{r}/pulls/{n}/comments -f body=<body> -F in_reply_to=<id>`.
- `POST /api/review-comments/resolve` `{threadId,resolved}` → `gh api graphql -f query='mutation($id:ID!){ <resolveReviewThread|unresolveReviewThread>(input:{threadId:$id}){ thread{ id isResolved } } }' -F id=<threadId>`.
- Both return `{ ok: true }` or `{ ok:false, error }` (4xx/5xx) — never throw to the point of breaking the diff.

## 3. Client

**`ReviewCommentsLayer.tsx`** renders **threads** (not flat comments) in view zones:
- Header row per thread: logo (BotAvatar) + author + relative time + badges (`Outdated`, `Resolved`).
- Resolved OR outdated → start **collapsed** (header only, badge visible); click toggles. Active threads expanded by default. (Reuse the existing `collapsedById` pattern, keyed by thread id, seeded from `isResolved||isOutdated`.)
- Expanded thread shows each comment (logo + body), then a **Reply** textarea + button, and a **Resolve/Unresolve** button. Buttons disabled while pending; inline error text on failure.

**Store (`state/store.ts`):**
- `reviewComments.threads` replaces `.inline` everywhere.
- `replyToThread(thread, body)` and `setThreadResolved(thread, resolved)` → POST → on success `loadReviewComments(force)`; track `{ [threadId]: { status:'idle'|'pending'|'error', message? } }`.

**`ReviewActivityPane.tsx`:** counts use threads (e.g. "8 threads · 3 resolved").

## 4. Bot logos

- `client/src/assets/bot-logos/<brand>.{svg|png}` — one per `BotBrand` we have art for (Sonar, Jit, Claude, Augment from the user's images, normalized; crisper Cursor + Copilot marks sourced/cleaned; others added as available).
- A `brandLogo(brand): string | null` map (static imports) in `BotAvatar`.
- `BotAvatar` bot path: `brandLogo(brand)` image in a rounded chip → else `<img src={avatarUrl}>` → else the current letter-chip. Humans unchanged. One consistent size.

## 5. Error handling

- Write failure (no scope / offline) → inline error on that thread; diff + reading unaffected.
- GraphQL fetch failure → existing `reviewCommentsError` banner; diff still renders (decoupled, per CLAUDE.md).
- Outdated thread anchoring → `line` falls back to `originalLine` (same as today's `line ?? original_line`).
- Missing logo asset → falls through to avatar/letter; a new bot never breaks rendering.

## 6. Testing

- Pure **GraphQL→`ReviewThread[]` mapper** unit tests: resolved/outdated flags, line vs originalLine (outdated), side, nested comment order, bot vs user author.
- Pure **request-builder** tests for reply (in_reply_to args) and resolve (resolve vs unresolve mutation + threadId).
- `brandLogo` mapping test (known brand → asset, unknown → null).
- Thin `gh` write wrappers + the Monaco rendering: manual verification.

## Files touched

- `shared/reviewComments.ts` — add `ReviewThread`, change `PRComments`.
- `server/services/reviewCommentsFetcher.ts` — GraphQL threads fetch + mapper.
- `server/services/reviewCommentsWriter.ts` *(new)* — reply + resolve gh wrappers (+ pure request builders).
- `server/routes/reviewComments.ts` — add reply + resolve routes.
- `client/src/components/ReviewCommentsLayer.tsx` — thread rendering, badges, collapse, reply, resolve.
- `client/src/components/BotAvatar.tsx` — logo → avatar → letter chain.
- `client/src/components/ReviewActivityPane.tsx` — thread counts.
- `client/src/state/store.ts` — `threads`, `replyToThread`, `setThreadResolved`.
- `client/src/assets/bot-logos/*` *(new)* + `client/src/styles.css` — badges, logo chip, reply box.

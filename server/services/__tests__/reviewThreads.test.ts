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
    expect(t.line).toBe(7);
    expect(t.comments[0].author.type).toBe('Bot');
    expect(t.comments[0].author.brand).toBe('sonarcloud');
  });

  it('skips threads that have no comments', () => {
    const empty: GHThreadsResponse = { data: { repository: { pullRequest: { reviewThreads: { nodes: [
      { id: 'EMPTY', isResolved: false, isOutdated: false, comments: { nodes: [] } },
    ] } } } } };
    expect(mapReviewThreads(empty)).toEqual([]);
  });

  it('falls back to a ghost author when the comment author is null', () => {
    const resp: GHThreadsResponse = { data: { repository: { pullRequest: { reviewThreads: { nodes: [
      { id: 'T', isResolved: false, isOutdated: false, comments: { nodes: [
        { databaseId: 9, author: null, body: 'x', path: 'p.ts', line: 1, originalLine: 1, startLine: null, originalStartLine: null, diffSide: 'RIGHT', createdAt: '2026-01-01T00:00:00Z', url: 'https://gh/c/9' },
      ] } },
    ] } } } } };
    const t = mapReviewThreads(resp)[0];
    expect(t.comments[0].author.login).toBe('ghost');
    expect(t.comments[0].author.type).toBe('User');
  });
});

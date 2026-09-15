import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useStore, selectDisplayFiles } from './store.js';
import { prComparison, comparisonKey, type PRBundle, type DiffFile } from '../../../shared/types.js';

const file: DiffFile = { path: 'same.ts', status: 'modified', additions: 1, deletions: 1,
  binary: false, noise: null, rawPatch: '', hunks: [] };
function bundle(number = 1): PRBundle {
  return { meta: { owner: 'owner', repo: 'repo', number, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40),
    title: 'Synthetic PR', body: '', author: 'author', state: 'open', isDraft: false,
    reviewDecision: null, url: `https://github.com/owner/repo/pull/${number}` },
    files: [file], commitMessages: [], commits: [] };
}
function response(data: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => data } as Response;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
class FakeSource extends EventTarget {
  static all: FakeSource[] = [];
  closed = false;
  constructor(public url: string) { super(); FakeSource.all.push(this); }
  close() { this.closed = true; }
  emit(type: string, data: unknown) { this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })); }
}
const original = useStore.getInitialState();
const storage = new Map<string, string>();
let fetchMock = vi.fn(defaultFetch);
async function defaultFetch(url: string, _init?: RequestInit): Promise<Response> {
  if (url.startsWith('/api/pr?')) return response(bundle(Number(decodeURIComponent(url).split('#')[1]) || 1));
  if (url.startsWith('/api/pr/file')) return response({ oldContent: 'base', newContent: 'head' });
  if (url.includes('/review-comments')) return response({ threads: [], reviews: [] });
  return response({ ranges: [], runs: [] });
}

const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
beforeEach(() => {
  storage.clear();
  useStore.setState(original, true);
  vi.stubGlobal('window', { localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
  }, history: { replaceState: vi.fn() } });
  vi.stubGlobal('EventSource', FakeSource);
  fetchMock = vi.fn(defaultFetch);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });
const load = async (n = 1) => { await useStore.getState().loadPR(`owner/repo#${n}`); await settle(); };

describe('review session integrity', () => {
  it('isolates summaries and drafts between PRs even when head SHAs match', async () => {
    await load(1);
    useStore.getState().setReviewSummary('Private context for A');
    useStore.getState().setLineComment(file.path, 1, 'A note');
    await load(2);
    expect(useStore.getState().reviewSummary).toBe('');
    expect(useStore.getState().lineComments).toEqual({});
    fetchMock.mockImplementationOnce(async () => response({ id: 7 }));
    await useStore.getState().postReview('APPROVE');
    const outgoing = fetchMock.mock.calls.find(([url]) => url === '/api/review');
    expect(JSON.parse((outgoing![1] as RequestInit).body as string)).toMatchObject({ number: 2, summary: '', inlineComments: [] });
    await load(1);
    expect(useStore.getState().reviewSummary).toBe('Private context for A');
  });

  it('ignores an old load response after a newer PR loads', async () => {
    const pending = deferred<Response>();
    fetchMock.mockImplementationOnce(() => pending.promise);
    const old = useStore.getState().loadPR('owner/repo#1');
    await load(2);
    pending.resolve(response(bundle(1))); await old;
    expect(useStore.getState().bundle?.meta.number).toBe(2);
  });

  it('ignores old content, blame, comments and checks completions', async () => {
    await load(1);
    const content = deferred<Response>(); const blame = deferred<Response>();
    const comments = deferred<Response>(); const checks = deferred<Response>();
    useStore.setState({ fullContent: {}, blame: {} });
    fetchMock.mockImplementationOnce(() => content.promise).mockImplementationOnce(() => blame.promise)
      .mockImplementationOnce(() => comments.promise).mockImplementationOnce(() => checks.promise);
    const tasks = [useStore.getState().fetchFullContent(file.path), useStore.getState().fetchBlame(file.path),
      useStore.getState().fetchReviewComments(), useStore.getState().fetchChecks()];
    await load(2);
    content.resolve(response({ oldContent: 'A base', newContent: 'A head' }));
    blame.resolve(response({ ranges: [{ authorName: 'A' }] }));
    comments.resolve(response({ threads: [{ id: 'A' }] }));
    checks.resolve(response({ runs: [{ name: 'A' }] }));
    await Promise.all(tasks);
    expect(useStore.getState().fullContent[file.path].newContent).toBe('head');
    expect(useStore.getState().blame[file.path].ranges).toEqual([]);
    expect(useStore.getState().reviewComments?.threads).toEqual([]);
    expect(useStore.getState().checks.runs).toEqual([]);
  });

  it('invalidates a scoped fetch when returning to All commits', async () => {
    await load(); const pending = deferred<Response>();
    fetchMock.mockImplementationOnce(() => pending.promise);
    const task = useStore.getState().selectScope({ kind: 'commit', label: 'Older', commitSha: 'c'.repeat(40) });
    expect(selectDisplayFiles(useStore.getState())).toEqual([]);
    await useStore.getState().selectScope({ kind: 'all', label: 'All commits' });
    pending.resolve(response({ files: [{ ...file, path: 'wrong.ts' }], comparison: {} })); await task;
    expect(useStore.getState().scopedFiles).toBeNull();
    expect(useStore.getState().comparison).toEqual(prComparison(bundle()));
    expect(useStore.getState().activeFilePath).toBe(file.path);
  });

  it('requests file content using the exact selected comparison', async () => {
    await load();
    const comparison = { ...prComparison(bundle()), baseSha: 'c'.repeat(40), headSha: 'd'.repeat(40), scope: 'commit' as const };
    fetchMock.mockImplementationOnce(async () => response({ files: [file], comparison }));
    await useStore.getState().selectScope({ kind: 'commit', commitSha: comparison.headSha, label: 'Older' });
    await settle();
    const urls = fetchMock.mock.calls.map(([url]) => url as string).filter((url) => url.startsWith('/api/pr/file'));
    expect(new URL(urls.at(-1)!, 'http://localhost').searchParams.get('comparison')).toBe(comparisonKey(comparison));
    expect(useStore.getState().fullContent[file.path].comparisonKey).toBe(comparisonKey(comparison));
    useStore.getState().openComposer(file.path, 1, 1);
    expect(useStore.getState().composerTarget).toBeNull();
    await useStore.getState().postReview('APPROVE');
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/review')).toBe(false);
  });

  it('closes old streams and rejects their queued chunks, usage and errors', async () => {
    await load(1); const old = FakeSource.all.slice(-5);
    await load(2);
    old.forEach((source) => {
      expect(source.closed).toBe(true);
      source.emit('chunk', 'A private text'); source.emit('usage', { inputTokens: 900 });
      source.emit('error', 'A failure'); source.emit('done', '');
    });
    expect(useStore.getState().tldr.text).toBe('');
    expect(useStore.getState().headline.text).toBe('');
    expect(useStore.getState().tldr.status).toBe('streaming');
  });

  it('clears only the confirmed submitted snapshot and preserves edits during flight', async () => {
    await load(); const s = useStore.getState();
    s.setComment('kept.ts', 'original'); s.setComment('posted.ts', 'posted');
    s.setLineComment(file.path, 2, 'posted inline'); s.setLineComment(file.path, 4, 'old inline');
    s.setReviewSummary('Original summary');
    const pending = deferred<Response>(); fetchMock.mockImplementationOnce(() => pending.promise);
    const task = s.postReview('COMMENT');
    s.setComment('kept.ts', 'edited'); s.setLineComment(file.path, 4, 'new inline'); s.setReviewSummary('New summary');
    await s.postReview('COMMENT'); // double-click does not dispatch another request
    pending.resolve(response({ id: 42, url: 'https://github.com/review/42' })); await task;
    expect(useStore.getState().comments).toEqual({ 'kept.ts': 'edited' });
    expect(useStore.getState().lineComments).toEqual({ [file.path]: { 4: { body: 'new inline' } } });
    expect(useStore.getState().reviewSummary).toBe('New summary');
    expect(useStore.getState().postingReview.status).toBe('idle');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/review')).toHaveLength(1);
    await load();
    expect(useStore.getState().comments).toEqual({ 'kept.ts': 'edited' });
    expect(useStore.getState().lineComments[file.path][2]).toBeUndefined();
  });

  it('leaves successful submissions empty after reload and enables new drafts', async () => {
    await load(); useStore.getState().setReviewSummary('Submitted');
    fetchMock.mockImplementationOnce(async () => response({ id: 42 }));
    await useStore.getState().postReview('COMMENT');
    expect(useStore.getState().reviewSummary).toBe('');
    expect(useStore.getState().postingReview.status).toBe('done');
    useStore.getState().setReviewSummary('Next draft');
    expect(useStore.getState().postingReview.status).toBe('idle');
    await load(); expect(useStore.getState().reviewSummary).toBe('Next draft');
  });

  it('persists uncertain outcomes and blocks retries until explicit reconciliation', async () => {
    await load(); useStore.getState().setReviewSummary('Possibly submitted');
    fetchMock.mockImplementationOnce(async () => { throw new Error('Network dropped'); });
    await useStore.getState().postReview('COMMENT');
    expect(useStore.getState().postingReview.status).toBe('uncertain');
    useStore.getState().setReviewSummary('Edited after drop');
    await load(); expect(useStore.getState().postingReview.status).toBe('uncertain');
    await useStore.getState().postReview('COMMENT');
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/review')).toHaveLength(1);
    useStore.getState().acknowledgeUncertainReview();
    expect(useStore.getState().postingReview.status).toBe('idle');
  });

  it('keeps active file inside the visible scoped files when hiding noise', async () => {
    await load();
    const noise = { ...file, path: 'generated.ts', noise: 'generated' as const };
    useStore.setState({ scopedFiles: [noise], activeFilePath: noise.path, showNoise: true });
    useStore.getState().toggleNoise(); expect(useStore.getState().activeFilePath).toBeNull();
    useStore.getState().selectFile(file.path); expect(useStore.getState().activeFilePath).toBeNull();
    useStore.getState().toggleNoise(); expect(useStore.getState().activeFilePath).toBe(noise.path);
  });
  it('does not invalidate a pending file fetch when it is requested twice', async () => {
    await load(); useStore.setState({ fullContent: {} });
    const pending = deferred<Response>(); fetchMock.mockImplementationOnce(() => pending.promise);
    const first = useStore.getState().fetchFullContent(file.path);
    await useStore.getState().fetchFullContent(file.path);
    pending.resolve(response({ oldContent: 'base', newContent: 'loaded once' })); await first;
    expect(useStore.getState().fullContent[file.path].newContent).toBe('loaded once');
  });

  it('keeps comparison errors local so the user can return to All commits', async () => {
    await load(); fetchMock.mockImplementationOnce(async () => response({ error: 'History diverged' }, 409));
    await useStore.getState().selectScope({ kind: 'since-review', baseSha: 'old', label: 'Since review' });
    expect(useStore.getState().error).toBeNull();
    expect(useStore.getState().scopeError).toBe('History diverged');
    await useStore.getState().selectScope({ kind: 'all', label: 'All commits' });
    expect(useStore.getState().activeFilePath).toBe(file.path);
    expect(useStore.getState().scopeError).toBeNull();
  });

  it('treats malformed success as uncertain and keeps all submitted drafts', async () => {
    await load(); useStore.getState().setReviewSummary('Keep this');
    fetchMock.mockImplementationOnce(async () => response({}));
    await useStore.getState().postReview('COMMENT');
    expect(useStore.getState().postingReview.status).toBe('uncertain');
    expect(useStore.getState().reviewSummary).toBe('Keep this');
  });

  it('never applies an old submission or thread mutation to another PR', async () => {
    await load(1); useStore.getState().setReviewSummary('A summary');
    const pending = deferred<Response>(); const reply = deferred<Response>();
    fetchMock.mockImplementationOnce(() => pending.promise).mockImplementationOnce(() => reply.promise);
    const submit = useStore.getState().postReview('COMMENT');
    const replying = useStore.getState().replyToThread('thread A', 'comment A', 'reply A');
    await load(2); useStore.getState().setReviewSummary('B summary');
    pending.resolve(response({ id: 1 })); reply.resolve(response({ ok: true, comments: { threads: [{ id: 'A' }] } }));
    await Promise.all([submit, replying]);
    expect(useStore.getState().reviewSummary).toBe('B summary');
    expect(useStore.getState().reviewComments?.threads).toEqual([]);
    expect(useStore.getState().threadActions).toEqual({});
    await load(1); expect(useStore.getState().reviewSummary).toBe('');
  });

});

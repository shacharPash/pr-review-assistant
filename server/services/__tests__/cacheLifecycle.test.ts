import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Router } from 'express';
import type { PRBundle } from '../../../shared/types.js';
import { comparisonKey } from '../../../shared/types.js';
import { fileRouter } from '../../routes/file.js';
import { blameRouter } from '../../routes/blame.js';
import { prRouter } from '../../routes/pr.js';
import { scopedDiffRouter } from '../../routes/scopedDiff.js';
import { reviewCommentsRouter } from '../../routes/reviewComments.js';
import { privacyRouter } from '../../routes/privacy.js';
import { headlineRouter } from '../../routes/headline.js';
import { setBundle, getBundle, getReviewComments, getGenerated, generatedIdentity } from '../cache.js';
import { findComparison } from '../comparisons.js';

const mocks = vi.hoisted(() => ({ file: vi.fn(), blame: vi.fn(), pr: vi.fn(), gh: vi.fn(), comments: vi.fn(), done: undefined as undefined | ((text: string) => void) }));
vi.mock('../fileContent.js', () => ({ fetchFileAtRef: mocks.file }));
vi.mock('../blame.js', () => ({ fetchBlame: mocks.blame }));
vi.mock('../ghFetcher.js', () => ({ fetchPR: mocks.pr, runGH: mocks.gh, GHError: class extends Error {} }));
vi.mock('../reviewCommentsFetcher.js', () => ({ fetchPRReviewComments: mocks.comments }));
vi.mock('../claudeRunner.js', () => ({ pickModel: () => 'sonnet', ClaudeRunner: class {
  constructor(callbacks: { onDone: (text: string) => void }) { mocks.done = callbacks.onDone; }
  start() {} abort() {}
} }));
vi.mock('node:child_process', () => ({ execFile: Object.assign(() => {}, { [Symbol.for('nodejs.util.promisify.custom')]: async () => ({ stdout: '', stderr: '' }) }) }));

const bundle = { meta: { owner: 'fixture', repo: 'review', number: 1, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40) }, files: [{ path: 'sample.ts', status: 'modified' }], commits: [] } as unknown as PRBundle;
const query = { owner: 'fixture', repo: 'review', number: '1', headSha: bundle.meta.headSha, path: 'sample.ts' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
async function invoke(router: Router, path: string, query = {}) {
  const handler = (router as any).stack.find((entry: any) => entry.route?.path === path).route.stack[0].handle;
  let status = 200, body: any;
  const response = { status(code: number) { status = code; return this; }, json(value: any) { body = value; return this; }, writeHead() {}, flushHeaders() {}, on() {}, write() {}, end() {} };
  await handler({ query }, response);
  return { status, body };
}
const clear = () => invoke(privacyRouter, '/api/local-data/clear');
beforeEach(async () => {
  await clear(); vi.clearAllMocks();
  mocks.file.mockResolvedValue('private fixture code'); mocks.blame.mockResolvedValue([{ startingLine: 1 }]);
  setBundle(bundle);
});
afterEach(() => vi.useRealTimers());

it.each(['file', 'blame'])('clears %s data and expires it after fifteen minutes', async kind => {
  const router = kind === 'file' ? fileRouter : blameRouter;
  const path = kind === 'file' ? '/api/pr/file' : '/api/blame';
  const fetcher = kind === 'file' ? mocks.file : mocks.blame;
  const perRequest = kind === 'file' ? 2 : 1;
  await invoke(router, path, query); await invoke(router, path, query);
  expect(fetcher).toHaveBeenCalledTimes(perRequest);
  await clear(); setBundle(bundle);
  await invoke(router, path, query);
  expect(fetcher).toHaveBeenCalledTimes(2 * perRequest);
  vi.useFakeTimers(); vi.setSystemTime(Date.now() + 15 * 60_000 + 1);
  setBundle(bundle); await invoke(router, path, query);
  expect(fetcher).toHaveBeenCalledTimes(3 * perRequest);
});

it.each(['file', 'blame'])('discards old %s inflight work without removing or reusing new inflight work', async kind => {
  const router = kind === 'file' ? fileRouter : blameRouter;
  const path = kind === 'file' ? '/api/pr/file' : '/api/blame';
  const fetcher = kind === 'file' ? mocks.file : mocks.blame;
  const perRequest = kind === 'file' ? 2 : 1;
  const old = deferred<any>(), fresh = deferred<any>();
  fetcher.mockImplementation(() => old.promise);
  const request = invoke(router, path, query);
  await clear(); setBundle(bundle);
  fetcher.mockImplementation(() => fresh.promise);
  const newRequest = invoke(router, path, query);
  expect(fetcher).toHaveBeenCalledTimes(2 * perRequest);
  old.resolve(kind === 'file' ? 'old' : [{ author: 'old' }]); await request;
  const sharedRequest = invoke(router, path, query);
  expect(fetcher).toHaveBeenCalledTimes(2 * perRequest);
  fresh.resolve(kind === 'file' ? 'fresh' : [{ author: 'fresh' }]);
  const result = await newRequest;
  expect(await sharedRequest).toEqual(result);
  expect(await invoke(router, path, query)).toEqual(result);
  expect(JSON.stringify(result)).toContain('fresh');
});

it('does not restore a pending PR after clear', async () => {
  const pending = deferred<PRBundle>(); mocks.pr.mockReturnValue(pending.promise);
  const request = invoke(prRouter, '/api/pr', { ref: 'fixture/review#1' });
  await clear(); pending.resolve(bundle); await request;
  expect(getBundle('fixture', 'review', 1, bundle.meta.headSha)).toBeUndefined();
});

it('does not retain a pending scoped comparison after clear and PR reopen', async () => {
  const pending = deferred<string>(); mocks.gh.mockReturnValue(pending.promise);
  const baseSha = 'c'.repeat(40);
  const request = invoke(scopedDiffRouter, '/api/pr/scoped-diff', { ...query, kind: 'range', base: baseSha });
  await clear(); setBundle(bundle);
  pending.resolve(JSON.stringify({ merge_base_commit: { sha: baseSha } }));
  const result = await request;
  expect(result.status).toBe(200);
  expect(findComparison(bundle, comparisonKey(result.body.comparison))).toBeUndefined();
});

it('does not attach pending review comments to a reopened bundle', async () => {
  const pending = deferred<any>(); mocks.comments.mockReturnValue(pending.promise);
  const request = invoke(reviewCommentsRouter, '/api/pr/review-comments', query);
  await clear(); setBundle(bundle);
  pending.resolve({ threads: [], prLevel: [] }); await request;
  expect(getReviewComments('fixture', 'review', 1, bundle.meta.headSha)).toBeUndefined();
});

it('does not attach a late AI completion to a reopened bundle', async () => {
  await invoke(headlineRouter, '/api/headline/stream', query);
  expect(mocks.done).toBeTypeOf('function');
  await clear(); setBundle(bundle); mocks.done!('old private output');
  expect(getGenerated('fixture', 'review', 1, bundle.meta.headSha, generatedIdentity(bundle, 'headline', 'sonnet'))).toBeUndefined();
});

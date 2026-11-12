import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { reviewCommentsRouter } from '../../routes/reviewComments.js';
import { clearCache, setBundle } from '../cache.js';
import type { PRBundle } from '../../../shared/types.js';

// Stop at the gh boundary: these routes must never reach it with unchecked input.
const gh = vi.hoisted(() => ({ reply: vi.fn(), resolve: vi.fn(), fetch: vi.fn() }));
vi.mock('../reviewCommentsWriter.js', async (original) => ({
  ...(await original<typeof import('../reviewCommentsWriter.js')>()),
  postReply: gh.reply,
  setResolved: gh.resolve,
}));
vi.mock('../reviewCommentsFetcher.js', () => ({ fetchPRReviewComments: gh.fetch }));

type Action = 'reply' | 'resolve';
const pr = { owner: 'synthetic', repo: 'repo', number: 1, headSha: 'head' };
let server: ReturnType<ReturnType<typeof express>['listen']>;
let base: string;

beforeEach(async () => {
  gh.reply.mockReset().mockResolvedValue(undefined);
  gh.resolve.mockReset().mockResolvedValue(undefined);
  gh.fetch.mockReset().mockResolvedValue({ threads: [], prLevel: [] });
  setBundle({ meta: { ...pr, baseSha: 'base' }, files: [], commitMessages: [] } as unknown as PRBundle);
  const app = express(); app.use(express.json(), reviewCommentsRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  clearCache();
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (action: Action, fields: Record<string, unknown> = {}) => fetch(`${base}/api/pr/review-comments/${action}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ...pr,
    ...(action === 'reply' ? { inReplyTo: '101', body: 'Synthetic reply' } : { threadId: 'PRRT_synthetic', resolved: true }),
    ...fields,
  }),
});
const writer = (action: Action) => (action === 'reply' ? gh.reply : gh.resolve);

it.each<Action>(['reply', 'resolve'])('%s acts on the loaded PR', async (action) => {
  const res = await post(action);
  expect(res.status).toBe(200);
  expect(writer(action)).toHaveBeenCalledOnce();
  expect(gh.fetch).toHaveBeenCalledWith('synthetic', 'repo', 1);
});

it.each<[Action, Record<string, unknown>]>([
  ['reply', { owner: '@.env' }],
  ['reply', { repo: '{repo}' }],
  ['reply', { owner: ['synthetic'] }],
  ['resolve', { owner: '@.env' }],
  ['resolve', { repo: '..' }],
])('%s rejects owner or repo %j before calling gh', async (action, fields) => {
  const res = await post(action, fields);
  expect(res.status).toBe(400);
  expect(writer(action)).not.toHaveBeenCalled();
  expect(gh.fetch).not.toHaveBeenCalled();
});

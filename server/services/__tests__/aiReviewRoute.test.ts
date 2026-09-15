import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { aiReviewRouter } from '../../routes/aiReview.js';
import { aiChatRouter } from '../../routes/aiChat.js';
import { ClaudeRunner, type RunnerEvents, type RunOptions } from '../claudeRunner.js';
import { setBundle, setGuidelines } from '../cache.js';
import type { PRBundle } from '../../../shared/types.js';
vi.mock('../guidelinesFetcher.js', () => ({ fetchGuidelines: async () => 'Synthetic conventions' }));

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base: string;
let number = 300;
let output = '';
const synthetic: PRBundle = { meta: { owner: 'synthetic', repo: 'repo', number: 1, headSha: 'head', baseSha: 'base',
  title: 'Synthetic title', body: '', author: 'test', state: 'open', isDraft: false, reviewDecision: null, url: '' },
  files: [], commitMessages: [] };
let start: import('vitest').MockInstance<[prompt: string, opts?: RunOptions], void>;
const clean = JSON.stringify({ verdict: 'approve', summary: 'Synthetic assessment', comments: [] });
beforeEach(async () => {
  number++;
  setBundle({ ...synthetic, meta: { ...synthetic.meta, number } });
  output = clean;
  // Stop at the common process boundary. No actual CLI or provider invocation.
  start = vi.spyOn(ClaudeRunner.prototype, 'startPrompt').mockImplementation(function (this: ClaudeRunner) {
    const events = (this as unknown as { events: RunnerEvents }).events;
    queueMicrotask(() => { events.onChunk(output); events.onDone(output); });
  });
  const app = express(); app.use(express.json(), aiReviewRouter, aiChatRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  vi.restoreAllMocks();
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});
const path = () => `/api/ai-review/stream?owner=synthetic&repo=repo&number=${number}&headSha=head`;
const review = async (suffix = '') => (await fetch(base + path() + suffix)).text();

describe('AI review cache and new route lifecycle', () => {
  it('replays normal reads but actually reruns with refresh=1', async () => {
    expect(await review('&mode=sonnet')).toContain('event: done');
    await review('&mode=sonnet'); expect(start).toHaveBeenCalledTimes(1);
    await review('&mode=sonnet&refresh=1'); expect(start).toHaveBeenCalledTimes(2);
  });
  it('separates model choice and actual prompt content in cache identity', async () => {
    await review('&mode=sonnet'); await review('&mode=opus'); expect(start).toHaveBeenCalledTimes(2);
    setGuidelines('synthetic', 'repo', number, 'head', 'Updated prompt conventions');
    await review('&mode=opus'); expect(start).toHaveBeenCalledTimes(3);
    expect(start.mock.calls[1][1]).toMatchObject({ model: 'opus' });
  });
  it('does not cache malformed results or signal a successful review', async () => {
    output = '{}';
    const failed = await review();
    expect(failed).toContain('event: error'); expect(failed).not.toContain('event: done');
    output = clean;
    expect(await review()).toContain('event: done'); expect(start).toHaveBeenCalledTimes(2);
  });
  it.each(['review', 'chat'])('keeps %s running after request arrival and aborts on browser disconnect', async (kind) => {
    start.mockImplementation(() => {});
    const abort = vi.spyOn(ClaudeRunner.prototype, 'abort');
    const body = JSON.stringify({ ...synthetic.meta, number, messages: [{ role: 'user', content: 'Synthetic question' }] });
    const req = request(base + (kind === 'review' ? path() : '/api/ai-chat/stream'), {
      method: kind === 'review' ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    req.on('error', () => {}); req.on('response', (res) => res.resume());
    try {
      req.end(kind === 'chat' ? body : undefined);
      await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
      expect(abort).not.toHaveBeenCalled();
      req.destroy(); await vi.waitFor(() => expect(abort).toHaveBeenCalledOnce());
    } finally { req.destroy(); }
  });
});

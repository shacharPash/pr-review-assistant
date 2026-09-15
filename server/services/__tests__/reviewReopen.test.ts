import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import type { PRBundle } from '../../../shared/types.js';
const fixture = vi.hoisted(() => ({ meta: { owner: 'synthetic', repo: 'repo', number: 812, headSha: 'head', baseSha: 'base', title: 'Same PR', body: '', author: 'synthetic', state: 'open', isDraft: false, reviewDecision: null, url: '' }, files: [], commitMessages: [] }));
vi.mock('../ghFetcher.js', () => ({ fetchPR: async () => structuredClone(fixture), GHError: class GHError extends Error {} }));
vi.mock('../guidelinesFetcher.js', () => ({ fetchGuidelines: async () => '' }));
import { prRouter } from '../../routes/pr.js';
import { aiReviewRouter } from '../../routes/aiReview.js';
import { clearCache, getBundle, getGuidelines, setBundle } from '../cache.js';
import * as policy from '../claudePolicy.js';

class FakeResponse extends EventEmitter {
  done: Promise<void>;
  finish!: () => void;
  constructor() { super(); this.done = new Promise((resolve) => { this.finish = resolve; }); }
  writeHead() { return this; }
  flushHeaders() {}
  write() { return true; }
  json() { this.finish(); return this; }
  status() { return this; }
  end() { this.finish(); }
}
const handler = (router: typeof prRouter) => router.stack.find((layer) => layer.route)!.route!.stack[0]!.handle as unknown as (req: { query: Record<string, string> }, res: FakeResponse) => Promise<void>;
afterEach(() => { clearCache(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('reopening preserves an identical review, refresh bypasses it, and changed context invalidates it', async () => {
  const final = JSON.stringify({ verdict: 'approve', summary: 'Synthetic', comments: [] });
  const launch = vi.spyOn(policy, 'launchClaude').mockImplementation((_prompt, events) => {
    queueMicrotask(() => { events.onData(JSON.stringify({ type: 'result', result: final }) + '\n'); events.onClose(); });
    return () => {};
  });
  const review = async () => { const res = new FakeResponse(); await handler(aiReviewRouter)({ query: { owner: 'synthetic', repo: 'repo', number: '812', headSha: 'head', mode: 'sonnet' } }, res); await res.done; };
  setBundle(fixture as PRBundle);
  await review(); await review();
  expect(launch).toHaveBeenCalledTimes(1);
  const reload = new FakeResponse(); await handler(prRouter)({ query: { ref: 'synthetic/repo#812' } }, reload); await reload.done;
  await review();
  expect(launch).toHaveBeenCalledTimes(1);
  expect(getGuidelines('synthetic', 'repo', 812, 'head')).toBe('');
  const originalBody = fixture.meta.body;
  fixture.meta.body = 'Fresh description';
  try {
    const changed = new FakeResponse(); await handler(prRouter)({ query: { ref: 'synthetic/repo#812' } }, changed); await changed.done;
    expect(getBundle('synthetic', 'repo', 812, 'head')?.meta.body).toBe('Fresh description');
    expect(getGuidelines('synthetic', 'repo', 812, 'head')).toBeUndefined();
    await review();
    expect(launch).toHaveBeenCalledTimes(2);
    const rerun = new FakeResponse();
    await handler(aiReviewRouter)({ query: { owner: 'synthetic', repo: 'repo', number: '812', headSha: 'head', mode: 'sonnet', refresh: '1' } }, rerun);
    await rerun.done;
    expect(launch).toHaveBeenCalledTimes(3);
  } finally { fixture.meta.body = originalBody; }
});

import { BoundedCache } from '../services/boundedCache.js';
import { cacheGeneration, isCurrentGeneration, registerCacheClear } from '../services/cacheLifecycle.js';
import { findComparison } from '../services/comparisons.js';
import { comparisonKey } from '../../shared/types.js';
import { Router, type Request, type Response } from 'express';
import { fetchBlame } from '../services/blame.js';
import { getBundle } from '../services/cache.js';
import type { BlameRange } from '../../shared/types.js';

export const blameRouter = Router();

const memo = new BoundedCache<BlameRange[]>(15 * 60_000, 100, 10 * 1024 * 1024);
const inflight = new Map<string, Promise<BlameRange[]>>();
registerCacheClear(() => inflight.clear());

blameRouter.get('/api/blame', async (req: Request, res: Response) => {
  const generation = cacheGeneration();
  const owner = String(req.query.owner ?? '');
  const repo = String(req.query.repo ?? '');
  const number = Number(req.query.number);
  const headSha = String(req.query.headSha ?? '');
  const path = String(req.query.path ?? '');

  if (!owner || !repo || !number || !headSha || !path) {
    return res.status(400).json({ error: 'Missing required query params.' });
  }

  const bundle = getBundle(owner, repo, number, headSha);
  if (!bundle) {
    return res.status(404).json({ error: 'PR bundle not in cache.' });
  }

  const selected = findComparison(bundle, String(req.query.comparison ?? ''));
  if (!selected || !selected.files.some((f) => f.path === path && f.status !== 'removed')) {
    return res.status(409).json({ error: 'File not in the selected comparison.' });
  }
  const cacheKey = `${comparisonKey(selected.comparison)}:${path}`;
  const cached = memo.get(cacheKey);
  if (cached) return res.json({ ranges: cached });

  const pending = inflight.get(cacheKey);
  if (pending) {
    try {
      const ranges = await pending;
      return res.json({ ranges });
    } catch {
      if (!isCurrentGeneration(generation)) return res.status(409).json({ error: 'Local data was cleared. Reload the PR.' });
      // fall through to a fresh fetch
    }
  }

  const promise = fetchBlame(owner, repo, selected.comparison.headSha, path);
  if (isCurrentGeneration(generation)) inflight.set(cacheKey, promise);
  try {
    const ranges = await promise;
    if (isCurrentGeneration(generation)) memo.set(cacheKey, ranges);
    res.json({ ranges });
  } catch (err) {
    const e = err as Error & { stderr?: string };
    res.status(502).json({
      error: 'Blame fetch failed',
      detail: (e.stderr ?? e.message)?.split('\n').slice(-3).join('\n'),
    });
  } finally {
    if (inflight.get(cacheKey) === promise) inflight.delete(cacheKey);
  }
});

import { cacheGeneration, isCurrentGeneration } from '../services/cacheLifecycle.js';
import { Router, type Request, type Response } from 'express';
import { fetchPR, GHError } from '../services/ghFetcher.js';
import { setBundle } from '../services/cache.js';

export const prRouter = Router();

prRouter.get('/api/pr', async (req: Request, res: Response) => {
  const generation = cacheGeneration();
  const input = typeof req.query.ref === 'string' ? req.query.ref : '';
  if (!input) {
    return res.status(400).json({ error: 'Missing `ref` query parameter.' });
  }

  try {
    // State, description and review decisions can change without a new commit.
    const bundle = await fetchPR(input);
    if (isCurrentGeneration(generation)) setBundle(bundle);
    res.json(bundle);
  } catch (err) {
    if (err instanceof GHError) {
      return res.status(502).json({ error: err.message, detail: err.detail });
    }
    const e = err as Error;
    res.status(500).json({ error: 'Unexpected error', detail: e.message });
  }
});

import { Router, type Request, type Response } from 'express';
import { fetchPR, probeHeadSha, GHError } from '../services/ghFetcher.js';
import { getBundle, setBundle } from '../services/cache.js';

export const prRouter = Router();

prRouter.get('/api/pr', async (req: Request, res: Response) => {
  const input = typeof req.query.ref === 'string' ? req.query.ref : '';
  if (!input) {
    return res.status(400).json({ error: 'Missing `ref` query parameter.' });
  }

  try {
    const { owner, repo, number, headSha } = await probeHeadSha(input);

    const cached = getBundle(owner, repo, number, headSha);
    if (cached) return res.json(cached);

    const bundle = await fetchPR(input);
    setBundle(bundle);
    res.json(bundle);
  } catch (err) {
    if (err instanceof GHError) {
      return res.status(502).json({ error: err.message, detail: err.detail });
    }
    const e = err as Error;
    res.status(500).json({ error: 'Unexpected error', detail: e.message });
  }
});

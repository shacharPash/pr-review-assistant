import { Router, type Request, type Response } from 'express';
import { fetchChecks } from '../services/checksFetcher.js';
import { GHError } from '../services/ghFetcher.js';

export const checksRouter = Router();

checksRouter.get('/api/pr/checks', async (req: Request, res: Response) => {
  const owner = typeof req.query.owner === 'string' ? req.query.owner : '';
  const repo = typeof req.query.repo === 'string' ? req.query.repo : '';
  const number = Number(req.query.number);
  if (!owner || !repo || !Number.isFinite(number)) {
    return res.status(400).json({ error: 'owner, repo, and number are required' });
  }
  try {
    const runs = await fetchChecks(owner, repo, number);
    res.json({ runs });
  } catch (err) {
    if (err instanceof GHError) {
      return res.status(502).json({ error: err.message, detail: err.detail });
    }
    const e = err as Error;
    res.status(500).json({ error: 'Unexpected error', detail: e.message });
  }
});

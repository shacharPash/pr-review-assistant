import { Router, type Request, type Response } from 'express';
import { fetchBlame } from '../services/blame.js';
import { getBundle } from '../services/cache.js';
import type { BlameRange } from '../../shared/types.js';

export const blameRouter = Router();

const memo = new Map<string, BlameRange[]>();
const inflight = new Map<string, Promise<BlameRange[]>>();

blameRouter.get('/api/blame', async (req: Request, res: Response) => {
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

  const cacheKey = `${owner}/${repo}:${headSha}:${path}`;
  const cached = memo.get(cacheKey);
  if (cached) return res.json({ ranges: cached });

  const pending = inflight.get(cacheKey);
  if (pending) {
    try {
      const ranges = await pending;
      return res.json({ ranges });
    } catch {
      // fall through to a fresh fetch
    }
  }

  const promise = fetchBlame(owner, repo, headSha, path);
  inflight.set(cacheKey, promise);
  try {
    const ranges = await promise;
    memo.set(cacheKey, ranges);
    res.json({ ranges });
  } catch (err) {
    const e = err as Error & { stderr?: string };
    res.status(502).json({
      error: 'Blame fetch failed',
      detail: (e.stderr ?? e.message)?.split('\n').slice(-3).join('\n'),
    });
  } finally {
    inflight.delete(cacheKey);
  }
});

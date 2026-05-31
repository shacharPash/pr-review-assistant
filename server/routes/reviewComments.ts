import { Router, type Request, type Response } from 'express';
import { fetchPRReviewComments } from '../services/reviewCommentsFetcher.js';
import { getBundle, getReviewComments, setReviewComments } from '../services/cache.js';

export const reviewCommentsRouter = Router();

/**
 * Returns all review activity on the PR — line-anchored comments, review
 * summaries, and PR-wide issue comments (where bots like SonarCloud and Jit
 * post their reports). Cached in-memory per (owner, repo, number, headSha)
 * so refreshing is cheap.
 */
reviewCommentsRouter.get('/api/pr/review-comments', async (req: Request, res: Response) => {
  const owner = String(req.query.owner ?? '');
  const repo = String(req.query.repo ?? '');
  const number = Number(req.query.number);
  const headSha = String(req.query.headSha ?? '');

  if (!owner || !repo || !number || !headSha) {
    return res.status(400).json({ error: 'Missing required query params.' });
  }
  if (!getBundle(owner, repo, number, headSha)) {
    return res.status(404).json({ error: 'PR bundle not in cache.' });
  }

  const cached = getReviewComments(owner, repo, number, headSha);
  if (cached) return res.json(cached);

  try {
    const comments = await fetchPRReviewComments(owner, repo, number);
    setReviewComments(owner, repo, number, headSha, comments);
    res.json(comments);
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    res.status(502).json({
      error: 'Failed to fetch review comments.',
      detail: e.stderr?.trim().split('\n').slice(-3).join('\n') ?? e.message,
    });
  }
});

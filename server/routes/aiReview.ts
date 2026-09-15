import { createHash } from 'node:crypto';
import { parseAIReview } from '../../shared/aiReview.js';
import { Router, type Request, type Response } from 'express';
import { ClaudeRunner, buildAiReviewPrompt, pickModel } from '../services/claudeRunner.js';
import {
  getBundle,
  getAiReview,
  setAiReview,
  getGuidelines,
  setGuidelines,
} from '../services/cache.js';
import { fetchGuidelines } from '../services/guidelinesFetcher.js';

export const aiReviewRouter = Router();

aiReviewRouter.get('/api/ai-review/stream', async (req: Request, res: Response) => {
  const owner = String(req.query.owner ?? '');
  const repo = String(req.query.repo ?? '');
  const number = Number(req.query.number);
  const headSha = String(req.query.headSha ?? '');

  if (!owner || !repo || !number || !headSha) {
    return res.status(400).json({ error: 'Missing required query params.' });
  }

  const bundle = getBundle(owner, repo, number, headSha);
  if (!bundle) {
    return res.status(404).json({ error: 'PR bundle not in cache. Fetch /api/pr first.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  let closed = false;
  res.on('error', () => { closed = true; });
  res.on('close', () => { closed = true; });
  const send = (event: string, data: unknown): void => {
    if (closed) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      closed = true;
    }
  };

  // Repo convention files , fetched once per PR and cached. Best-effort: an
  // empty string just means "no repo-specific rules to enforce".
  let guidelines = getGuidelines(owner, repo, number, headSha);
  if (guidelines === undefined) {
    guidelines = await fetchGuidelines(owner, repo, headSha);
    setGuidelines(owner, repo, number, headSha, guidelines);
  }
  if (closed) return; // client bailed while we were fetching guidelines

  const prompt = buildAiReviewPrompt(bundle, guidelines);
  const model = pickModel(req.query.mode);
  const identity = createHash('sha256').update(`review-v2:${model}:${prompt}`).digest('hex');
  const cached = req.query.refresh === '1' ? undefined : getAiReview(owner, repo, number, headSha, identity);
  if (cached && parseAIReview(cached)) {
    send('chunk', cached);
    send('done', '');
    res.end();
    return;
  }

  const runner = new ClaudeRunner({
    onChunk: (delta) => send('chunk', delta),
    onUsage: (usage) => send('usage', usage),
    onDone: (full) => {
      if (!parseAIReview(full)) {
        send('error', 'AI review was incomplete or malformed. Re-run to try again.');
        res.end();
        return;
      }
      setAiReview(owner, repo, number, headSha, identity, full);
      send('done', '');
      res.end();
    },
    onError: (msg) => {
      send('error', msg);
      res.end();
    },
  });

  res.on('close', () => runner.abort());

  // Use the shared process timeout, queue and cancellation policy.
  runner.startPrompt(prompt, { model });
});

import { Router, type Request, type Response } from 'express';
import { ClaudeRunner, validateModelParam } from '../services/claudeRunner.js';
import { getBundle, getHeadline, setHeadline } from '../services/cache.js';

export const headlineRouter = Router();

const HEADLINE_PROMPT = `Write a one-sentence (max ~140 characters) summary of this pull request,
aimed at a teammate who hasn't seen it yet. Lead with the user-visible
behavior change or the bug being fixed — not the implementation. NO function
names, NO file paths, NO bullet, NO preamble. Just the sentence. If the PR
genuinely is just a dependency bump or trivial cleanup, say so plainly.`;

headlineRouter.get('/api/headline/stream', (req: Request, res: Response) => {
  const owner = String(req.query.owner ?? '');
  const repo = String(req.query.repo ?? '');
  const number = Number(req.query.number);
  const headSha = String(req.query.headSha ?? '');

  if (!owner || !repo || !number || !headSha) {
    return res.status(400).json({ error: 'Missing required query params.' });
  }

  const bundle = getBundle(owner, repo, number, headSha);
  if (!bundle) {
    return res.status(404).json({ error: 'PR bundle not in cache.' });
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

  const cached = getHeadline(owner, repo, number, headSha);
  if (cached) {
    send('chunk', cached);
    send('done', '');
    res.end();
    return;
  }

  const runner = new ClaudeRunner({
    onChunk: (delta) => send('chunk', delta),
    onUsage: (usage) => send('usage', usage),
    onDone: (full) => {
      setHeadline(owner, repo, number, headSha, full.trim());
      send('done', '');
      res.end();
    },
    onError: (msg) => {
      send('error', msg);
      res.end();
    },
  });

  req.on('close', () => runner.abort());
  // Headline is one short sentence — Sonnet is plenty smart for it and is
  // 2-3× faster than Opus, which is the user's CLI default and the actual
  // driver of "the headline is slow" complaints. User can override via ?model.
  const model = validateModelParam(req.query.model) ?? 'sonnet';
  runner.start(bundle, { systemPrompt: HEADLINE_PROMPT, model });
});

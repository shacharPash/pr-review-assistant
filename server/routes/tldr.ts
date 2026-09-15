import { Router, type Request, type Response } from 'express';
import { ClaudeRunner, pickModel } from '../services/claudeRunner.js';
import { getBundle, getGenerated, setGenerated, generatedIdentity } from '../services/cache.js';

export const tldrRouter = Router();

tldrRouter.get('/api/tldr/stream', (req: Request, res: Response) => {
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

  // If we already have a complete TL;DR cached, replay it as a single chunk.
  const variant = generatedIdentity(bundle, 'tldr', pickModel(req.query.mode, 'heavy'));
  const cached = req.query.retry === '1' ? undefined : getGenerated(owner, repo, number, headSha, variant);
  if (cached) {
    send('chunk', cached);
    send('done', { text: cached });
    res.end();
    return;
  }

  const runner = new ClaudeRunner({
    onChunk: (delta) => send('chunk', delta),
    onUsage: (usage) => send('usage', usage),
    onDone: (full) => {
      setGenerated(owner, repo, number, headSha, variant, full);
      send('done', { text: full });
      res.end();
    },
    onError: (msg) => {
      send('error', msg);
      res.end();
    },
  });

  res.on('close', () => {
    runner.abort();
  });

  // TL;DR is a heavy route: Opus when Smart, Sonnet when Fast.
  runner.start(bundle, { model: pickModel(req.query.mode, 'heavy') });
});

import { Router, type Request, type Response } from 'express';
import { ClaudeRunner } from '../services/claudeRunner.js';
import { getBundle, getExplanation, setExplanation } from '../services/cache.js';
import { findPersona } from '../../shared/personas.js';
import { sanitizeSingleSentence } from '../services/sanitizeOneShot.js';

export const explainRouter = Router();

explainRouter.get('/api/explain/stream', (req: Request, res: Response) => {
  const owner = String(req.query.owner ?? '');
  const repo = String(req.query.repo ?? '');
  const number = Number(req.query.number);
  const headSha = String(req.query.headSha ?? '');
  const personaId = String(req.query.persona ?? '');

  if (!owner || !repo || !number || !headSha || !personaId) {
    return res.status(400).json({ error: 'Missing required query params.' });
  }

  const persona = findPersona(personaId);
  if (!persona) {
    return res.status(400).json({ error: `Unknown persona: ${personaId}` });
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
  const send = (event: string, data: string): void => {
    if (closed) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      closed = true;
    }
  };

  const cached = getExplanation(owner, repo, number, headSha, personaId);
  if (cached) {
    send('chunk', cached);
    send('done', '');
    res.end();
    return;
  }

  // Tweet is a one-shot single sentence — same fragility as the headline,
  // so we buffer-then-flush and run the shared sanitizer. Plain English and
  // Checklist are multi-line, so streaming chunks still gives a useful "live"
  // feel and small leaks at the head matter less.
  const isOneShot = personaId === 'tweet';

  const runner = new ClaudeRunner({
    onChunk: (delta) => {
      if (isOneShot) return;
      send('chunk', delta);
    },
    onDone: (full) => {
      const finalText = isOneShot ? sanitizeSingleSentence(full) : full;
      setExplanation(owner, repo, number, headSha, personaId, finalText);
      if (isOneShot) send('chunk', finalText);
      send('done', '');
      res.end();
    },
    onError: (msg) => {
      send('error', msg);
      res.end();
    },
  });

  req.on('close', () => runner.abort());
  runner.start(bundle, { systemPrompt: persona.prompt });
});

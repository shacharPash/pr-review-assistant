import { Router, type Request, type Response } from 'express';
import { ClaudeRunner, pickModel } from '../services/claudeRunner.js';
import { getBundle, getExplanation, setExplanation } from '../services/cache.js';
import { buildChecklistAcPrompt, findPersona } from '../../shared/personas.js';
import { checklistSource } from '../../shared/jira.js';

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
  const send = (event: string, data: unknown): void => {
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

  const runner = new ClaudeRunner({
    onChunk: (delta) => send('chunk', delta),
    onUsage: (usage) => send('usage', usage),
    onDone: (full) => {
      setExplanation(owner, repo, number, headSha, personaId, full);
      send('done', '');
      res.end();
    },
    onError: (msg) => {
      send('error', msg);
      res.end();
    },
  });

  req.on('close', () => runner.abort());

  // The Checklist persona becomes Jira-aware: when the PR links a fully-fetched
  // ticket, ground the checklist in that ticket's acceptance criteria instead
  // of inventing verification items from the diff. Every other persona (and the
  // no-Jira checklist) uses its static prompt. We inject the ticket description
  // here — NOT via formatJiraContext — because that helper deliberately keeps
  // descriptions out of prompts (see claudeRunner.ts); only this route wants it.
  let systemPrompt = persona.prompt;
  if (personaId === 'checklist') {
    const source = checklistSource(bundle.jira);
    if (source.mode === 'jira') {
      systemPrompt = buildChecklistAcPrompt(source.ticket.key, source.ticket.description);
    }
  }

  // Light route: the personas (plain-english, checklist) are short
  // reformulations of the diff. Opus adds no quality here.
  runner.start(bundle, { systemPrompt, model: pickModel(req.query.mode, 'light') });
});

import { Router, type Request, type Response } from 'express';
import { ClaudeRunner } from '../services/claudeRunner.js';
import { getBundle, getBeforeAfter, setBeforeAfter } from '../services/cache.js';

export const beforeAfterRouter = Router();

const BEFORE_AFTER_PROMPT = `Decide if a Before/After comparison would help a reviewer understand this
pull request. It helps when the PR changes USER-VISIBLE behavior, a bug
symptom, a workflow, a state machine, or any "what happens" of the system.

It does NOT help for: dependency bumps, pure refactors, formatting, docs.

If a Before/After IS useful, output EXACTLY this format with NO preamble or
extra prose:

BEFORE: <one short sentence about what happens / what's wrong today>
AFTER: <one short sentence about what happens after this PR ships>

Both sentences must be CONCRETE (cite the actual symptom / behavior, not
"the code is improved"). Each ≤ 18 words. No code identifiers unless they
are truly the killer detail. Use plain English.

If a Before/After is NOT useful, output exactly:

NONE

Output one or the other. Nothing else.`;

beforeAfterRouter.get('/api/before-after/stream', (req: Request, res: Response) => {
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
  const send = (event: string, data: string): void => {
    if (closed) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      closed = true;
    }
  };

  const cached = getBeforeAfter(owner, repo, number, headSha);
  if (cached !== undefined) {
    send('chunk', cached);
    send('done', '');
    res.end();
    return;
  }

  const runner = new ClaudeRunner({
    onChunk: (delta) => send('chunk', delta),
    onDone: (full) => {
      setBeforeAfter(owner, repo, number, headSha, full.trim());
      send('done', '');
      res.end();
    },
    onError: (msg) => {
      send('error', msg);
      res.end();
    },
  });

  req.on('close', () => runner.abort());
  runner.start(bundle, { systemPrompt: BEFORE_AFTER_PROMPT });
});

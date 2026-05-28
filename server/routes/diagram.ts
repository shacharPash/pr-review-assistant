import { Router, type Request, type Response } from 'express';
import { ClaudeRunner } from '../services/claudeRunner.js';
import { getBundle, getDiagram, setDiagram } from '../services/cache.js';

export const diagramRouter = Router();

const DIAGRAM_PROMPT = `Decide whether a visual diagram would meaningfully help a reviewer
understand this pull request. A diagram helps when the PR changes:
- control flow / sequence of calls between components
- a state machine or lifecycle
- data flow between services
- a structural relationship (class hierarchy, ownership)

A diagram does NOT help for: dependency bumps, formatting, single-function
edits, doc changes, or pure refactors with no behavioral change.

If a diagram would help, output a single Mermaid block describing what's
NEW or CHANGED in this PR (not the entire system). Prefer 'sequenceDiagram'
for call-flow changes or 'flowchart TD' for state/data. Keep it to 6-12
nodes. Use \`Note over X: ...\` callouts to highlight what's new.

Output format MUST be EXACTLY one of:

NONE

or

\`\`\`mermaid
<the diagram>
\`\`\`

No preamble, no explanation, no commentary. Just one or the other.`;

diagramRouter.get('/api/diagram/stream', (req: Request, res: Response) => {
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

  const cached = getDiagram(owner, repo, number, headSha);
  if (cached !== undefined) {
    send('chunk', cached);
    send('done', '');
    res.end();
    return;
  }

  const runner = new ClaudeRunner({
    onChunk: (delta) => send('chunk', delta),
    onDone: (full) => {
      setDiagram(owner, repo, number, headSha, full.trim());
      send('done', '');
      res.end();
    },
    onError: (msg) => {
      send('error', msg);
      res.end();
    },
  });

  req.on('close', () => runner.abort());
  runner.start(bundle, { systemPrompt: DIAGRAM_PROMPT });
});

import { Router, type Request, type Response } from 'express';
import { ClaudeRunner, validateModelParam } from '../services/claudeRunner.js';
import { getBundle, getComplexity, setComplexity } from '../services/cache.js';

export const complexityRouter = Router();

const COMPLEXITY_PROMPT = `Rate the REVIEW COMPLEXITY of this pull request. You are NOT rating the
PR's size — only how much careful attention a human reviewer should give
the change itself.

Think about: control-flow complexity, security or correctness sensitivity,
blast radius (how many other parts could break), interface changes, novel
algorithms or concurrency. NOT: line count, file count, formatting.

Output EXACTLY ONE WORD from this list and nothing else:

  simple    — mechanical change, low risk if wrong (renames, doc updates,
              version bumps, formatting, straightforward bugfix in a leaf
              function)
  moderate  — typical feature/bugfix; reviewer needs to read carefully but
              the risk surface is contained
  complex   — high risk surface (concurrency, security, public API, data
              migration, control flow with non-obvious edge cases) — the
              reviewer should slow down regardless of size
  unknown   — you genuinely cannot tell; the change is too unusual,
              context-dependent, or ambiguous to classify

No preamble. No punctuation. No explanation. Just one of those four words.`;

complexityRouter.get('/api/complexity/stream', (req: Request, res: Response) => {
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

  const cached = getComplexity(owner, repo, number, headSha);
  if (cached !== undefined) {
    send('chunk', cached);
    send('done', '');
    res.end();
    return;
  }

  const runner = new ClaudeRunner({
    onChunk: (delta) => send('chunk', delta),
    onUsage: (usage) => send('usage', usage),
    onDone: (full) => {
      // Normalize: model may add stray punctuation/casing.
      const normalized = full.trim().toLowerCase().replace(/[^a-z]/g, '');
      const valid = ['simple', 'moderate', 'complex', 'unknown'].includes(normalized)
        ? normalized
        : 'unknown';
      setComplexity(owner, repo, number, headSha, valid);
      send('done', '');
      res.end();
    },
    onError: (msg) => {
      send('error', msg);
      res.end();
    },
  });

  req.on('close', () => runner.abort());
  const model = validateModelParam(req.query.model);
  runner.start(bundle, { systemPrompt: COMPLEXITY_PROMPT, ...(model ? { model } : {}) });
});

import { Router, type Request, type Response } from 'express';
import { ClaudeRunner, validateModelParam } from '../services/claudeRunner.js';
import { getBundle, getBeforeAfter, setBeforeAfter } from '../services/cache.js';

export const beforeAfterRouter = Router();

const BEFORE_AFTER_PROMPT = `Produce a Before/After comparison for this pull request. Always output
one — there is no "skip" option, even for trivial PRs.

Output EXACTLY this format with NO preamble or extra prose:

BEFORE: <one short sentence about what happens / what's true today>
AFTER: <one short sentence about what happens / what's true after this PR ships>

Pick a framing that fits the kind of change:

- BUG FIX     → BEFORE: the symptom. AFTER: the fixed behavior.
- NEW FEATURE → BEFORE: what users can't do today. AFTER: what they can do now.
- REFACTOR    → BEFORE: how it's implemented today. AFTER: how it's implemented now (same behavior).
- DEP / TOOL  → BEFORE: prior version / config. AFTER: new version / config + the reason.
- DOCS        → BEFORE: what was documented (or missing). AFTER: what's documented now.
- TESTS-ONLY  → BEFORE: untested behavior X. AFTER: behavior X is now covered by tests.

Rules:
- Both sentences ≤ 18 words. Plain English.
- Be CONCRETE: cite the actual thing that changed, never "the code is improved".
- Use \`code\` formatting for any identifier you must name.
- If the PR is genuinely tiny (typo, single import), the framing can be modest
  (e.g. "BEFORE: typo in error message. AFTER: typo fixed.") but still produce both lines.

Output the two lines. Nothing else.`;

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
  const send = (event: string, data: unknown): void => {
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
    onUsage: (usage) => send('usage', usage),
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
  const model = validateModelParam(req.query.model);
  runner.start(bundle, { systemPrompt: BEFORE_AFTER_PROMPT, ...(model ? { model } : {}) });
});

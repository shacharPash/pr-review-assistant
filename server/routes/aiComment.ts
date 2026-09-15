import { Router, type Request, type Response } from 'express';
import { ClaudeRunner } from '../services/claudeRunner.js';
import type { TokenUsage } from '../../shared/usage.js';

export const aiCommentRouter = Router();

interface Body {
  mode?: 'suggest' | 'enhance';
  filePath?: string;
  startLine?: number;
  endLine?: number;
  originalCode?: string;
  draft?: string;
}

aiCommentRouter.post('/api/ai-comment', async (req: Request, res: Response) => {
  const { mode, filePath, startLine, endLine, originalCode, draft } = req.body as Body;

  if (mode !== 'suggest' && mode !== 'enhance') {
    return res.status(400).json({ error: 'mode must be suggest or enhance.' });
  }
  if (!filePath || !startLine || !endLine) {
    return res.status(400).json({ error: 'filePath/startLine/endLine required.' });
  }

  const prompt = mode === 'suggest'
    ? buildSuggestPrompt(filePath, startLine, endLine, originalCode ?? '', draft ?? '')
    : buildEnhancePrompt(filePath, startLine, endLine, originalCode ?? '', draft ?? '');

  const controller = new AbortController();
  const disconnect = () => controller.abort();
  res.once('close', disconnect);
  try {
    const { text, usage } = await runClaude(prompt, controller.signal);
    if (!res.destroyed) res.json({ text, usage });
  } catch (err) {
    if (!res.destroyed && !controller.signal.aborted) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Claude call failed.' });
    }
  } finally {
    res.removeListener('close', disconnect);
  }
});

function buildSuggestPrompt(
  filePath: string, startLine: number, endLine: number, code: string, draft: string,
): string {
  return `You are helping a code reviewer write a concrete code suggestion.

File: ${filePath}
Lines: ${startLine}-${endLine}

Original code (this is what the suggestion will REPLACE — line by line):
\`\`\`
${code}
\`\`\`

Reviewer's draft comment (may be empty): ${draft || '(none)'}

Your task: write a REPLACEMENT for the original code that addresses the reviewer's
concern. STRICT rules:

- Output ONLY the replacement code. No prose, no explanation, no markdown fences, no comments about your reasoning.
- The replacement should be a drop-in for those exact lines (same indentation, same language).
- If the reviewer's draft is empty, infer the most likely improvement (security, correctness, clarity).
- Do NOT remove imports or unrelated logic.
- Do NOT change the language or paradigm.
- If no concrete code change is appropriate, output the original code unchanged.`;
}

function buildEnhancePrompt(
  filePath: string, startLine: number, endLine: number, code: string, draft: string,
): string {
  return `You are polishing a code-review comment so it's clear, specific, and useful.

File: ${filePath}
Lines: ${startLine}-${endLine}
Code under review:
\`\`\`
${code}
\`\`\`

Reviewer's draft comment:
${draft}

Rewrite the comment so it's:
- Clear and specific — names what changed and why it matters
- Constructive in tone — assumes good intent
- Short — 1-3 sentences max
- Plain prose, no preamble, no markdown headings
- Keeps any \`inline code\` or **bold** the reviewer already wrote

Output ONLY the rewritten comment. No quotes, no preamble, no commentary.`;
}

interface ClaudeResult {
  text: string;
  usage: TokenUsage | null;
}

export function runClaude(prompt: string, signal?: AbortSignal): Promise<ClaudeResult> {
  return new Promise((resolve, reject) => {
    let usage: TokenUsage | null = null;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const runner = new ClaudeRunner({
      onChunk: () => {},
      onUsage: (value) => { usage = value; },
      onDone: (text) => { cleanup(); resolve({ text: text.trim(), usage }); },
      onError: (message) => { cleanup(); reject(new Error(message)); },
    });
    const abort = () => { runner.abort(); cleanup(); reject(new Error('AI request cancelled.')); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    runner.startPrompt(prompt, { model: 'sonnet' });
  });
}

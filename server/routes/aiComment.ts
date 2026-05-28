import { Router, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';

export const aiCommentRouter = Router();

interface Body {
  mode?: 'suggest' | 'enhance';
  filePath?: string;
  startLine?: number;
  endLine?: number;
  originalCode?: string;
  draft?: string;
}

const TIMEOUT_MS = 60_000;

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

  try {
    const text = await runClaude(prompt);
    res.json({ text });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === 'ENOENT') {
      return res.status(502).json({ error: 'Claude CLI not found on PATH.' });
    }
    return res.status(502).json({
      error: 'Claude call failed',
      detail: e.stderr ?? e.message,
    });
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

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['-p'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`AI call timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (c: string) => { stdout += c; });
    proc.stderr.on('data', (c: string) => { stderr += c; });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else {
        const e = new Error(`claude exited ${code}`) as Error & { code?: number; stderr?: string };
        e.code = code ?? -1;
        e.stderr = stderr;
        reject(e);
      }
    });
    proc.stdin.end(prompt);
  });
}

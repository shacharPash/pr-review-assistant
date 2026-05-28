import { Router, type Request, type Response } from 'express';
import { spawn } from 'node:child_process';
import { getBundle } from '../services/cache.js';

export const reviewRouter = Router();

function runGhWithStdin(args: string[], stdin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (c: string) => { stdout += c; });
    proc.stderr.on('data', (c: string) => { stderr += c; });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else {
        const e = new Error(`gh exited ${code}`) as Error & { code?: number; stderr?: string };
        e.code = code ?? -1;
        e.stderr = stderr;
        reject(e);
      }
    });
    proc.stdin.end(stdin);
  });
}

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

interface InlineComment {
  path: string;
  line: number;
  /** Optional: when set, comment spans startLine..line. */
  startLine?: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
}

interface PostReviewBody {
  owner?: string;
  repo?: string;
  number?: number;
  headSha?: string;
  event?: ReviewEvent;
  summary?: string;
  inlineComments?: InlineComment[];
}

reviewRouter.post('/api/review', async (req: Request, res: Response) => {
  const { owner, repo, number, headSha, event, summary, inlineComments } =
    req.body as PostReviewBody;

  if (!owner || !repo || !number || !headSha) {
    return res.status(400).json({ error: 'Missing owner/repo/number/headSha.' });
  }
  if (event !== 'APPROVE' && event !== 'REQUEST_CHANGES' && event !== 'COMMENT') {
    return res.status(400).json({ error: 'event must be APPROVE, REQUEST_CHANGES, or COMMENT.' });
  }

  const bundle = getBundle(owner, repo, number, headSha);
  if (!bundle) {
    return res.status(404).json({
      error: 'PR not in cache — reload it before posting.',
    });
  }

  const cleanComments = (inlineComments ?? [])
    .filter((c) => c.path && c.line && c.body?.trim())
    .map((c) => {
      const line = Math.max(1, Math.floor(c.line));
      const start = c.startLine && c.startLine !== c.line
        ? Math.max(1, Math.floor(c.startLine))
        : undefined;
      return {
        path: c.path,
        line,
        startLine: start && start < line ? start : undefined,
        side: (c.side ?? 'RIGHT') as 'LEFT' | 'RIGHT',
        body: c.body.trim(),
      };
    });

  if (cleanComments.length === 0 && !summary?.trim() && event === 'COMMENT') {
    return res.status(400).json({ error: 'Comment review must include text or inline comments.' });
  }

  const reviewBody = composeBody(summary, cleanComments.length, headSha);

  // gh api needs the body as JSON via stdin (--input -)
  const payload = {
    commit_id: headSha,
    body: reviewBody,
    event,
    comments: cleanComments.map((c) => ({
      path: c.path,
      line: c.line,
      side: c.side,
      body: c.body,
      ...(c.startLine ? { start_line: c.startLine, start_side: c.side } : {}),
    })),
  };

  try {
    const apiPath = `repos/${owner}/${repo}/pulls/${number}/reviews`;
    const stdout = await runGhWithStdin(
      ['api', '--method', 'POST', apiPath, '--input', '-'],
      JSON.stringify(payload),
    );
    const result = JSON.parse(stdout) as { html_url?: string; id?: number };
    res.json({
      url: result.html_url ?? null,
      id: result.id ?? null,
    });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === 'ENOENT' || (typeof e.message === 'string' && e.message.includes('ENOENT'))) {
      return res.status(502).json({ error: 'GitHub CLI (`gh`) not found on PATH.' });
    }
    const detail = e.stderr?.trim().split('\n').slice(-5).join('\n');
    return res.status(502).json({
      error: 'Failed to submit review to GitHub.',
      detail: detail ?? e.message,
    });
  }
});

function composeBody(summary: string | undefined, inlineCount: number, headSha: string): string {
  const lines: string[] = [];
  if (summary?.trim()) {
    lines.push(summary.trim());
    lines.push('');
  }
  if (inlineCount > 0) {
    lines.push(`<sub>${inlineCount} inline comment${inlineCount === 1 ? '' : 's'} · Posted via PR Review Assistant · review of \`${headSha.slice(0, 7)}\`</sub>`);
  } else {
    lines.push(`<sub>Posted via PR Review Assistant · review of \`${headSha.slice(0, 7)}\`</sub>`);
  }
  return lines.join('\n');
}


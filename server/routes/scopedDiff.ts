import { Router, type Request, type Response } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getBundle } from '../services/cache.js';
import { parseUnifiedDiff } from '../services/diffParser.js';
import { annotateNoise } from '../services/noiseRules.js';
import { reorderForReading } from '../services/readingOrder.js';
import { GHError } from '../services/ghFetcher.js';

const execFileAsync = promisify(execFile);

export const scopedDiffRouter = Router();

/**
 * Returns a parsed DiffFile[] for a scoped range of the PR — either a
 * single commit or the diff between two arbitrary SHAs. The PR bundle
 * itself must already be loaded (we look up the cached bundle to know
 * the owner/repo/headSha for the cache key).
 */
scopedDiffRouter.get('/api/pr/scoped-diff', async (req: Request, res: Response) => {
  const owner = String(req.query.owner ?? '');
  const repo = String(req.query.repo ?? '');
  const number = Number(req.query.number);
  const headSha = String(req.query.headSha ?? '');
  const kind = String(req.query.kind ?? ''); // 'commit' | 'range'
  const commitSha = String(req.query.commit ?? '');
  const baseSha = String(req.query.base ?? '');

  if (!owner || !repo || !number || !headSha || !kind) {
    return res.status(400).json({ error: 'Missing required query params.' });
  }
  if (!getBundle(owner, repo, number, headSha)) {
    return res.status(404).json({ error: 'PR bundle not in cache.' });
  }

  try {
    let diffRaw: string;
    if (kind === 'commit') {
      if (!commitSha) return res.status(400).json({ error: 'commit param required.' });
      const { stdout } = await execFileAsync(
        'gh',
        ['api', '-H', 'Accept: application/vnd.github.diff',
         `repos/${owner}/${repo}/commits/${commitSha}`],
        { maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' },
      );
      diffRaw = stdout;
    } else if (kind === 'range') {
      if (!baseSha) return res.status(400).json({ error: 'base param required for range.' });
      const { stdout } = await execFileAsync(
        'gh',
        ['api', '-H', 'Accept: application/vnd.github.diff',
         `repos/${owner}/${repo}/compare/${baseSha}...${headSha}`],
        { maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' },
      );
      diffRaw = stdout;
    } else {
      return res.status(400).json({ error: `Unknown scope kind: ${kind}` });
    }

    const files = reorderForReading(annotateNoise(parseUnifiedDiff(diffRaw)));
    res.json({ files });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string; code?: string };
    if (e.code === 'ENOENT') {
      throw new GHError('GitHub CLI (`gh`) not found on PATH.');
    }
    const detail = e.stderr?.trim().split('\n').slice(-3).join('\n');
    res.status(502).json({
      error: 'Failed to fetch scoped diff.',
      detail: detail ?? e.message,
    });
  }
});

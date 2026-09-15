import { cacheGeneration, isCurrentGeneration } from '../services/cacheLifecycle.js';
import { Router, type Request, type Response } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getBundle } from '../services/cache.js';
import { parseUnifiedDiff } from '../services/diffParser.js';
import { annotateNoise } from '../services/noiseRules.js';
import { reorderForReading } from '../services/readingOrder.js';
import { runGH } from '../services/ghFetcher.js';
import { rememberComparison } from '../services/comparisons.js';
import type { Comparison } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

export const scopedDiffRouter = Router();

/**
 * Returns a parsed DiffFile[] for a scoped range of the PR — either a
 * single commit or the diff between two arbitrary SHAs. The PR bundle
 * itself must already be loaded (we look up the cached bundle to know
 * the owner/repo/headSha for the cache key).
 */
scopedDiffRouter.get('/api/pr/scoped-diff', async (req: Request, res: Response) => {
  const generation = cacheGeneration();
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
  const bundle = getBundle(owner, repo, number, headSha);
  if (!bundle) {
    return res.status(404).json({ error: 'PR bundle not in cache.' });
  }

  try {
    let diffRaw: string;
    const comparison: Comparison = { owner, repo, number, prHeadSha: headSha, headSha, baseSha, scope: 'since-review' };
    if (kind === 'commit') {
      if (!bundle.commits?.some((c) => c.oid === commitSha)) {
        return res.status(400).json({ error: 'Commit is not in this PR.' });
      }
      const commit = JSON.parse(await runGH(['api', `repos/${owner}/${repo}/commits/${commitSha}`])) as { sha: string; parents: { sha: string }[] };
      comparison.scope = 'commit';
      comparison.headSha = commit.sha;
      comparison.baseSha = commit.parents[0]?.sha ?? null;
      const { stdout } = await execFileAsync(
        'gh',
        ['api', '-H', 'Accept: application/vnd.github.diff',
         `repos/${owner}/${repo}/commits/${commitSha}`],
        { timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' },
      );
      diffRaw = stdout;
    } else if (kind === 'range') {
      if (!/^[a-f0-9]{40}$/i.test(baseSha)) return res.status(400).json({ error: 'Full base SHA required.' });
      const range = JSON.parse(await runGH(['api', `repos/${owner}/${repo}/compare/${baseSha}...${headSha}`])) as { merge_base_commit: { sha: string } };
      comparison.baseSha = range.merge_base_commit.sha;
      if (comparison.baseSha !== baseSha) {
        return res.status(409).json({ error: 'The previous review is not an ancestor of this head. Use All commits.' });
      }
      const { stdout } = await execFileAsync(
        'gh',
        ['api', '-H', 'Accept: application/vnd.github.diff',
         `repos/${owner}/${repo}/compare/${baseSha}...${headSha}`],
        { timeout: 30_000, killSignal: 'SIGKILL', maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' },
      );
      diffRaw = stdout;
    } else {
      return res.status(400).json({ error: `Unknown scope kind: ${kind}` });
    }

    const files = reorderForReading(annotateNoise(parseUnifiedDiff(diffRaw)));
    if (isCurrentGeneration(generation)) rememberComparison(comparison, files);
    res.json({ files, comparison });
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string; code?: string };
    if (e.code === 'ENOENT') {
      return res.status(502).json({ error: 'GitHub CLI (`gh`) not found on PATH.' });
    }
    const detail = e.stderr?.trim().split('\n').slice(-3).join('\n');
    res.status(502).json({
      error: 'Failed to fetch scoped diff.',
      detail: detail ?? e.message,
    });
  }
});

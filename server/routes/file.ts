import { BoundedCache } from '../services/boundedCache.js';
import { cacheGeneration, isCurrentGeneration, registerCacheClear } from '../services/cacheLifecycle.js';
import { findComparison } from '../services/comparisons.js';
import { comparisonKey } from '../../shared/types.js';
import { Router, type Request, type Response } from 'express';
import { fetchFileAtRef } from '../services/fileContent.js';
import { getBundle } from '../services/cache.js';
import { GHError } from '../services/ghFetcher.js';

export const fileRouter = Router();

interface FileContentResponse {
  oldContent: string | null;
  newContent: string | null;
}

const memo = new BoundedCache<FileContentResponse>(15 * 60_000, 100, 50 * 1024 * 1024);
const inflight = new Map<string, Promise<FileContentResponse>>();
registerCacheClear(() => inflight.clear());

fileRouter.get('/api/pr/file', async (req: Request, res: Response) => {
  const generation = cacheGeneration();
  const owner = String(req.query.owner ?? '');
  const repo = String(req.query.repo ?? '');
  const number = Number(req.query.number);
  const headSha = String(req.query.headSha ?? '');
  const path = String(req.query.path ?? '');

  if (!owner || !repo || !number || !headSha || !path) {
    return res.status(400).json({ error: 'Missing required query params.' });
  }

  const bundle = getBundle(owner, repo, number, headSha);
  if (!bundle) {
    return res.status(404).json({ error: 'PR bundle not in cache. Fetch /api/pr first.' });
  }

  const selected = findComparison(bundle, String(req.query.comparison ?? ''));
  if (!selected) return res.status(409).json({ error: 'Comparison expired. Select the comparison again.' });
  const file = selected.files.find((f) => f.path === path || f.oldPath === path);
  if (!file) {
    return res.status(404).json({ error: `File ${path} not in bundle.` });
  }

  const cacheKey = `${comparisonKey(selected.comparison)}:${path}`;
  const cached = memo.get(cacheKey);
  if (cached) return res.json(cached);

  const pending = inflight.get(cacheKey);
  if (pending) {
    try {
      const result = await pending;
      return res.json(result);
    } catch (err) {
      if (!isCurrentGeneration(generation)) return res.status(409).json({ error: 'Local data was cleared. Reload the PR.' });
      // fall through to fresh fetch attempt
    }
  }

  const baseSha = selected.comparison.baseSha;
  const newPath = file.path;
  const oldPath = file.oldPath ?? file.path;

  const promise = (async (): Promise<FileContentResponse> => {
    const [oldContent, newContent] = await Promise.all([
      file.status === 'added' || !baseSha ? Promise.resolve(null) : fetchFileAtRef(owner, repo, oldPath, baseSha),
      file.status === 'removed' ? Promise.resolve(null) : fetchFileAtRef(owner, repo, newPath, selected.comparison.headSha),
    ]);
    const result: FileContentResponse = { oldContent, newContent };
    if (isCurrentGeneration(generation)) memo.set(cacheKey, result);
    return result;
  })();

  if (isCurrentGeneration(generation)) inflight.set(cacheKey, promise);
  try {
    const result = await promise;
    res.json(result);
  } catch (err) {
    if (err instanceof GHError) {
      return res.status(502).json({ error: err.message, detail: err.detail });
    }
    const e = err as Error;
    res.status(500).json({ error: 'Unexpected error', detail: e.message });
  } finally {
    if (inflight.get(cacheKey) === promise) inflight.delete(cacheKey);
  }
});

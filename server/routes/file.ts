import { Router, type Request, type Response } from 'express';
import { fetchFileAtRef } from '../services/fileContent.js';
import { getBundle } from '../services/cache.js';
import { GHError } from '../services/ghFetcher.js';

export const fileRouter = Router();

interface FileContentResponse {
  oldContent: string | null;
  newContent: string | null;
}

const memo = new Map<string, FileContentResponse>();
const inflight = new Map<string, Promise<FileContentResponse>>();

fileRouter.get('/api/pr/file', async (req: Request, res: Response) => {
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

  const file = bundle.files.find((f) => f.path === path || f.oldPath === path);
  if (!file) {
    return res.status(404).json({ error: `File ${path} not in bundle.` });
  }

  const cacheKey = `${owner}/${repo}:${headSha}:${path}`;
  const cached = memo.get(cacheKey);
  if (cached) return res.json(cached);

  const pending = inflight.get(cacheKey);
  if (pending) {
    try {
      const result = await pending;
      return res.json(result);
    } catch (err) {
      // fall through to fresh fetch attempt
    }
  }

  const baseSha = bundle.meta.baseSha;
  const newPath = file.path;
  const oldPath = file.oldPath ?? file.path;

  const promise = (async (): Promise<FileContentResponse> => {
    const [oldContent, newContent] = await Promise.all([
      file.status === 'added' ? Promise.resolve(null) : fetchFileAtRef(owner, repo, oldPath, baseSha),
      file.status === 'removed' ? Promise.resolve(null) : fetchFileAtRef(owner, repo, newPath, headSha),
    ]);
    const result: FileContentResponse = { oldContent, newContent };
    memo.set(cacheKey, result);
    return result;
  })();

  inflight.set(cacheKey, promise);
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
    inflight.delete(cacheKey);
  }
});

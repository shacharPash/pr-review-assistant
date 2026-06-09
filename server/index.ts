import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import open from 'open';
import { prRouter } from './routes/pr.js';
import { tldrRouter } from './routes/tldr.js';
import { fileRouter } from './routes/file.js';
import { explainRouter } from './routes/explain.js';
import { headlineRouter } from './routes/headline.js';
import { reviewRouter } from './routes/review.js';
import { diagramRouter } from './routes/diagram.js';
import { aiCommentRouter } from './routes/aiComment.js';
import { beforeAfterRouter } from './routes/beforeAfter.js';
import { complexityRouter } from './routes/complexity.js';
import { blameRouter } from './routes/blame.js';
import { scopedDiffRouter } from './routes/scopedDiff.js';
import { reviewCommentsRouter } from './routes/reviewComments.js';
import { healthRouter } from './routes/health.js';
import { checksRouter } from './routes/checks.js';
import { checkHealth } from './services/healthCheck.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT ?? 5173);
const isDev = process.env.NODE_ENV !== 'production';

// SSE clients can disconnect mid-write; that surfaces here as EPIPE/ECONNRESET
// on the response socket. Per-route handlers also guard, but this catches
// anything that slips through (e.g. on the spawned `claude` child's stdio).
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
    console.warn(`[pr-review-assistant] swallowed ${err.code} from client disconnect`);
    return;
  }
  throw err;
});

async function main() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  app.use(prRouter);
  app.use(tldrRouter);
  app.use(fileRouter);
  app.use(explainRouter);
  app.use(headlineRouter);
  app.use(reviewRouter);
  app.use(diagramRouter);
  app.use(aiCommentRouter);
  app.use(beforeAfterRouter);
  app.use(complexityRouter);
  app.use(blameRouter);
  app.use(scopedDiffRouter);
  app.use(reviewCommentsRouter);
  app.use(healthRouter);
  app.use(checksRouter);

  if (isDev) {
    const vite = await createViteServer({
      configFile: path.resolve(ROOT, 'vite.config.ts'),
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      try {
        const indexPath = path.resolve(ROOT, 'client/index.html');
        let html = fs.readFileSync(indexPath, 'utf-8');
        html = await vite.transformIndexHtml(req.originalUrl, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
  } else {
    // In production the compiled entry is dist/server/index.js, so the built
    // client sits next to it at dist/client (../client from here). Resolving
    // off ROOT would double-count the dist segment.
    const clientDist = path.resolve(__dirname, '../client');
    app.use(express.static(clientDist));
    app.use('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.listen(PORT, async () => {
    const url = `http://localhost:${PORT}`;
    console.log(`[pr-review-assistant] listening on ${url}`);
    // Surface missing-dep warnings in the terminal too — not just the UI
    // banner. Helps people who launched the server but didn't open the
    // browser yet (and didn't realize gh / claude were missing).
    try {
      const report = await checkHealth(true);
      for (const dep of report.dependencies) {
        if (dep.problem) {
          console.warn(
            `[pr-review-assistant] ⚠  ${dep.name} ${dep.problem}: ${dep.hint ?? ''}`,
          );
        }
      }
    } catch {
      /* health probe is best-effort */
    }
    if (isDev && process.env.NO_OPEN !== '1') {
      open(url).catch(() => {});
    }
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

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
    const clientDist = path.resolve(ROOT, 'dist/client');
    app.use(express.static(clientDist));
    app.use('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`[pr-review-assistant] listening on ${url}`);
    if (isDev && process.env.NO_OPEN !== '1') {
      open(url).catch(() => {});
    }
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});

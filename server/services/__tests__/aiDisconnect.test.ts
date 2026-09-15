import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ClaudeRunner } from '../claudeRunner.js';
import { aiCommentRouter } from '../../routes/aiComment.js';
import { tldrRouter } from '../../routes/tldr.js';

vi.mock('../cache.js', () => ({ getBundle: () => ({}), getGenerated: () => undefined, setGenerated: vi.fn() }));
afterEach(() => { vi.restoreAllMocks(); });

describe('AI browser disconnect', () => {
  it.each(['comment', 'stream'])('aborts %s only when the response disconnects', async (kind) => {
    // Stop at the process boundary: never invoke the real launcher.
    const start = vi.spyOn(ClaudeRunner.prototype, 'startPrompt').mockImplementation(() => {});
    const startBundle = vi.spyOn(ClaudeRunner.prototype, 'start').mockImplementation(() => {});
    const abort = vi.spyOn(ClaudeRunner.prototype, 'abort');
    const app = express();
    app.use(express.json(), aiCommentRouter, tldrRouter);
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const port = (server.address() as AddressInfo).port;
    const body = JSON.stringify({ mode: 'enhance', filePath: 'synthetic.ts', startLine: 1, endLine: 1, draft: 'Synthetic draft' });
    const req = request({
      host: '127.0.0.1', port,
      path: kind === 'comment' ? '/api/ai-comment' : '/api/tldr/stream?owner=synthetic&repo=test&number=1&headSha=abc',
      method: kind === 'comment' ? 'POST' : 'GET',
      headers: kind === 'comment' ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
    });
    req.on('error', () => {});
    req.on('response', (res) => res.resume());
    try {
      req.end(kind === 'comment' ? body : undefined);
      await vi.waitFor(() => expect(kind === 'comment' ? start : startBundle).toHaveBeenCalledOnce());
      // The full request body has arrived, but work should still be running.
      expect(abort).not.toHaveBeenCalled();
      req.destroy();
      await vi.waitFor(() => expect(abort).toHaveBeenCalledOnce());
    } finally {
      req.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { privacyRouter, requireAIConsent } from '../../routes/privacy.js';
import { getBundle, setBundle } from '../cache.js';
import type { PRBundle } from '../../../shared/types.js';

let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(requireAIConsent, privacyRouter);
  app.use((_req, res) => res.json({ reached: true }));
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } });

describe('explicit AI choice and local deletion', () => {
  it.each(['tldr/stream', 'headline/stream', 'diagram/stream', 'before-after/stream', 'complexity/stream', 'explain/stream', 'ai-comment', 'ai-review/stream', 'ai-chat/stream', 'AI-COMMENT'])('blocks %s without the recorded choice', async (route) => {
    const response = await fetch(`${base}/api/${route}`);
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('reached');
  });
  it('keeps manual review available, allows opted-in AI and rejects ambiguous consent', async () => {
    expect((await fetch(`${base}/api/review`, { method: 'POST' })).status).toBe(200);
    expect((await fetch(`${base}/api/tldr/stream?aiConsent=1`)).status).toBe(200);
    expect((await fetch(`${base}/api/tldr/stream?aiConsent=1&aiConsent=0`)).status).toBe(403);
  });
  it('clears cached PR and generated data', async () => {
    setBundle({ meta: { owner: 'fixture', repo: 'private', number: 1, headSha: 'abc' }, files: [] } as unknown as PRBundle);
    expect(getBundle('fixture', 'private', 1, 'abc')).toBeDefined();
    expect((await fetch(`${base}/api/local-data/clear`, { method: 'POST' })).status).toBe(200);
    expect(getBundle('fixture', 'private', 1, 'abc')).toBeUndefined();
  });
});

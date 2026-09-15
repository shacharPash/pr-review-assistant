import http, { type Server } from 'node:http';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  isAllowedLocalRequest,
  isLoopbackHostname,
  localRequestBoundary,
  resolveListenHost,
} from '../../security.js';

interface TestResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}

describe('local server security', () => {
  let server: Server | undefined;
  let port: number;

  beforeAll(async () => {
    const app = express();
    app.disable('x-powered-by');
    app.use(localRequestBoundary);
    app.all('/api/health', (_req, res) => res.json({ ok: true }));
    app.all('/api/pr', (_req, res) => res.json({ ok: true }));
    app.get('*', (_req, res) => res.type('html').send('<main>app</main>'));

    const testServer = http.createServer(app);
    server = testServer;
    await new Promise<void>((resolve, reject) => {
      testServer.once('error', reject);
      testServer.listen(0, '127.0.0.1', resolve);
    });
    const address = testServer.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP test server');
    port = address.port;
  });

  afterAll(async () => {
    if (!server?.listening) return;
    const activeServer = server;
    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => error ? reject(error) : resolve());
    });
  });

  function request(
    path: string,
    headers: Record<string, string> = {},
    method = 'GET',
  ): Promise<TestResponse> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { host: `localhost:${port}`, ...headers },
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  it('recognizes loopback hosts only', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('127.10.20.30')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('192.168.1.10')).toBe(false);
    expect(isLoopbackHostname('example.com')).toBe(false);
  });

  it('requires the complete request origin to match the local Host', () => {
    expect(isAllowedLocalRequest('localhost:5173', undefined)).toBe(true);
    expect(isAllowedLocalRequest('localhost:5173', 'http://localhost:5173')).toBe(true);
    expect(isAllowedLocalRequest('localhost:5173', 'https://localhost:5173')).toBe(false);
    expect(isAllowedLocalRequest('localhost:5173', 'http://localhost:5174')).toBe(false);
    expect(isAllowedLocalRequest('localhost:5173', 'http://localhost:5173/path')).toBe(false);
    expect(isAllowedLocalRequest('localhost:5173', 'null')).toBe(false);
  });

  it('rejects forged and malformed Host headers', () => {
    expect(isAllowedLocalRequest('evil.example:5173', undefined)).toBe(false);
    expect(isAllowedLocalRequest('localhost:5173@evil.example', undefined)).toBe(false);
    expect(isAllowedLocalRequest('localhost:5173/path', undefined)).toBe(false);
    expect(isAllowedLocalRequest('localhost:99999', undefined)).toBe(false);
    expect(isAllowedLocalRequest('127.1:5173', undefined)).toBe(false);
  });

  it('never permits a non-loopback listener through environment flags', () => {
    expect(resolveListenHost({})).toBe('127.0.0.1');
    expect(resolveListenHost({ HOST: 'localhost' })).toBe('localhost');
    expect(resolveListenHost({ HOST: '::1' })).toBe('::1');
    expect(() => resolveListenHost({ HOST: '[::1]' })).toThrow(/Refusing to bind/);
    expect(() => resolveListenHost({ HOST: '0.0.0.0' })).toThrow(/Refusing to bind/);
    expect(() => resolveListenHost({
      HOST: '0.0.0.0',
      ALLOW_REMOTE_ACCESS: '1',
    })).toThrow(/Refusing to bind/);
  });

  it('accepts same-origin browser API requests and sets browser security headers', async () => {
    const response = await request('/api/pr', {
      origin: `http://localhost:${port}`,
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
    });

    expect(response.status).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
  });

  it.each(['cross-site', 'same-site'])(
    'rejects API requests with %s browser metadata when Origin is absent',
    async (site) => {
      const response = await request('/api/pr', {
        'sec-fetch-site': site,
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-dest': 'image',
      });

      expect(response.status).toBe(403);
    },
  );

  it('allows the verified extension health request', async () => {
    const response = await request('/api/health', {
      'sec-fetch-site': 'none',
      'sec-fetch-mode': 'cors',
    });

    expect(response.status).toBe(200);
  });

  it('does not extend the extension health exception to other API requests', async () => {
    const [otherApi, healthPost] = await Promise.all([
      request('/api/pr', { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'cors' }),
      request('/api/health', { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'cors' }, 'POST'),
    ]);

    expect(otherApi.status).toBe(403);
    expect(healthPost.status).toBe(403);
  });

  it('preserves cross-site top-level app deep links', async () => {
    const response = await request('/review/owner/repo/123', {
      'sec-fetch-site': 'cross-site',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
    });

    expect(response.status).toBe(200);
    expect(response.body).toContain('<main>app</main>');
  });

  it('allows local non-browser API clients without browser metadata', async () => {
    const response = await request('/api/health');
    expect(response.status).toBe(200);
  });

  it('rejects invalid Host and Origin values through the middleware', async () => {
    const [forgedHost, incompleteOrigin] = await Promise.all([
      request('/api/health', { host: `evil.example:${port}` }),
      request('/api/health', { origin: `http://localhost:${port}/path` }),
    ]);

    expect(forgedHost.status).toBe(403);
    expect(incompleteOrigin.status).toBe(403);
  });
});

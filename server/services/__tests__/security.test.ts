import { describe, expect, it } from 'vitest';
import { isAllowedLocalRequest, isLoopbackHostname, resolveListenHost } from '../../security.js';

describe('local server security', () => {
  it('recognizes loopback hosts only', () => {
    expect(isLoopbackHostname('localhost')).toBe(true);
    expect(isLoopbackHostname('127.0.0.1')).toBe(true);
    expect(isLoopbackHostname('127.10.20.30')).toBe(true);
    expect(isLoopbackHostname('::1')).toBe(true);
    expect(isLoopbackHostname('192.168.1.10')).toBe(false);
    expect(isLoopbackHostname('example.com')).toBe(false);
  });

  it('rejects forged hosts and cross-origin browser requests', () => {
    expect(isAllowedLocalRequest('localhost:5173', undefined)).toBe(true);
    expect(isAllowedLocalRequest('localhost:5173', 'http://localhost:5173')).toBe(true);
    expect(isAllowedLocalRequest('evil.example:5173', undefined)).toBe(false);
    expect(isAllowedLocalRequest('localhost:5173', 'https://evil.example')).toBe(false);
  });

  it('requires an explicit opt-in before binding remotely', () => {
    expect(resolveListenHost({})).toBe('127.0.0.1');
    expect(() => resolveListenHost({ HOST: '0.0.0.0' })).toThrow(/Refusing to bind/);
    expect(resolveListenHost({ HOST: '0.0.0.0', ALLOW_REMOTE_ACCESS: '1' })).toBe('0.0.0.0');
  });
});

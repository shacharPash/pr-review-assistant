import { isIP } from 'node:net';
import type { RequestHandler } from 'express';

const LOOPBACK_HOSTS = new Set(['localhost', '::1']);

interface LocalAuthority {
  authority: string;
}

function parseLocalAuthority(value: string): LocalAuthority | null {
  if (!value || value.trim() !== value || /[\s/?#\\,@]/.test(value)) return null;

  let hostname: string;
  let port: string | undefined;
  if (value.startsWith('[')) {
    const match = /^\[([^\]]+)\](?::([0-9]+))?$/.exec(value);
    if (!match) return null;
    [, hostname, port] = match;
  } else {
    const match = /^([^:]+)(?::([0-9]+))?$/.exec(value);
    if (!match) return null;
    [, hostname, port] = match;
  }

  const normalizedHostname = hostname.toLowerCase();
  if (!isLoopbackHostname(normalizedHostname)) return null;
  if (port !== undefined) {
    const portNumber = Number(port);
    if (!Number.isInteger(portNumber) || portNumber < 0 || portNumber > 65535) return null;
    if (String(portNumber) !== port) return null;
  }

  const serializedHostname = normalizedHostname === '::1'
    ? '[::1]'
    : normalizedHostname;
  return {
    authority: port === undefined ? serializedHostname : `${serializedHostname}:${port}`,
  };
}

export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return LOOPBACK_HOSTS.has(normalized) ||
    (isIP(normalized) === 4 && normalized.split('.')[0] === '127');
}

export function isAllowedLocalRequest(
  hostHeader: string | undefined,
  originHeader: string | undefined,
): boolean {
  if (!hostHeader) return false;
  const host = parseLocalAuthority(hostHeader);
  if (!host) return false;

  if (!originHeader) return true;
  const originMatch = /^([a-z][a-z0-9+.-]*):\/\/(.+)$/i.exec(originHeader);
  if (!originMatch || originMatch[1].toLowerCase() !== 'http') return false;
  const origin = parseLocalAuthority(originMatch[2]);
  return origin?.authority === host.authority;
}

function hasAllowedFetchMetadata(
  path: string,
  method: string,
  originHeader: string | undefined,
  fetchSiteHeader: string | undefined,
): boolean {
  if (path !== '/api' && !path.startsWith('/api/')) return true;
  if (!fetchSiteHeader) return true;

  const fetchSite = fetchSiteHeader.trim().toLowerCase();
  if (fetchSite === 'same-origin') return true;
  return fetchSite === 'none' &&
    !originHeader &&
    method === 'GET' &&
    path === '/api/health';
}

export function resolveListenHost(env: NodeJS.ProcessEnv): string {
  const requested = env.HOST?.trim();
  if (!requested) return '127.0.0.1';
  const normalized = requested.toLowerCase();
  if (normalized === 'localhost' || normalized === '::1' ||
      (isIP(normalized) === 4 && normalized.split('.')[0] === '127')) {
    return normalized;
  }
  throw new Error(
    `Refusing to bind PR Review Assistant to non-loopback host "${requested}".`,
  );
}

export const localRequestBoundary: RequestHandler = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });

  const host = req.get('host');
  const origin = req.get('origin');
  const fetchSite = req.get('sec-fetch-site');
  if (!isAllowedLocalRequest(host, origin) ||
      !hasAllowedFetchMetadata(req.path, req.method, origin, fetchSite)) {
    return res.status(403).json({ error: 'PR Review Assistant only accepts local requests.' });
  }

  next();
};

import { isIP } from 'node:net';

const LOOPBACK_HOSTS = new Set(['localhost', '::1']);

function hostnameFromHostHeader(hostHeader: string): string | null {
  try {
    return new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return null;
  }
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
  const host = hostnameFromHostHeader(hostHeader);
  if (!host || !isLoopbackHostname(host)) return false;

  if (!originHeader) return true;
  try {
    const origin = new URL(originHeader);
    return origin.host === hostHeader && isLoopbackHostname(origin.hostname);
  } catch {
    return false;
  }
}

export function resolveListenHost(env: NodeJS.ProcessEnv): string {
  const requested = env.HOST?.trim();
  if (!requested) return '127.0.0.1';
  if (isLoopbackHostname(requested)) return requested;
  if (env.ALLOW_REMOTE_ACCESS === '1') return requested;
  throw new Error(
    `Refusing to bind PR Review Assistant to non-loopback host "${requested}". ` +
    'Set ALLOW_REMOTE_ACCESS=1 only on a trusted network.',
  );
}

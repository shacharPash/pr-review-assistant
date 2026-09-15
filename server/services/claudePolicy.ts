import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Keep authentication, provider routing, proxies and privacy choices. Do not
// inherit unrelated application secrets or process-injection variables.
const ENV_NAMES = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR',
  'SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME',
  'CLAUDE_CONFIG_DIR', 'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC', 'CLAUDE_CODE_ENABLE_TELEMETRY',
  'CLAUDE_CODE_DISABLE_1M_CONTEXT', 'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS',
  'CLAUDE_CODE_SKIP_BEDROCK_AUTH', 'CLAUDE_CODE_SKIP_VERTEX_AUTH', 'CLAUDE_CODE_SKIP_FOUNDRY_AUTH',
  'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY',
  'CLAUDE_CODE_USE_ANTHROPIC_AWS', 'CLAUDE_CODE_USE_MANTLE',
  'DISABLE_TELEMETRY', 'DISABLE_ERROR_REPORTING', 'DO_NOT_TRACK',
  'DISABLE_AUTOUPDATER', 'DISABLE_UPDATES', 'DISABLE_GROWTHBOOK',
  'DISABLE_PROMPT_CACHING', 'DISABLE_PROMPT_CACHING_FABLE',
  'DISABLE_PROMPT_CACHING_HAIKU', 'DISABLE_PROMPT_CACHING_OPUS', 'DISABLE_PROMPT_CACHING_SONNET',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CLOUD_ML_REGION',
]);
const PROVIDER_ENV = /^(?:ANTHROPIC|AWS|GOOGLE|GCLOUD|VERTEX|AZURE|OTEL)_[A-Z0-9_]+$/;

export function claudeEnv(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => value !== undefined && (ENV_NAMES.has(key) || PROVIDER_ENV.test(key))));
}

/** Checked against installed CLI help and the official CLI reference.
 * Safe mode preserves OAuth and provider auth; bare mode does not.
 * Managed organization policy still applies. Never retry with weaker flags.
 */
export function claudeArgs(model?: string): string[] {
  return [
    '-p', '--output-format', 'stream-json', '--verbose',
    '--safe-mode', '--setting-sources', 'user',
    '--tools', '', '--disallowedTools', '*',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--disable-slash-commands', '--no-chrome', '--no-session-persistence',
    '--permission-mode', 'dontAsk',
    '--settings', '{"disableAllHooks":true,"disableClaudeAiConnectors":true}',
    ...(model ? ['--model', model] : []),
  ];
}

export interface ClaudeProcessEvents {
  onData: (chunk: string) => void;
  onClose: (error?: string) => void;
}
export type ClaudeLauncher = (prompt: string, events: ClaudeProcessEvents, model?: string) => () => void;

/** Injection is for deterministic fake-executable tests, never request input. */
export function createClaudeLauncher(config: {
  command?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  killGraceMs?: number;
  maxConcurrent?: number;
  maxQueued?: number;
  maxOutputBytes?: number;
} = {}): ClaudeLauncher {
  let active = 0;
  const queue: Array<() => void> = [];
  const maxConcurrent = config.maxConcurrent ?? 3;
  const maxQueued = config.maxQueued ?? 12;
  const timeoutMs = config.timeoutMs ?? 90_000;
  const pump = () => {
    while (active < maxConcurrent && queue.length) queue.shift()!();
  };
  return (prompt, events, model) => {
    let child: ChildProcessWithoutNullStreams | undefined;
    let cwd: string | undefined;
    let finished = false;
    let released = false;
    let started = false;
    let killTimer: NodeJS.Timeout | undefined;
    let outputBytes = 0;
    const release = () => {
      if (released) return;
      released = true;
      if (killTimer) clearTimeout(killTimer);
      if (cwd) rmSync(cwd, { recursive: true, force: true });
      if (started) active--;
      pump();
    };
    const finish = (error?: string, silent = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const index = queue.indexOf(start);
      if (index >= 0) queue.splice(index, 1);
      if (!silent) events.onClose(error);
    };
    const signalChild = (signal: NodeJS.Signals) => {
      if (!child || released) return;
      try {
        // Include provider authentication helpers in termination on POSIX.
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch { /* The process may already have exited. */ }
    };
    const stop = () => {
      if (!child || released) return;
      signalChild('SIGTERM');
      killTimer = setTimeout(() => signalChild('SIGKILL'), config.killGraceMs ?? 2_000);
      killTimer.unref();
    };
    const fail = (error: string) => { finish(error); stop(); };
    const start = () => {
      if (finished) return;
      active++;
      started = true;
      try {
        cwd = mkdtempSync(join(tmpdir(), 'pr-review-claude-'));
        child = spawn(config.command ?? 'claude', claudeArgs(model), {
          cwd,
          env: claudeEnv(config.env),
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
          detached: process.platform !== 'win32',
        });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          if (finished) return;
          outputBytes += Buffer.byteLength(chunk);
          if (outputBytes > (config.maxOutputBytes ?? 4_000_000)) {
            fail('Claude output exceeded the local size limit.');
          } else events.onData(chunk);
        });
        // Drain stderr, but never return provider errors containing credentials
        // or echoed private prompts to the browser or logs.
        child.stderr.resume();
        child.stdin.on('error', () => fail('Could not send the prompt to Claude.'));
        child.on('error', (error: NodeJS.ErrnoException) => {
          finish(error.code === 'ENOENT'
            ? 'Claude Code CLI not found on PATH. Install a CLI that supports --safe-mode.'
            : 'Claude could not start. Check your local CLI configuration.');
          release();
        });
        child.on('close', (code) => {
          finish(code === 0 ? undefined : 'Claude failed. Check CLI version, authentication and provider configuration.');
          release();
        });
        child.stdin.end(prompt);
      } catch {
        finish('Could not create an isolated Claude process.');
        release();
      }
    };
    const timer = setTimeout(() => fail(`Claude timed out after ${timeoutMs / 1000}s.`), timeoutMs);
    if (queue.length >= maxQueued && active >= maxConcurrent) {
      // Defer callbacks so callers can register cancellation before completion.
      queueMicrotask(() => finish('AI is busy. Please retry shortly.'));
    } else {
      queue.push(start);
      pump();
    }
    return () => { finish(undefined, true); stop(); };
  };
}

export const launchClaude = createClaudeLauncher();

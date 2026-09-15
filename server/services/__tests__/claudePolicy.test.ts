import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { claudeEnv, createClaudeLauncher, type ClaudeLauncher } from '../claudePolicy.js';
import { ClaudeRunner } from '../claudeRunner.js';

const dirs: string[] = [];
afterEach(() => { dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });
function fixture(body: string) {
  const dir = mkdtempSync(join(tmpdir(), 'claude-policy-test-'));
  dirs.push(dir);
  const executable = join(dir, 'fake-claude');
  const record = join(dir, 'record.json');
  writeFileSync(executable, `#!${process.execPath}\n${body.replaceAll('RECORD_PATH', JSON.stringify(record))}`, { mode: 0o700 });
  return { executable, record, dir };
}
function run(launcher: ClaudeLauncher, prompt = 'Synthetic prompt') {
  let text = '';
  let abort: () => void = () => {};
  const done = new Promise<string | undefined>((resolve) => {
    abort = launcher(prompt, { onData: (chunk) => { text += chunk; }, onClose: resolve }, 'sonnet');
  });
  return { done, abort: () => abort(), text: () => text };
}

describe('Claude process isolation', () => {
  it('passes tool-free flags, neutral cwd and only synthetic provider/auth/privacy variables', async () => {
    const fake = fixture(`const fs = require('node:fs');
      fs.writeFileSync(RECORD_PATH, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),env:process.env}));
      process.stdin.resume(); process.stdin.on('end',()=>console.log('done'));`);
    const env = {
      PATH: '/usr/bin:/bin', HOME: fake.dir,
      CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '0',
      CLAUDE_CODE_USE_FOUNDRY: '0', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      ANTHROPIC_BASE_URL: 'https://provider.example.test', ANTHROPIC_AUTH_TOKEN: 'synthetic-only',
      AWS_PROFILE: 'synthetic', GOOGLE_APPLICATION_CREDENTIALS: '/synthetic/credentials',
      HTTPS_PROXY: 'https://proxy.example.test', DISABLE_TELEMETRY: '1',
      DISABLE_PROMPT_CACHING: '1', CLAUDE_CODE_USE_MANTLE: '0',
      CLAUDE_CODE_ENABLE_TELEMETRY: '0', OTEL_EXPORTER_OTLP_ENDPOINT: 'https://telemetry.example.test',
      JIRA_API_TOKEN: 'must-not-inherit', GITHUB_TOKEN: 'must-not-inherit',
      CLAUDE_CODE_CLIENT_CERT: '/synthetic/client.crt', CLAUDE_CODE_CLIENT_KEY: '/synthetic/client.key',
      CLAUDE_CODE_CLIENT_KEY_PASSPHRASE: 'synthetic-passphrase', CLAUDE_CODE_CERT_STORE: 'system',
      CLAUDE_CODE_SKIP_MANTLE_AUTH: '1', CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH: '1',
      CLAUDE_CODE_DISABLE_MTLS_RELOAD_ON_STALE_CONNECTION: '1', CLAUDE_CODE_OAUTH_SCOPES: 'synthetic-scope',
      NODE_OPTIONS: '--require=/untrusted', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'other-session',
    };
    const result = run(createClaudeLauncher({ command: fake.executable, env }));
    expect(await result.done).toBeUndefined();
    const record = JSON.parse(readFileSync(fake.record, 'utf8'));
    expect(record.args).toEqual(expect.arrayContaining(['--safe-mode', '--no-session-persistence', '--strict-mcp-config', '--disable-slash-commands', '--no-chrome']));
    for (const [flag, value] of [['--tools', ''], ['--disallowedTools', '*'], ['--mcp-config', '{"mcpServers":{}}'], ['--setting-sources', 'user'], ['--permission-mode', 'dontAsk']]) {
      expect(record.args[record.args.indexOf(flag) + 1]).toBe(value);
    }
    expect(record.cwd).not.toBe(process.cwd());
    expect(existsSync(record.cwd)).toBe(false);
    delete record.env.__CF_USER_TEXT_ENCODING; // macOS adds this inside Node.
    expect(record.env).toEqual(claudeEnv(env));
    expect(record.env).not.toHaveProperty('JIRA_API_TOKEN');
    expect(record.env).not.toHaveProperty('NODE_OPTIONS');
    expect(record.env.CLAUDE_CODE_USE_BEDROCK).toBe('1');
    expect(record.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC).toBe('1');
    for (const key of [
      'CLAUDE_CODE_CLIENT_CERT', 'CLAUDE_CODE_CLIENT_KEY', 'CLAUDE_CODE_CLIENT_KEY_PASSPHRASE',
      'CLAUDE_CODE_CERT_STORE', 'CLAUDE_CODE_SKIP_MANTLE_AUTH', 'CLAUDE_CODE_SKIP_ANTHROPIC_AWS_AUTH',
      'CLAUDE_CODE_DISABLE_MTLS_RELOAD_ON_STALE_CONNECTION', 'CLAUDE_CODE_OAUTH_SCOPES',
    ] as const) expect(record.env[key]).toBe(env[key]);
  });

  it.each([undefined, '0', 'false'])('forces attachment preprocessing off despite inherited %s and saved user overrides', async (inherited) => {
    // Emulate only documented settings precedence. This fake never expands a
    // mention or reads its target; all recorded values are synthetic.
    const fake = fixture(`const fs = require('node:fs');
      const args = process.argv.slice(2);
      const userSettings = JSON.parse(fs.readFileSync(process.env.HOME+'/.claude/settings.json','utf8'));
      const settings = JSON.parse(args[args.indexOf('--settings')+1]);
      let prompt = '';
      process.stdin.setEncoding('utf8'); process.stdin.on('data',chunk=>prompt+=chunk);
      process.stdin.on('end',()=>{
        fs.writeFileSync(RECORD_PATH, JSON.stringify({
          inherited:process.env.CLAUDE_CODE_DISABLE_ATTACHMENTS,
          setting:settings.env.CLAUDE_CODE_DISABLE_ATTACHMENTS,
          effective:{...process.env,...userSettings.env,...settings.env}.CLAUDE_CODE_DISABLE_ATTACHMENTS,
          prompt,
        }));
        console.log('done');
      });`);
    mkdirSync(join(fake.dir, '.claude'));
    writeFileSync(join(fake.dir, '.claude/settings.json'), JSON.stringify({ env: { CLAUDE_CODE_DISABLE_ATTACHMENTS: '0' } }));
    const prompt = 'Synthetic PR text mentions @/synthetic/not-a-real-file and @~/synthetic-not-a-real-file';
    const result = run(createClaudeLauncher({
      command: fake.executable,
      env: { HOME: fake.dir, CLAUDE_CODE_DISABLE_ATTACHMENTS: inherited },
    }), prompt);
    expect(await result.done).toBeUndefined();
    expect(JSON.parse(readFileSync(fake.record, 'utf8'))).toEqual({
      inherited: '1', setting: '1', effective: '1', prompt,
    });
  });

  it('bounds concurrency, cancels queued work and releases the slot after abort', async () => {
    const fake = fixture(`require('node:fs').appendFileSync(RECORD_PATH,'started\\n'); process.stdin.resume(); setInterval(()=>{},1000);`);
    const launcher = createClaudeLauncher({ command: fake.executable, env: {}, maxConcurrent: 1, maxQueued: 1, timeoutMs: 2_000, killGraceMs: 20 });
    const first = run(launcher);
    await vi.waitFor(() => expect(existsSync(fake.record)).toBe(true));
    const queued = run(launcher);
    const rejected = run(launcher);
    expect(await rejected.done).toContain('busy');
    queued.abort();
    first.abort();
    const next = run(launcher);
    await vi.waitFor(() => expect(readFileSync(fake.record, 'utf8').trim().split('\n')).toHaveLength(2));
    next.abort();
  });

  it('times out and kills a child that ignores SIGTERM before starting another', async () => {
    const fake = fixture(`require('node:fs').appendFileSync(RECORD_PATH,'started\\n'); process.on('SIGTERM',()=>{}); process.stdin.resume(); setInterval(()=>{},1000);`);
    const launcher = createClaudeLauncher({ command: fake.executable, env: {}, maxConcurrent: 1, timeoutMs: 1_500, killGraceMs: 20 });
    const first = run(launcher);
    expect(await first.done).toContain('timed out');
    const next = run(launcher);
    await vi.waitFor(() => expect(readFileSync(fake.record, 'utf8').trim().split('\n')).toHaveLength(2));
    next.abort();
  });

  it('caps output and suppresses provider stderr', async () => {
    const fake = fixture(`process.stderr.write('synthetic-private-error'); process.stdout.write('x'.repeat(2000)); setInterval(()=>{},1000);`);
    const result = run(createClaudeLauncher({ command: fake.executable, env: {}, maxOutputBytes: 100 }));
    expect(await result.done).toContain('size limit');
    expect(result.text()).toBe('');
  });

  it('fails once when executable is absent', async () => {
    const events = { onData: vi.fn(), onClose: vi.fn() };
    createClaudeLauncher({ command: '/missing/synthetic-claude', env: {} })('prompt', events);
    await vi.waitFor(() => expect(events.onClose).toHaveBeenCalledTimes(1));
    expect(events.onClose.mock.calls[0][0]).toContain('not found');
  });
});

describe('shared result handling', () => {
  it.each([
    ['{"type":"result","result":"answer","usage":{"input_tokens":7}}', 'answer', undefined],
    ['{"type":"result","result":""}', '', undefined],
    ['garbage\nnull\n', undefined, 'no valid result'],
    ['{"type":"result","is_error":true,"result":"private-provider-error"}', undefined, 'did not complete'],
  ])('handles complete, empty, malformed and error results', async (output, expected, error) => {
    const fake = fixture(`process.stdin.resume(); process.stdin.on('end',()=>process.stdout.write(${JSON.stringify(output)}));`);
    const events = { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onUsage: vi.fn() };
    new ClaudeRunner(events, createClaudeLauncher({ command: fake.executable, env: {} })).startPrompt('synthetic');
    await vi.waitFor(() => expect(events.onDone.mock.calls.length + events.onError.mock.calls.length).toBe(1));
    if (error) {
      expect(events.onError.mock.calls[0][0]).toContain(error);
      expect(events.onChunk).not.toHaveBeenCalled();
    }
    else expect(events.onDone).toHaveBeenCalledWith(expected);
  });
});

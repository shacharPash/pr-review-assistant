import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** One dependency's diagnosis, surfaced to the UI so the user knows what to do. */
export interface DependencyStatus {
  name: 'gh' | 'claude';
  installed: boolean;
  authenticated?: boolean;
  /** Short version string when installed (`gh version 2.45.0 (...)`). */
  version?: string;
  /** Human-readable problem ("install", "auth", or null when OK). */
  problem: 'missing' | 'unauthenticated' | null;
  /** One-line fix the user can paste / follow. */
  hint?: string;
}

export interface HealthReport {
  ok: boolean;
  dependencies: DependencyStatus[];
}

async function probeGH(): Promise<DependencyStatus> {
  try {
    const { stdout } = await execFileAsync('gh', ['--version'], { encoding: 'utf8' });
    const version = stdout.split('\n')[0].trim();
    // gh auth status returns a non-zero exit if not authenticated.
    try {
      await execFileAsync('gh', ['auth', 'status'], { encoding: 'utf8' });
      return { name: 'gh', installed: true, authenticated: true, version, problem: null };
    } catch {
      return {
        name: 'gh',
        installed: true,
        authenticated: false,
        version,
        problem: 'unauthenticated',
        hint: 'Run `gh auth login` in your terminal.',
      };
    }
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return {
        name: 'gh',
        installed: false,
        problem: 'missing',
        hint: 'Install the GitHub CLI: https://cli.github.com  →  then run `gh auth login`.',
      };
    }
    return {
      name: 'gh',
      installed: false,
      problem: 'missing',
      hint: `gh failed to run: ${e.message}`,
    };
  }
}

async function probeClaude(): Promise<DependencyStatus> {
  try {
    const { stdout } = await execFileAsync('claude', ['--version'], { encoding: 'utf8' });
    return {
      name: 'claude',
      installed: true,
      version: stdout.trim(),
      problem: null,
    };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') {
      return {
        name: 'claude',
        installed: false,
        problem: 'missing',
        hint: 'Install Claude Code: https://claude.ai/code  →  AI features (Key Points, checklist, plain-English) will be disabled until then.',
      };
    }
    return {
      name: 'claude',
      installed: false,
      problem: 'missing',
      hint: `claude failed to run: ${e.message}`,
    };
  }
}

/**
 * Probe both external CLIs the app depends on. Cached in memory for 30s so the
 * UI banner can re-poll cheaply (e.g. after the user installs gh in another
 * terminal and wants to confirm).
 */
let cached: { report: HealthReport; at: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function checkHealth(force = false): Promise<HealthReport> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.report;
  }
  const [gh, claude] = await Promise.all([probeGH(), probeClaude()]);
  const report: HealthReport = {
    ok: gh.problem === null && claude.problem === null,
    dependencies: [gh, claude],
  };
  cached = { report, at: Date.now() };
  return report;
}

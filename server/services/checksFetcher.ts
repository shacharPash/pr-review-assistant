import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GHError } from './ghFetcher.js';
import type { CheckRun, CheckBucket } from '../../shared/checks.js';

const execFileAsync = promisify(execFile);

/** Subset of `gh pr checks --json …` we care about. */
interface RawCheck {
  name: string;
  workflow?: string;
  bucket: string;
  state: string;
  link: string;
  startedAt?: string;
  completedAt?: string;
}

const KNOWN_BUCKETS: CheckBucket[] = ['pass', 'fail', 'pending', 'skipping', 'cancel'];

function normalizeBucket(raw: string): CheckBucket {
  return (KNOWN_BUCKETS as string[]).includes(raw) ? (raw as CheckBucket) : 'pending';
}

export async function fetchChecks(
  owner: string,
  repo: string,
  number: number,
): Promise<CheckRun[]> {
  const args = [
    'pr', 'checks', String(number),
    '--repo', `${owner}/${repo}`,
    '--json', 'name,workflow,bucket,state,link,startedAt,completedAt',
  ];
  let stdout: string;
  try {
    const out = await execFileAsync('gh', args, { maxBuffer: 10 * 1024 * 1024 });
    stdout = out.stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string; stdout?: string };
    if (e.code === 'ENOENT') {
      throw new GHError(
        'GitHub CLI (`gh`) not found on PATH. Install from https://cli.github.com and run `gh auth login`.',
      );
    }
    // `gh pr checks` exits non-zero (8) when there ARE no checks or one failed.
    // Try to recover the JSON from stdout — gh prints it even on those exits.
    if (e.stdout && e.stdout.trim().startsWith('[')) {
      stdout = e.stdout;
    } else {
      throw new GHError(`gh ${args.join(' ')} failed`, e.stderr ?? e.message);
    }
  }

  let raw: RawCheck[];
  try {
    raw = JSON.parse(stdout) as RawCheck[];
  } catch {
    throw new GHError('Failed to parse gh pr checks output', stdout.slice(0, 500));
  }

  return raw.map((r) => ({
    name: r.name,
    workflow: r.workflow ?? '',
    bucket: normalizeBucket(r.bucket),
    state: r.state,
    link: r.link,
    startedAt: r.startedAt ?? null,
    completedAt: r.completedAt ?? null,
  }));
}

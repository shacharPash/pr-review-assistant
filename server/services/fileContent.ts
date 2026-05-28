import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GHError } from './ghFetcher.js';

const execFileAsync = promisify(execFile);

const MAX_BYTES = 500_000; // cap per file

/**
 * Fetches the raw file content at a given ref via `gh api`. Returns null for
 * 404 (file didn't exist at that ref — normal for added/removed files), or
 * for files larger than MAX_BYTES.
 */
export async function fetchFileAtRef(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const url = `repos/${owner}/${repo}/contents/${encoded}?ref=${encodeURIComponent(ref)}`;
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['api', '-H', 'Accept: application/vnd.github.raw', url],
      { maxBuffer: MAX_BYTES, encoding: 'utf8' },
    );
    return stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string; code?: string };
    const stderr = e.stderr ?? '';
    if (stderr.includes('HTTP 404') || stderr.includes('Not Found')) return null;
    if (e.code === 'ENOBUFS' || stderr.includes('too large')) return null;
    if (e.code === 'ENOENT') {
      throw new GHError(
        'GitHub CLI (`gh`) not found on PATH.',
      );
    }
    throw new GHError(`gh api ${url} failed`, stderr.trim().split('\n').slice(-3).join('\n'));
  }
}

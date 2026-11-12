import { describe, expect, it, vi } from 'vitest';
import { changedGuidelinePaths, fetchGuidelines } from '../guidelinesFetcher.js';

// Stop at the gh boundary. Only CLAUDE.md exists in the synthetic repo.
const gh = vi.hoisted(() => ({ endpoints: [] as string[] }));
vi.mock('node:child_process', () => ({
  execFile: (_file: string, args: string[], _options: unknown, callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
    const endpoint = args[args.length - 1];
    gh.endpoints.push(endpoint);
    if (endpoint.startsWith('repos/synthetic/repo/contents/CLAUDE.md?')) callback(null, { stdout: 'Base rules\n', stderr: '' });
    else callback(new Error('HTTP 404'));
  },
}));

describe('fetchGuidelines', () => {
  it('reads every convention file at the requested ref', async () => {
    const ref = 'b'.repeat(40);
    expect(await fetchGuidelines('synthetic', 'repo', ref)).toBe('--- CLAUDE.md ---\nBase rules');
    expect(gh.endpoints).toContain(`repos/synthetic/repo/contents/AGENTS.md?ref=${ref}`);
    expect(gh.endpoints.length).toBeGreaterThan(1);
    expect(gh.endpoints.every((endpoint) => endpoint.endsWith(`?ref=${ref}`))).toBe(true);
  });
});

describe('changedGuidelinePaths', () => {
  it('lists convention files the PR adds, edits, renames or deletes', () => {
    expect(changedGuidelinePaths([
      { path: 'src/app.ts' },
      { path: 'CLAUDE.md' },
      { path: 'docs/rules.md', oldPath: 'AGENTS.md' },
      { path: 'nested/CLAUDE.md' },
    ])).toEqual(['CLAUDE.md', 'AGENTS.md']);
    expect(changedGuidelinePaths([{ path: 'src/app.ts' }])).toEqual([]);
  });
});

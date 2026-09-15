import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, chmod, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { fetchPR } from '../ghFetcher.js';
import { setBundle } from '../cache.js';
import { scopedDiffRouter } from '../../routes/scopedDiff.js';
import { fileRouter } from '../../routes/file.js';
import { blameRouter } from '../../routes/blame.js';
import { reviewRouter } from '../../routes/review.js';
import { comparisonKey, prComparison, type Comparison, type PRBundle } from '../../../shared/types.js';

const head = 'a'.repeat(40), baseTip = 'b'.repeat(40), mergeBase = 'c'.repeat(40), commit = 'd'.repeat(40), parent = 'e'.repeat(40);
let root: string, server: Server, origin: string, bundle: PRBundle;
const priorPath = process.env.PATH;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'pra-comparison-test-'));
  const script = `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify('PLACEHOLDER')}, JSON.stringify(args)+'\\n');
const endpoint = args.find(a => a.startsWith('repos/')) || '';
const emit = value => process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value));
if(args[0] === 'pr') emit({number: 1, title:'Synthetic', body:'', author:{login:'test'}, headRefOid:'${head}', baseRefOid:'${baseTip}', url:'https://github.com/synthetic/repo/pull/1', state:'OPEN', commits:[{oid:'${commit}',messageHeadline:'Older change',messageBody:''}]});
else if(args.includes('Accept: application/vnd.github.diff')) emit('diff --git a/old.ts b/new.ts\\nrename from old.ts\\nrename to new.ts\\n--- a/old.ts\\n+++ b/new.ts\\n@@ -1 +1 @@\\n-old\\n+new\\n');
else if(endpoint.includes('/compare/')) emit({merge_base_commit:{sha: endpoint.includes('${commit}...') ? '${mergeBase}' : '${mergeBase}'}});
else if(endpoint.includes('/commits/')) emit({sha:'${commit}', parents:[{sha:'${parent}'}]});
else if(endpoint.includes('/contents/')) emit(endpoint);
else if(args[1] === 'graphql') emit({data:{repository:{object:{blame:{ranges:[]}}}}});
else if(args.includes('POST')) emit({id:99,html_url:'https://github.com/synthetic/review/99'});
else { process.stderr.write('Unexpected fake invocation'); process.exitCode=2; }
`;
  await writeFile(path.join(root, 'gh'), script.replace('"PLACEHOLDER"', JSON.stringify(path.join(root, 'calls'))));
  await chmod(path.join(root, 'gh'), 0o700);
  process.env.PATH = `${root}:${priorPath}`;
  bundle = await fetchPR('synthetic/repo#1'); setBundle(bundle);
  const app = express(); app.use(express.json());
  app.use(scopedDiffRouter, fileRouter, blameRouter, reviewRouter);
  await new Promise<void>((resolve, reject) => { server = app.listen(0, '127.0.0.1', resolve); server.once('error', reject); });
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
});
afterAll(async () => {
  process.env.PATH = priorPath;
  if (server) await new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); });
  if (root) await rm(root, { recursive: true, force: true });
});
function query(extra: Record<string, string>) {
  return new URLSearchParams({ owner: 'synthetic', repo: 'repo', number: '1', headSha: head, ...extra });
}

describe('real routes with a local fake GitHub CLI', () => {
  it('uses the merge base for a PR with an independently advanced base branch', async () => {
    expect(bundle.meta.baseSha).toBe(mergeBase);
    expect(bundle.meta.baseRefSha).toBe(baseTip);
    const res = await fetch(`${origin}/api/pr/file?${query({ path: 'new.ts', comparison: comparisonKey(prComparison(bundle)) })}`);
    const data = await res.json() as { oldContent: string; newContent: string; comparison: Comparison };
    expect(data.oldContent).toContain(`/contents/old.ts?ref=${mergeBase}`);
    expect(data.newContent).toContain(`/contents/new.ts?ref=${head}`);
    const calls = (await readFile(path.join(root, 'calls'), 'utf8')).split('\n').filter(Boolean).map((line) => JSON.parse(line) as string[]);
    expect(calls.some((a) => a.includes(`repos/synthetic/repo/compare/${baseTip}...${head}`) && a.includes('Accept: application/vnd.github.diff'))).toBe(true);
    expect(calls.some((a) => a[0] === 'pr' && a[1] === 'diff')).toBe(false);
  });
  it('uses commit parent and selected head, including renamed paths and blame', async () => {
    const scoped = await fetch(`${origin}/api/pr/scoped-diff?${query({ kind: 'commit', commit })}`);
    const data = await scoped.json() as { comparison: Comparison };
    expect(data.comparison).toMatchObject({ baseSha: parent, headSha: commit, prHeadSha: head, scope: 'commit' });
    const identity = comparisonKey(data.comparison);
    const full = await (await fetch(`${origin}/api/pr/file?${query({ path: 'new.ts', comparison: identity })}`)).json() as { oldContent: string; newContent: string };
    expect(full.oldContent).toContain(`/contents/old.ts?ref=${parent}`);
    expect(full.newContent).toContain(`/contents/new.ts?ref=${commit}`);
    const blame = await fetch(`${origin}/api/blame?${query({ path: 'new.ts', comparison: identity })}`);
    expect(blame.ok).toBe(true);
    expect(await readFile(path.join(root, 'calls'), 'utf8')).toContain(`rev=${commit}`);
    const all = await (await fetch(`${origin}/api/pr/file?${query({ path: 'new.ts' })}`)).json() as { newContent: string };
    expect(all.newContent).toContain(`ref=${head}`);
  });
  it('rejects unknown comparisons, commits outside the PR and diverged previous reviews', async () => {
    expect((await fetch(`${origin}/api/pr/file?${query({ path: 'new.ts', comparison: 'not registered' })}`)).status).toBe(409);
    expect((await fetch(`${origin}/api/pr/scoped-diff?${query({ kind: 'commit', commit: 'f'.repeat(40) })}`)).status).toBe(400);
    expect((await fetch(`${origin}/api/pr/scoped-diff?${query({ kind: 'range', base: commit })}`)).status).toBe(409);
  });
  it('returns an exact since-review comparison when the reviewed commit is an ancestor', async () => {
    const res = await fetch(`${origin}/api/pr/scoped-diff?${query({ kind: 'range', base: mergeBase })}`);
    const data = await res.json() as { oldContent: string; newContent: string; comparison: Comparison };
    expect(data.comparison).toMatchObject({ baseSha: mergeBase, headSha: head, scope: 'since-review' });
  });
  it('rejects submission when the PR head has changed before any write', async () => {
    const oldBundle = { ...bundle, meta: { ...bundle.meta, headSha: commit } }; setBundle(oldBundle);
    const res = await fetch(`${origin}/api/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ owner: 'synthetic', repo: 'repo', number: 1, headSha: commit, event: 'APPROVE' }) });
    expect(res.status).toBe(409);
    const calls = await readFile(path.join(root, 'calls'), 'utf8');
    expect(calls).not.toContain('"POST"');
  });
});

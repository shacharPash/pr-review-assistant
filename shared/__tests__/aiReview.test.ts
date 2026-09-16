import { describe, expect, it } from 'vitest';
import { parseAIReview, resolveAIReviewComment } from '../aiReview.js';

describe('parseAIReview', () => {
  it('parses a plain JSON object', () => {
    const raw = JSON.stringify({
      verdict: 'comment',
      summary: 'One real bug',
      comments: [
        { file: 'src/a.ts', line: 42, severity: 'bug', title: 'Nil deref', body: 'Guard `x`.' },
      ],
    });
    const r = parseAIReview(raw);
    expect(r).not.toBeNull();
    expect(r!.verdict).toBe('comment');
    expect(r!.comments).toHaveLength(1);
    expect(r!.comments[0]).toMatchObject({ file: 'src/a.ts', line: 42, severity: 'bug' });
  });

  it('strips ```json fences', () => {
    const raw = '```json\n{"verdict":"approve","summary":"clean","comments":[]}\n```';
    const r = parseAIReview(raw);
    expect(r).not.toBeNull();
    expect(r!.verdict).toBe('approve');
    expect(r!.comments).toEqual([]);
  });

  it('extracts a JSON object embedded in surrounding prose', () => {
    const raw = 'Here is my review:\n{"verdict":"comment","summary":"x","comments":[' +
      '{"file":"f.go","line":7,"severity":"security","title":"SQLi","body":"Use params."}]}\nDone.';
    const r = parseAIReview(raw);
    expect(r!.comments).toHaveLength(1);
    expect(r!.comments[0].severity).toBe('security');
  });

  it('rejects a finding with no body instead of dropping it', () => {
    expect(parseAIReview(JSON.stringify({ verdict: 'comment', summary: '', comments: [{ file: 'a.ts', line: 5, body: '' }] }))).toBeNull();
  });

  it('retains findings with invalid location metadata and a warning', () => {
    const result = parseAIReview(JSON.stringify({ verdict: 'comment', summary: '', comments: [
      { file: '', line: 1, body: 'Missing file' },
      { file: 'a.ts', line: 0, body: 'Invalid line' },
      { file: 'a.ts', line: '5', body: 'Invalid line type' },
    ] }));
    expect(result!.comments).toHaveLength(3);
    expect(result!.comments.every((c) => c.anchorWarning)).toBe(true);
  });

  it.each(['{}', '[]', '{"error":"Unable to review"}', '{"verdict":"fine","summary":"ok","comments":[]}',
    '{"verdict":"approve","comments":[]}', '{"verdict":"approve","summary":"x"}',
    '{"verdict":"approve","summary":"x","comments":[],"error":"failed"}',
  ])('rejects incomplete or error output %s', (raw) => expect(parseAIReview(raw)).toBeNull());

  it('coerces verdict to "comment" when comments exist but verdict says approve', () => {
    const raw = JSON.stringify({
      verdict: 'approve',
      summary: '',
      comments: [{ file: 'a.ts', line: 3, body: 'issue' }],
    });
    expect(parseAIReview(raw)!.verdict).toBe('comment');
  });

  it('defaults an unknown severity to correctness and keeps a valid startLine', () => {
    const raw = JSON.stringify({
      verdict: 'comment',
      summary: '',
      comments: [{ file: 'a.ts', line: 10, startLine: 8, severity: 'nonsense', body: 'x' }],
    });
    const c = parseAIReview(raw)!.comments[0];
    expect(c.severity).toBe('correctness');
    expect(c.startLine).toBe(8);
  });

  it('discards a startLine that is after the end line', () => {
    const raw = JSON.stringify({
      verdict: 'comment',
      summary: '',
      comments: [{ file: 'a.ts', line: 5, startLine: 9, severity: 'bug', body: 'x' }],
    });
    expect(parseAIReview(raw)!.comments[0].startLine).toBeUndefined();
  });

  it('returns null for non-JSON garbage', () => {
    expect(parseAIReview('the model refused to answer')).toBeNull();
    expect(parseAIReview('')).toBeNull();
  });
});

import type { PRBundle } from '../types.js';
describe('AI finding locations', () => {
  const bundle = { files: [{ path: 'a.ts', binary: false, noise: null,
    rawPatch: '@@ -1,3 +1,3 @@\n context\n-old\n+new\n context' }] } as PRBundle;
  const finding = { file: 'a.ts', line: 2, severity: 'bug' as const, title: 'Bug', body: 'Meaningful finding' };
  it('anchors exact added lines', () => expect(resolveAIReviewComment(bundle, finding).anchorWarning).toBeUndefined());
  it.each([{ line: 1000 }, { line: 1 }, { file: 'missing.ts' }, { startLine: 1 }])('keeps unanchored finding %j', (overrides) => {
    const result = resolveAIReviewComment(bundle, { ...finding, ...overrides });
    expect(result.body).toBe(finding.body);
    expect(result.anchorWarning).toBeTruthy();
    expect(result.line).toBe(overrides.line ?? finding.line);
  });
});

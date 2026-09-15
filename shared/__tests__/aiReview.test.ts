import { describe, expect, it } from 'vitest';
import { parseAIReview } from '../aiReview.js';

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

  it('drops comments missing a file, line, or body', () => {
    const raw = JSON.stringify({
      verdict: 'comment',
      summary: '',
      comments: [
        { file: '', line: 1, body: 'no file' },
        { file: 'a.ts', line: 0, body: 'bad line' },
        { file: 'a.ts', line: 5, body: '' },
        { file: 'a.ts', line: 9, body: 'keep me' },
      ],
    });
    const r = parseAIReview(raw);
    expect(r!.comments).toHaveLength(1);
    expect(r!.comments[0].line).toBe(9);
  });

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

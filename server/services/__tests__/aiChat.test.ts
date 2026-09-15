import { describe, it, expect } from 'vitest';
import { buildAiChatPrompt } from '../claudeRunner.js';
import type { PRBundle } from '../../../shared/types.js';

const BUNDLE: PRBundle = {
  meta: {
    owner: 'o',
    repo: 'r',
    number: 7,
    title: 'Fix cache null deref',
    body: 'Guards getBundle against a missing entry.',
    author: 'me',
    headSha: 'headsha',
    baseSha: 'basesha',
    url: 'https://github.com/o/r/pull/7',
    state: 'open',
    isDraft: false,
    reviewDecision: null,
  },
  files: [
    {
      path: 'server/cache.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      hunks: [],
      rawPatch: '@@ -40,3 +40,4 @@\n+const b = getBundle();\n+if (!b) return;',
      binary: false,
      noise: null,
    },
  ],
  commitMessages: ['fix: guard getBundle'],
};

describe('buildAiChatPrompt', () => {
  it('includes the PR context, the diff, and the latest question', () => {
    const prompt = buildAiChatPrompt(
      BUNDLE,
      [{ role: 'user', content: 'What does getBundle return?' }],
    );
    expect(prompt).toContain('Fix cache null deref'); // PR title / context
    expect(prompt).toContain('server/cache.ts'); // diff
    expect(prompt).toContain('What does getBundle return?'); // question
    // Ends by cueing the model to speak as the assistant.
    expect(prompt.trimEnd().endsWith('Assistant:')).toBe(true);
  });

  it('injects the current-file focus when provided', () => {
    const withFocus = buildAiChatPrompt(
      BUNDLE,
      [{ role: 'user', content: 'what does this do?' }],
      { path: 'server/cache.ts', startLine: 40, endLine: 44 },
    );
    expect(withFocus).toContain('currently has this file open');
    expect(withFocus).toContain('server/cache.ts');
    expect(withFocus).toContain('40-44');

    const without = buildAiChatPrompt(BUNDLE, [{ role: 'user', content: 'hi' }]);
    expect(without).not.toContain('currently has this file open');
  });

  it('preserves conversation order as a Reviewer/Assistant transcript', () => {
    const prompt = buildAiChatPrompt(BUNDLE, [
      { role: 'user', content: 'Q1' },
      { role: 'assistant', content: 'A1' },
      { role: 'user', content: 'Q2' },
    ]);
    const q1 = prompt.indexOf('Reviewer: Q1');
    const a1 = prompt.indexOf('Assistant: A1');
    const q2 = prompt.indexOf('Reviewer: Q2');
    expect(q1).toBeGreaterThan(-1);
    expect(q1).toBeLessThan(a1);
    expect(a1).toBeLessThan(q2);
  });
});

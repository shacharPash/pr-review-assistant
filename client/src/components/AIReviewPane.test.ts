import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../state/store.js', async (original) => {
  const actual = await original<typeof import('../state/store.js')>();
  const store = actual.useStore;
  return { ...actual, useStore: Object.assign((selector: (s: ReturnType<typeof store.getState>) => unknown) => selector(store.getState()), store) };
});
import { useStore } from '../state/store.js';
import { AIReviewPane } from './AIReviewPane.js';
import { AskPane } from './AskPane.js';
beforeEach(() => useStore.setState({ ...useStore.getInitialState(), bundle: {
  meta: { owner: 'owner', repo: 'repo', number: 1 } as never, files: [], commitMessages: [],
} }, true));
const render = (raw: string) => {
  useStore.setState({ aiReview: { text: raw, status: 'done' } });
  return renderToStaticMarkup(React.createElement(AIReviewPane));
};
describe('AI review result presentation', () => {
  it.each(['{}', '[]', '{"error":"Unable to review"}'])('renders malformed result as a retryable error: %s', (raw) => {
    const html = render(raw);
    expect(html).toContain('parse the AI review'); expect(html).toContain('Retry');
    expect(html).not.toContain('No findings'); expect(html).not.toContain('ready to approve');
  });
  it('shows a valid empty assessment without implying human approval', () => {
    const html = render('{"verdict":"approve","summary":"No issues in supplied context","comments":[]}');
    expect(html).toContain('No findings reported by AI');
    expect(html).toContain('Review the change before deciding');
    expect(html).not.toContain('ready to approve');
  });
  it('does not treat a comment verdict with no inline findings as a clean review', () => {
    const html = render('{"verdict":"comment","summary":"More context is needed","comments":[]}');
    expect(html).toContain('More context is needed');
    expect(html).not.toContain('No findings reported by AI');
  });
  it('retains an unanchored finding and renders hostile markup as text', () => {
    const html = render(JSON.stringify({ verdict: 'comment', summary: 'One finding', comments: [
      { file: 'missing.ts', line: 1000, title: 'Missing auth', body: '<img src=x onerror=alert(1)> **Check access**' },
    ] }));
    expect(html).toContain('Unanchored finding'); expect(html).toContain('Missing auth');
    expect(html).not.toContain('Add as comment'); expect(html).not.toContain('<img');
    expect(html).toContain('<strong>Check access</strong>');
  });
  it('renders hostile chat markdown with the safe shared renderer', () => {
    useStore.setState({ chat: { status: 'idle', messages: [{ role: 'assistant', content: '<script>alert(1)</script> [x](javascript:alert(1))' }] } });
    const html = renderToStaticMarkup(React.createElement(AskPane));
    expect(html).not.toContain('<script>'); expect(html).not.toContain('href="javascript:');
  });
});

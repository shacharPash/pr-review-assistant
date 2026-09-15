import React, { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiffFile, Comparison } from '../../../shared/types.js';
import { comparisonKey } from '../../../shared/types.js';

vi.mock('@monaco-editor/react', () => ({
  DiffEditor: (p: { original: string; modified: string }) => React.createElement('pre', { 'data-old': p.original, 'data-new': p.modified }),
  Editor: (p: { value: string }) => React.createElement('pre', { 'data-new': p.value }),
}));
vi.mock('./InlineCommentsLayer.js', () => ({ InlineCommentsLayer: () => React.createElement('span', { 'data-composer': true }) }));
vi.mock('./ReviewCommentsLayer.js', () => ({ ReviewCommentsLayer: () => null }));
vi.mock('./BlameResizer.js', () => ({ BlameResizer: () => null }));
vi.mock('./BlameHoverProvider.js', () => ({ BlameHoverProvider: () => null }));
vi.mock('../state/store.js', async (original) => {
  const actual = await original<typeof import('../state/store.js')>();
  const store = actual.useStore;
  const hook = Object.assign((selector: (s: ReturnType<typeof store.getState>) => unknown) => selector(store.getState()), store);
  return { ...actual, useStore: hook };
});
import { useStore } from '../state/store.js';
import { DiffViewer } from './DiffViewer.js';
import { FileSidebar } from './FileSidebar.js';
import { CommitSelector } from './CommitSelector.js';

const comparison: Comparison = { owner: 'owner', repo: 'repo', number: 1, prHeadSha: 'head', baseSha: 'parent', headSha: 'older', scope: 'commit' };
const file: DiffFile = { path: 'same.ts', status: 'modified', additions: 1, deletions: 1, noise: null, binary: false, rawPatch: '',
  hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, oldContent: 'selected parent', newContent: 'selected commit', additions: 1, deletions: 1, noise: null }] };
beforeEach(() => useStore.setState({ ...useStore.getInitialState(), comparison,
  scope: { kind: 'commit', label: 'Older', commitSha: 'older' }, scopedFiles: [file] }, true));

describe('actual React viewer regressions', () => {
  it('can transition from no file to a file without changing hook order', () => {
    function Transition() {
      const [step, setStep] = useState(0);
      const view = DiffViewer({ file: step === 0 ? null : file, position: null });
      if (step === 0) setStep(1);
      return view;
    }
    expect(() => renderToString(React.createElement(Transition))).not.toThrow();
  });
  it('rejects stale full content and uses only content for the selected comparison', () => {
    useStore.setState({ fullContent: { [file.path]: { status: 'ready', oldContent: 'PR base', newContent: 'PR head', comparisonKey: 'wrong comparison' } } });
    const stale = renderToString(React.createElement(DiffViewer, { file, position: null }));
    expect(stale).toContain('data-new="selected commit"');
    expect(stale).not.toContain('data-new="PR head"');
    useStore.setState({ fullContent: { [file.path]: { status: 'ready', oldContent: 'correct parent', newContent: 'correct historical commit', comparisonKey: comparisonKey(comparison) } } });
    const exact = renderToString(React.createElement(DiffViewer, { file, position: null }));
    expect(exact).toContain('data-new="correct historical commit"');
    expect(exact).not.toContain('data-composer');
    expect(exact).toContain('Historical comparison');
  });
  it('renders native file, noise and comparison controls', () => {
    useStore.setState({ bundle: { meta: { owner: 'owner', repo: 'repo', number: 1 } as never, files: [file], commitMessages: [] },
      scopedFiles: [file, { ...file, path: 'package-lock.json', noise: 'lockfile' }] });
    const sidebar = renderToString(React.createElement(FileSidebar));
    expect(sidebar).toMatch(/<button[^>]+class="info"/);
    expect(sidebar).toMatch(/<button[^>]+class="noise-toggle"/);
    expect(renderToString(React.createElement(CommitSelector))).toContain('<select');
  });
});

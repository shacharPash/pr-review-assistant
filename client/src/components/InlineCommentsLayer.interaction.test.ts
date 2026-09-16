// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { editor as MonacoEditor } from 'monaco-editor';
import { InlineCommentsLayer } from './InlineCommentsLayer.js';
import { useStore } from '../state/store.js';
import { prComparison, type PRBundle } from '../../../shared/types.js';

// Vitest 1 can retain Node's native storage accessor instead of jsdom's.
// Use the browser environment's Storage implementation on both runner versions.
vi.hoisted(() => {
  const environment = globalThis as unknown as { jsdom?: { window: Window } };
  if (environment.jsdom) Object.defineProperty(window, 'localStorage', {
    configurable: true, value: environment.jsdom.window.localStorage,
  });
});

const path = 'same.ts';
function bundle(number = 1): PRBundle {
  return { meta: { owner: 'owner', repo: 'repo', number, headSha: 'a'.repeat(40), baseSha: 'b'.repeat(40),
    title: 'Synthetic PR', body: '', author: 'author', state: 'open', isDraft: false,
    reviewDecision: null, url: `https://github.com/owner/repo/pull/${number}` },
    files: [{ path, status: 'modified', additions: 1, deletions: 1, binary: false, noise: null, rawPatch: '', hunks: [] }],
    commitMessages: [] };
}
function response(data: unknown): Response {
  return { ok: true, status: 200, json: async () => data } as Response;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
class FakeSource extends EventTarget { close() {} }

/** Real portals mount into these nodes, as they do in Monaco view zones. */
function fakeEditor(host: HTMLElement) {
  let nextId = 0;
  const zones = new Map<string, HTMLElement>();
  let selectionLine = 1;
  let mouseMove: ((event: { target: { position: { lineNumber: number } } }) => void) | undefined;
  const disposable = () => ({ dispose() {} });
  return {
    addContentWidget(widget: MonacoEditor.IContentWidget) { host.appendChild(widget.getDomNode()); },
    removeContentWidget(widget: MonacoEditor.IContentWidget) { widget.getDomNode().remove(); },
    layoutContentWidget() {},
    onMouseMove(listener: typeof mouseMove) { mouseMove = listener; return disposable(); },
    onMouseLeave: disposable,
    onDidChangeCursorSelection: disposable,
    getSelection: () => ({ startLineNumber: selectionLine, endLineNumber: selectionLine, isEmpty: () => false }),
    getModel: () => ({ getLineCount: () => 30, getLineContent: (line: number) => `source line ${line}` }),
    changeViewZones(callback: (accessor: MonacoEditor.IViewZoneChangeAccessor) => void) {
      callback({
        addZone(zone) { const id = String(++nextId); zones.set(id, zone.domNode); host.appendChild(zone.domNode); return id; },
        removeZone(id) { zones.get(id)?.remove(); zones.delete(id); },
        layoutZone() {},
      });
    },
    selectLine(line: number) { selectionLine = line; mouseMove?.({ target: { position: { lineNumber: line } } }); },
  };
}

let root: Root;
let host: HTMLDivElement;
let editor: ReturnType<typeof fakeEditor>;
let reviewResponse: ReturnType<typeof deferred<Response>>;
let submission: Promise<void>;

function CurrentFile() {
  const current = useStore((s) => s.bundle);
  if (!current) return null;
  const meta = current.meta;
  // The actual DiffViewer has this same PR/comparison/file lifetime boundary.
  return React.createElement(InlineCommentsLayer, {
    key: `${meta.owner}/${meta.repo}#${meta.number}:${meta.headSha}:${path}`,
    editor: editor as unknown as MonacoEditor.ICodeEditor, filePath: path,
  });
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('EventSource', FakeSource);
  window.localStorage.clear();
  reviewResponse = deferred<Response>();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url === '/api/review') return reviewResponse.promise;
    if (url.startsWith('/api/pr?')) return response(bundle(2));
    if (url.startsWith('/api/pr/file')) return response({ oldContent: 'before', newContent: 'after' });
    return response({ threads: [], reviews: [], ranges: [], runs: [] });
  }));
  const current = bundle();
  useStore.setState({ ...useStore.getInitialState(), bundle: current, comparison: prComparison(current) }, true);
  host = document.createElement('div');
  const mount = document.createElement('div');
  document.body.append(host, mount);
  editor = fakeEditor(host);
  root = createRoot(mount);
  await act(async () => {
    useStore.getState().setLineComment(path, 5, 'Submitted comment');
    root.render(React.createElement(React.StrictMode, null, React.createElement(CurrentFile)));
  });
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function button(text: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll('button')).find((node) => node.textContent?.trim() === text);
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
async function click(node: HTMLElement) {
  await act(async () => { node.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function openNew(line: number) {
  await act(async () => {
    editor.selectLine(line);
    host.querySelector('.pra-add-comment-btn')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
}
async function typeDraft(text: string) {
  const textarea = host.querySelector('textarea')!;
  expect(textarea).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, text);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return textarea;
}
async function startSubmission() {
  await act(async () => { submission = useStore.getState().postReview('COMMENT'); });
  expect(useStore.getState().postingReview.status).toBe('posting');
}
async function confirmSubmission() {
  await act(async () => { reviewResponse.resolve(response({ id: 42 })); await submission; });
}

describe('active inline composer during review submission', () => {
  it.each(['new', 'editing'] as const)('preserves unsaved %s text, range and focus when the submitted thread is cleared', async (mode) => {
    await startSubmission();
    const line = mode === 'new' ? 8 : 5;
    if (mode === 'new') await openNew(line);
    else await click(button('Edit'));
    const textarea = await typeDraft('Unsaved text written during submission');
    await click(host.querySelector('[title="Extend start up"]')!);
    await click(host.querySelector('[title="Extend end down"]')!);
    textarea.focus(); textarea.setSelectionRange(2, 7);

    await confirmSubmission();

    expect(useStore.getState().lineComments[path]).toBeUndefined();
    expect(host.querySelector('textarea')).toBe(textarea);
    expect(textarea.value).toBe('Unsaved text written during submission');
    expect(Array.from(host.querySelectorAll('.vz-range-num'), (node) => node.textContent)).toEqual([`R${line - 1}`, `R${line + 1}`]);
    expect(document.activeElement).toBe(textarea);
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([2, 7]);
    await click(button('Save comment'));
    expect(useStore.getState().lineComments[path]).toEqual({
      [line + 1]: { body: 'Unsaved text written during submission', startLine: line - 1 },
    });
  });

  it('does not carry an unsaved composer into another PR or overwrite its new composer with an old response', async () => {
    await startSubmission(); await openNew(8); await typeDraft('Private PR A text');
    await act(async () => { await useStore.getState().loadPR('owner/repo#2'); });
    expect(host.querySelector('textarea')).toBeNull();
    await openNew(8);
    expect(host.querySelector('textarea')!.value).toBe('');
    const textarea = await typeDraft('PR B unsaved text');
    await confirmSubmission();
    expect(host.querySelector('textarea')).toBe(textarea);
    expect(textarea.value).toBe('PR B unsaved text');
    expect(host.textContent).not.toContain('Private PR A text');
    await click(button('Save comment'));
    expect(useStore.getState().bundle!.meta.number).toBe(2);
    expect(useStore.getState().lineComments[path][8].body).toBe('PR B unsaved text');
  });
});

describe('AI findings overlapping a saved human draft', () => {
  it.each([
    { savedStart: 3, aiStart: 5 },
    { savedStart: undefined, aiStart: 3 },
  ])('preserves the saved body and range $savedStart-5 when AI opens $aiStart-5', async ({ savedStart, aiStart }) => {
    await act(async () => {
      const current = useStore.getState().bundle!;
      useStore.setState({ bundle: { ...current, files: [{ ...current.files[0], rawPatch: '@@ -3,0 +3,3 @@\n+third\n+fourth\n+fifth' }] } });
      useStore.getState().setLineComment(path, 5, 'Human draft with deliberate range', savedStart);
      useStore.getState().jumpToSuggestion({ file: path, line: 5, startLine: aiStart, body: 'Different AI prose', title: 'AI finding', severity: 'bug' });
      const reveal = useStore.getState().pendingReveal!;
      expect(reveal).toMatchObject({ path, line: 5, startLine: aiStart, prefill: 'Different AI prose' });
      // DiffViewer consumes this reveal through the real store action after its editor mounts.
      useStore.getState().openComposer(reveal.path, reveal.startLine, reveal.line, reveal.prefill);
      useStore.getState().clearPendingReveal();
    });
    expect(host.querySelector('textarea')!.value).toBe('Human draft with deliberate range');
    expect(Array.from(host.querySelectorAll('.vz-range-num'), (node) => node.textContent)).toEqual([`R${savedStart ?? 5}`, 'R5']);
    await click(button('Save comment'));
    expect(useStore.getState().lineComments[path][5]).toEqual({
      body: 'Human draft with deliberate range', ...(savedStart !== undefined ? { startLine: savedStart } : {}),
    });
  });
});

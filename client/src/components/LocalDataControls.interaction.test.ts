// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LocalDataControls } from './LocalDataControls.js';
import { useStore } from '../state/store.js';
import { usePrivacy } from '../state/privacy.js';
import type { PRBundle } from '../../../shared/types.js';

let host: HTMLDivElement;
let root: Root;
class Source extends EventTarget {
  static all: Source[] = [];
  closed = false;
  constructor(_url: string) { super(); Source.all.push(this); }
  close() { this.closed = true; }
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('EventSource', Source);
  const storage = new Map<string, string>([['pra.aiEnabled', '1']]);
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  } });
  usePrivacy.setState({ aiEnabled: true });
  useStore.setState({ ...useStore.getInitialState(), bundle: {
    meta: { owner: 'synthetic', repo: 'repo', number: 1, headSha: 'head' }, files: [], commitMessages: [],
  } as unknown as PRBundle }, true);
  Source.all = [];
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(React.createElement(LocalDataControls)));
});
afterEach(() => {
  act(() => root.unmount()); host.remove();
  useStore.getState().resetChat();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it.each(['disable', 'clear'])('%s cancels real store chat and streams before navigation or deletion completes', async (action) => {
  let resolveChat!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => { resolveChat = resolve; });
  const fetchMock = vi.fn((url: string) => url.startsWith('/api/ai-chat') ? pending : Promise.resolve({ ok: false } as Response));
  vi.stubGlobal('fetch', fetchMock);
  useStore.getState().selectTab('ai-review');
  const chat = useStore.getState().askChat('Synthetic question');
  const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(init.signal?.aborted).toBe(false);
  if (action === 'disable') {
    // jsdom reports reload as unsupported but the preceding real cancellation executes.
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click());
    error.mockRestore();
    expect(usePrivacy.getState().aiEnabled).toBe(false);
  } else {
    const button = [...host.querySelectorAll('button')].find((node) => node.textContent?.startsWith('Clear drafts'))!;
    await act(async () => { button.click(); });
    expect(host.textContent).toContain('Could not clear the server cache');
  }
  expect(init.signal?.aborted).toBe(true);
  expect(Source.all.every((source) => source.closed)).toBe(true);
  expect(useStore.getState().chat.messages).toEqual([]);
  resolveChat({ ok: false, json: async () => ({ error: 'Late old error' }) } as Response);
  await chat;
  expect(useStore.getState().chat.messages).toEqual([]);
  expect(useStore.getState().chat.status).toBe('idle');
});

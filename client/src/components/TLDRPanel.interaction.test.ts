// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TLDRPanel } from './TLDRPanel.js';
import { useStore } from '../state/store.js';
import { usePrefs } from '../state/preferences.js';
import { usePrivacy } from '../state/privacy.js';
import type { PRBundle } from '../../../shared/types.js';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  usePrivacy.setState({ aiEnabled: true });
  usePrefs.setState({ tldrCollapsed: false });
  useStore.setState({ ...useStore.getInitialState(),
    bundle: { meta: { owner: 'example', repo: 'repo', number: 1, headSha: 'test' }, files: [], commitMessages: [] } as unknown as PRBundle,
    activeTab: 'explain',
    personaResults: { explain: { status: 'done', text: 'A summary.' }, checklist: { status: 'done', text: '[ ] Check the result' } },
    aiReview: { status: 'done', text: '{"verdict":"approve","summary":"No issues found","comments":[]}' },
  }, true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(React.createElement(TLDRPanel)));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});
const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
function press(element: HTMLElement, key: string) {
  act(() => { element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
}

it('exposes a named tablist and associates the active panel with its tab', () => {
  const list = host.querySelector('[role="tablist"]')!;
  expect(list.getAttribute('aria-label')).toBe('Insights');
  const active = tabs()[0];
  const panel = host.querySelector('[role="tabpanel"]')!;
  expect(panel).not.toBeNull();
  expect(active.getAttribute('aria-controls')).toBe(panel.id);
  expect(panel.getAttribute('aria-labelledby')).toBe(active.id);
  expect(panel.textContent).toContain('A summary.');
  expect(tabs().map(tab => tab.tabIndex)).toEqual([0, -1, -1, -1, -1]);
});

it('moves focus with arrow keys without starting another AI tab', () => {
  const [explain, review, ask] = tabs();
  explain.focus();
  press(explain, 'ArrowRight');
  expect(document.activeElement).toBe(review);
  expect(useStore.getState().activeTab).toBe('explain');
  press(review, 'ArrowRight');
  expect(document.activeElement).toBe(ask);
  press(ask, 'ArrowLeft');
  expect(document.activeElement).toBe(review);
  act(() => review.click());
  expect(useStore.getState().activeTab).toBe('ai-review');
  const panel = host.querySelector('[role="tabpanel"]')!;
  expect(panel.textContent).toContain('No findings reported by AI');
  expect(panel.getAttribute('aria-labelledby')).toBe(review.id);
  expect(tabs().map(tab => tab.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
});

it('wraps focus and supports Home and End', () => {
  const all = tabs();
  all[0].focus();
  press(all[0], 'ArrowLeft');
  expect(document.activeElement).toBe(all[4]);
  press(all[4], 'ArrowRight');
  expect(document.activeElement).toBe(all[0]);
  press(all[0], 'End');
  expect(document.activeElement).toBe(all[4]);
  press(all[4], 'Home');
  expect(document.activeElement).toBe(all[0]);
});

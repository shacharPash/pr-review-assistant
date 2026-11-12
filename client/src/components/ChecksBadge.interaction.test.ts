// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChecksBadge } from './ChecksBadge.js';
import { useStore } from '../state/store.js';
import type { CheckRun } from '../../../shared/checks.js';

let host: HTMLDivElement;
let root: Root;
const run = (name: string, link: string): CheckRun => ({
  name, workflow: 'CI', bucket: 'fail', state: 'FAILURE', link, startedAt: null, completedAt: null,
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useStore.setState({ checks: { status: 'ready', runs: [
    run('Hostile', 'javascript:alert(document.domain)'),
    run('Build', 'https://github.com/synthetic/repo/actions/runs/1'),
  ] } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(React.createElement(ChecksBadge)));
});
afterEach(() => {
  act(() => root.unmount()); host.remove();
  useStore.setState(useStore.getInitialState(), true);
  vi.unstubAllGlobals();
});

it('links check rows only to web pages', () => {
  act(() => host.querySelector<HTMLButtonElement>('button.checks-pill')!.click());
  const rows = [...host.querySelectorAll<HTMLAnchorElement>('a.checks-row-name')];
  expect(rows.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
    ['Build', 'https://github.com/synthetic/repo/actions/runs/1'],
    ['Hostile', null],
  ]);
});

import React from 'react';
import { renderToString } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { PRBundle } from '../../../shared/types.js';

vi.mock('../state/store.js', async original => {
  const actual = await original<typeof import('../state/store.js')>();
  return { ...actual, useStore: Object.assign((selector: Function) => selector(actual.useStore.getState()), actual.useStore) };
});
vi.mock('../state/privacy.js', async original => {
  const actual = await original<typeof import('../state/privacy.js')>();
  return { ...actual, usePrivacy: Object.assign((selector: Function) => selector(actual.usePrivacy.getState()), actual.usePrivacy) };
});
import { useStore } from '../state/store.js';
import { usePrivacy } from '../state/privacy.js';
import { SummaryCard } from './SummaryCard.js';
import { ReviewEffort } from './ReviewEffort.js';

beforeEach(() => {
  usePrivacy.setState({ aiEnabled: false });
  useStore.setState({ ...useStore.getInitialState(), bundle: { meta: {}, files: [{ path: 'fixture.ts', additions: 20, deletions: 10, noise: null }], commitMessages: [] } as unknown as PRBundle });
});
it('keeps manual size information visible without implying AI is running', () => {
  expect(renderToString(React.createElement(SummaryCard))).toBe('');
  const effort = renderToString(React.createElement(ReviewEffort));
  expect(effort).toContain('Size only (AI off)');
  expect(effort).toContain('30 lines');
  expect(effort).not.toContain('Estimating');
});
it('renders completed AI summary and effort when enabled', () => {
  usePrivacy.setState({ aiEnabled: true });
  useStore.setState({ headline: { status: 'done', text: 'Fixture summary' }, complexity: { status: 'done', text: 'simple' } });
  expect(renderToString(React.createElement(SummaryCard))).toContain('Fixture summary');
  expect(renderToString(React.createElement(ReviewEffort))).toContain('Quick scan');
});

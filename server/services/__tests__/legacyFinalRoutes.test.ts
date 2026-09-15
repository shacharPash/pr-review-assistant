import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import * as policy from '../claudePolicy.js';
import { setBundle } from '../cache.js';
import { requireAIConsent } from '../../routes/privacy.js';
import { tldrRouter } from '../../routes/tldr.js';
import { headlineRouter } from '../../routes/headline.js';
import { diagramRouter } from '../../routes/diagram.js';
import { beforeAfterRouter } from '../../routes/beforeAfter.js';
import { complexityRouter } from '../../routes/complexity.js';
import { explainRouter } from '../../routes/explain.js';
import type { PRBundle } from '../../../shared/types.js';

let server: ReturnType<ReturnType<typeof express>['listen']>;
let base: string;
let number = 700;
const bundle: PRBundle = {
  meta: { owner: 'synthetic', repo: 'repo', number: 1, headSha: 'head', baseSha: 'base',
    title: 'Synthetic', body: '', author: 'test', state: 'open', isDraft: false, reviewDecision: null, url: '' },
  files: [], commitMessages: [],
};
beforeEach(async () => {
  number++;
  setBundle({ ...bundle, meta: { ...bundle.meta, number } });
  const app = express();
  app.use(requireAIConsent, tldrRouter, headlineRouter, diagramRouter, beforeAfterRouter, complexityRouter, explainRouter);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  vi.restoreAllMocks();
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

it.each(['tldr', 'headline', 'diagram', 'before-after', 'complexity', 'explain'])(
  '%s delivers a non-prefix final result and replays that same authoritative result', async (route) => {
    const interim = route === 'complexity' ? 'simple' : 'Superseded preliminary answer';
    const final = route === 'complexity' ? 'Complex!' : 'Corrected final answer';
    const expected = route === 'complexity' ? 'complex' : final;
    const launch = vi.spyOn(policy, 'launchClaude').mockImplementation((_prompt, events) => {
      queueMicrotask(() => {
        events.onData(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: interim }] } }) + '\n');
        events.onData(JSON.stringify({ type: 'result', result: final }) + '\n');
        events.onClose();
      });
      return () => {};
    });
    const url = `${base}/api/${route}/stream?owner=synthetic&repo=repo&number=${number}&headSha=head&persona=explain&mode=sonnet&aiConsent=1`;
    const first = await (await fetch(url)).text();
    expect(first).toContain(`event: chunk\ndata: ${JSON.stringify(interim)}`);
    const terminal = `event: done\ndata: ${JSON.stringify({ text: expected })}`;
    expect(first).toContain(terminal);
    const replay = await (await fetch(url)).text();
    expect(replay).toContain(`event: chunk\ndata: ${JSON.stringify(expected)}`);
    expect(replay).toContain(terminal);
    expect(launch).toHaveBeenCalledOnce();
    await fetch(url + '&retry=1');
    expect(launch).toHaveBeenCalledTimes(2);
  },
);

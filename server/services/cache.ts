import type { PRBundle } from '../../shared/types.js';

interface Entry {
  bundle: PRBundle;
  tldr?: string;
  headline?: string;
  diagram?: string; // mermaid source, or "NONE"
  beforeAfter?: string; // structured "BEFORE: ... AFTER: ..." or "NONE"
  explanations?: Record<string, string>;
  storedAt: number;
}

const store = new Map<string, Entry>();

function key(owner: string, repo: string, number: number, headSha: string): string {
  return `${owner}/${repo}:${number}:${headSha}`;
}

export function getBundle(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
): PRBundle | undefined {
  return store.get(key(owner, repo, number, headSha))?.bundle;
}

export function setBundle(bundle: PRBundle): void {
  const { owner, repo, number, headSha } = bundle.meta;
  const k = key(owner, repo, number, headSha);
  const existing = store.get(k);
  store.set(k, { bundle, tldr: existing?.tldr, storedAt: Date.now() });
}

export function getTLDR(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
): string | undefined {
  return store.get(key(owner, repo, number, headSha))?.tldr;
}

export function setTLDR(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  tldr: string,
): void {
  const k = key(owner, repo, number, headSha);
  const existing = store.get(k);
  if (!existing) return;
  store.set(k, { ...existing, tldr });
}

export function getHeadline(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
): string | undefined {
  return store.get(key(owner, repo, number, headSha))?.headline;
}

export function setHeadline(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  text: string,
): void {
  const k = key(owner, repo, number, headSha);
  const existing = store.get(k);
  if (!existing) return;
  store.set(k, { ...existing, headline: text });
}

export function getDiagram(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
): string | undefined {
  return store.get(key(owner, repo, number, headSha))?.diagram;
}

export function setDiagram(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  text: string,
): void {
  const k = key(owner, repo, number, headSha);
  const existing = store.get(k);
  if (!existing) return;
  store.set(k, { ...existing, diagram: text });
}

export function getBeforeAfter(
  owner: string, repo: string, number: number, headSha: string,
): string | undefined {
  return store.get(key(owner, repo, number, headSha))?.beforeAfter;
}

export function setBeforeAfter(
  owner: string, repo: string, number: number, headSha: string, text: string,
): void {
  const k = key(owner, repo, number, headSha);
  const existing = store.get(k);
  if (!existing) return;
  store.set(k, { ...existing, beforeAfter: text });
}

export function getExplanation(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  personaId: string,
): string | undefined {
  return store.get(key(owner, repo, number, headSha))?.explanations?.[personaId];
}

export function setExplanation(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  personaId: string,
  text: string,
): void {
  const k = key(owner, repo, number, headSha);
  const existing = store.get(k);
  if (!existing) return;
  const explanations = { ...(existing.explanations ?? {}), [personaId]: text };
  store.set(k, { ...existing, explanations });
}

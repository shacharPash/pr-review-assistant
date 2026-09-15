import { createHash } from 'node:crypto';
import { BoundedCache } from './boundedCache.js';
import type { PRBundle } from '../../shared/types.js';
import type { PRComments } from '../../shared/reviewComments.js';

interface Entry {
  bundle: PRBundle;
  generated?: Record<string, string>;
  tldr?: string;
  aiReview?: Record<string, string>; // raw JSON text of the AI Review result (see shared/aiReview.ts)
  guidelines?: string; // repo convention files, concatenated (or "" when none)
  headline?: string;
  diagram?: string; // mermaid source, or "NONE"
  beforeAfter?: string; // structured "BEFORE: ... AFTER: ..." or "NONE"
  complexity?: string; // one of: simple, moderate, complex, unknown
  explanations?: Record<string, string>;
  reviewComments?: PRComments;
  storedAt: number;
}

const store = new BoundedCache<Entry>();
const cleanup = setInterval(() => store.prune(), 60_000);
cleanup.unref();

export function clearCache(): void { store.clear(); }

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
  store.delete(k);
  store.set(k, { bundle, storedAt: Date.now() });
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

export function getAiReview(
  owner: string, repo: string, number: number, headSha: string, identity: string,
): string | undefined {
  return store.get(key(owner, repo, number, headSha))?.aiReview?.[identity];
}

export function setAiReview(
  owner: string, repo: string, number: number, headSha: string, identity: string, text: string,
): void {
  const k = key(owner, repo, number, headSha);
  const existing = store.get(k);
  if (!existing) return;
  store.set(k, { ...existing, aiReview: { ...existing.aiReview, [identity]: text } });
}

export function getGuidelines(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
): string | undefined {
  return store.get(key(owner, repo, number, headSha))?.guidelines;
}

export function setGuidelines(
  owner: string,
  repo: string,
  number: number,
  headSha: string,
  guidelines: string,
): void {
  const k = key(owner, repo, number, headSha);
  const existing = store.get(k);
  if (!existing) return;
  store.set(k, { ...existing, guidelines });
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

export function getComplexity(
  owner: string, repo: string, number: number, headSha: string,
): string | undefined {
  return store.get(key(owner, repo, number, headSha))?.complexity;
}

export function setComplexity(
  owner: string, repo: string, number: number, headSha: string, text: string,
): void {
  const k = key(owner, repo, number, headSha);
  const existing = store.get(k);
  if (!existing) return;
  store.set(k, { ...existing, complexity: text });
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

export function getReviewComments(
  owner: string, repo: string, number: number, headSha: string,
): PRComments | undefined {
  return store.get(key(owner, repo, number, headSha))?.reviewComments;
}

export function setReviewComments(
  owner: string, repo: string, number: number, headSha: string, comments: PRComments,
): void {
  const k = key(owner, repo, number, headSha);
  const existing = store.get(k);
  if (!existing) return;
  store.set(k, { ...existing, reviewComments: comments });
}

/** Model and prompt versions are part of every generated result's identity. */
export function getGenerated(owner: string, repo: string, number: number, headSha: string, variant: string): string | undefined {
  return store.get(key(owner, repo, number, headSha))?.generated?.[variant];
}

export function setGenerated(owner: string, repo: string, number: number, headSha: string, variant: string, text: string): void {
  const k = key(owner, repo, number, headSha);
  const entry = store.get(k);
  if (entry) store.set(k, { ...entry, generated: { ...entry.generated, [variant]: text } });
}

export function generatedIdentity(bundle: PRBundle, kind: string, model: string | undefined): string {
  return `${kind}:v2:${model ?? 'default'}:${createHash('sha256').update(JSON.stringify(bundle)).digest('hex')}`;
}

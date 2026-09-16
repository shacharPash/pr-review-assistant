import type { PRBundle } from './types.js';

/**
 * AI Review: a focused, high-signal pass over the diff that proposes concrete
 * inline review comments (or declares the PR clean). Distinct from the TL;DR /
 * personas, whose job is to onboard the reviewer rather than review the code.
 *
 * The model emits a single JSON object matching `AIReviewResult`. The server
 * streams the raw text; the client parses it (see AIReviewPane).
 */

export type AISeverity = 'bug' | 'security' | 'correctness' | 'perf' | 'convention';

export interface AIReviewComment {
  /** Path exactly as it appears in the diff (modified side). */
  file: string;
  /** End line on the modified (RIGHT) side , where the comment anchors. */
  line: number;
  /** Optional start of a multi-line range (<= line). */
  startLine?: number;
  anchorWarning?: string;
  severity: AISeverity;
  /** Short chip label, e.g. "Nil deref". */
  title: string;
  /** The comment body pre-filled into the inline composer. */
  body: string;
}

export interface AIReviewResult {
  verdict: 'approve' | 'comment';
  /** One line describing the overall state of the PR. */
  summary: string;
  /** Empty when verdict === 'approve'. */
  comments: AIReviewComment[];
}

const SEVERITIES: readonly AISeverity[] = ['bug', 'security', 'correctness', 'perf', 'convention'];

function isSeverity(v: unknown): v is AISeverity {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v);
}

/**
 * Parse the model's raw text into an `AIReviewResult`, tolerating the common
 * ways an LLM wraps JSON: ```json fences, leading/trailing prose, or a bare
 * object embedded in text. Returns null when nothing usable is found so the
 * caller can show an error/retry rather than crash. Shared between server
 * (validation) and client (rendering) so both agree on what's valid.
 */
export function parseAIReview(raw: string): AIReviewResult | null {
  if (!raw) return null;
  const obj = extractJSONObject(raw);
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  if ('error' in o || (o.verdict !== 'approve' && o.verdict !== 'comment') ||
      typeof o.summary !== 'string' || !Array.isArray(o.comments)) return null;

  const comments: AIReviewComment[] = [];
  for (const c of o.comments) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
    const cc = c as Record<string, unknown>;
    // A missing finding body invalidates the response, never a clean review.
    if (typeof cc.body !== 'string' || !cc.body.trim()) return null;
    const file = typeof cc.file === 'string' ? cc.file : '';
    const line = typeof cc.line === 'number' && Number.isSafeInteger(cc.line) && cc.line > 0 ? cc.line : 0;
    const validStart = cc.startLine === undefined ||
      (typeof cc.startLine === 'number' && Number.isSafeInteger(cc.startLine) && cc.startLine > 0 && cc.startLine <= line);
    comments.push({
      file, line,
      ...(cc.startLine !== undefined && validStart ? { startLine: cc.startLine as number } : {}),
      ...(!file || !line || !validStart ? { anchorWarning: 'The AI supplied an invalid location. Locate this finding manually.' } : {}),
      severity: isSeverity(cc.severity) ? cc.severity : 'correctness',
      title: typeof cc.title === 'string' && cc.title.trim() ? cc.title.trim() : 'Review finding',
      body: cc.body.trim(),
    });
  }
  return { verdict: comments.length ? 'comment' : o.verdict, summary: o.summary.trim(), comments };

}

/** Pull the first balanced top-level JSON object out of a string. */
function extractJSONObject(raw: string): unknown {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // Fast path: the whole thing is JSON.
  try {
    return JSON.parse(text);
  } catch {
    /* fall through to bracket scan */
  }
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const slice = text.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Retain every finding. Only exact added lines support one-click staging. */
export function resolveAIReviewComment(bundle: PRBundle, comment: AIReviewComment): AIReviewComment {
  if (comment.anchorWarning) return comment;
  const file = bundle.files.find((f) => f.path === comment.file);
  const added = new Set<number>();
  if (file && !file.binary && !file.noise) {
    let line: number | undefined;
    for (const row of file.rawPatch.split('\n')) {
      const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(row);
      if (header) { line = Number(header[1]); continue; }
      if (line === undefined) continue;
      if (row.startsWith('+')) { added.add(line); line++; }
      else if (row.startsWith(' ')) line++;
    }
  }
  const start = comment.startLine ?? comment.line;
  // Avoid iterating over model-controlled huge ranges.
  if (comment.line - start <= added.size && added.has(comment.line) &&
      Array.from({ length: comment.line - start + 1 }, (_, i) => start + i).every((n) => added.has(n))) return comment;
  return { ...comment, anchorWarning: 'Location is outside the added lines in this PR. Locate this finding manually.' };
}

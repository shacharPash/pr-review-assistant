import { create } from 'zustand';
import type { PRBundle, DiffFile, TLDR, BlameRange } from '@shared/types';
import type { PersonaId } from '@shared/personas';

export interface FullFileContent {
  status: 'loading' | 'ready' | 'error';
  oldContent: string | null;
  newContent: string | null;
  error?: string;
}

export interface BlameEntry {
  status: 'loading' | 'ready' | 'error';
  ranges: BlameRange[];
  error?: string;
}

export interface LineComment {
  body: string;
  /** When set and != line, the comment covers lines startLine..line on the modified side. */
  startLine?: number;
}

export type TLDRTab = 'brief' | PersonaId;

interface State {
  bundle: PRBundle | null;
  activeFilePath: string | null;
  loading: boolean;
  error: { message: string; detail?: string } | null;
  showNoise: boolean;
  tldr: TLDR;
  headline: TLDR;
  diagram: TLDR;
  beforeAfter: TLDR;
  complexity: TLDR;
  fullContent: Record<string, FullFileContent>;
  blame: Record<string, BlameEntry>;
  activeTab: TLDRTab;
  personaResults: Partial<Record<PersonaId, TLDR>>;
  reviewed: Record<string, boolean>;
  comments: Record<string, string>;
  /**
   * Per-file inline comments keyed by end-line number (modified-side / RIGHT).
   * `startLine` is set when the comment covers a multi-line range.
   */
  lineComments: Record<string, Record<number, LineComment>>;
  /** Currently-focused range for the inline composer; null when closed. */
  composerTarget: { path: string; line: number; startLine: number } | null;
  reviewSummary: string;
  postingReview: { status: 'idle' | 'posting' | 'done' | 'error'; message?: string; url?: string };
  loadPR: (ref: string) => Promise<void>;
  selectFile: (path: string) => void;
  toggleNoise: () => void;
  startTLDR: () => void;
  retryTLDR: () => void;
  fetchFullContent: (path: string) => Promise<void>;
  fetchBlame: (path: string) => Promise<void>;
  selectTab: (tab: TLDRTab) => void;
  retryPersona: (id: PersonaId) => void;
  toggleReviewed: (path: string) => void;
  setComment: (path: string, body: string) => void;
  setLineComment: (path: string, line: number, body: string, startLine?: number) => void;
  removeLineComment: (path: string, line: number) => void;
  openComposer: (path: string, startLine: number, endLine: number) => void;
  closeComposer: () => void;
  setReviewSummary: (text: string) => void;
  postReview: (event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT') => Promise<void>;
}

const emptyTLDR: TLDR = { text: '', status: 'idle' };

let tldrEventSource: EventSource | null = null;
let headlineEventSource: EventSource | null = null;
let diagramEventSource: EventSource | null = null;
let beforeAfterEventSource: EventSource | null = null;
let complexityEventSource: EventSource | null = null;
const personaEventSources = new Map<PersonaId, EventSource>();

function reviewedStorageKey(headSha: string): string {
  return `pra.reviewed:${headSha}`;
}
function commentsStorageKey(headSha: string): string {
  return `pra.comments:${headSha}`;
}
function lineCommentsStorageKey(headSha: string): string {
  return `pra.lineComments:${headSha}`;
}
function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota — ignore */
  }
}

function openComplexityStream(bundle: PRBundle, set: (partial: Partial<State>) => void) {
  if (complexityEventSource) {
    complexityEventSource.close();
    complexityEventSource = null;
  }
  const url = `/api/complexity/stream?owner=${encodeURIComponent(bundle.meta.owner)}` +
    `&repo=${encodeURIComponent(bundle.meta.repo)}` +
    `&number=${bundle.meta.number}` +
    `&headSha=${bundle.meta.headSha}`;
  const es = new EventSource(url);
  complexityEventSource = es;
  set({ complexity: { text: '', status: 'streaming' } });
  let acc = '';
  const decode = (raw: string): string => {
    try { return JSON.parse(raw) as string; } catch { return raw; }
  };
  es.addEventListener('chunk', (e: MessageEvent) => {
    acc += decode(e.data);
    set({ complexity: { text: acc, status: 'streaming' } });
  });
  es.addEventListener('done', () => {
    set({ complexity: { text: acc.trim().toLowerCase(), status: 'done' } });
    es.close();
    complexityEventSource = null;
  });
  es.addEventListener('error', (e: MessageEvent) => {
    const msg = e?.data ? decode(e.data) : 'Complexity classification failed.';
    set({ complexity: { text: acc, status: 'error', error: msg } });
    es.close();
    complexityEventSource = null;
  });
}

function openBeforeAfterStream(bundle: PRBundle, set: (partial: Partial<State>) => void) {
  if (beforeAfterEventSource) {
    beforeAfterEventSource.close();
    beforeAfterEventSource = null;
  }
  const url = `/api/before-after/stream?owner=${encodeURIComponent(bundle.meta.owner)}` +
    `&repo=${encodeURIComponent(bundle.meta.repo)}` +
    `&number=${bundle.meta.number}` +
    `&headSha=${bundle.meta.headSha}`;
  const es = new EventSource(url);
  beforeAfterEventSource = es;
  set({ beforeAfter: { text: '', status: 'streaming' } });
  let acc = '';
  const decode = (raw: string): string => {
    try { return JSON.parse(raw) as string; } catch { return raw; }
  };
  es.addEventListener('chunk', (e: MessageEvent) => {
    acc += decode(e.data);
    set({ beforeAfter: { text: acc, status: 'streaming' } });
  });
  es.addEventListener('done', () => {
    set({ beforeAfter: { text: acc.trim(), status: 'done' } });
    es.close();
    beforeAfterEventSource = null;
  });
  es.addEventListener('error', (e: MessageEvent) => {
    const msg = e?.data ? decode(e.data) : 'Before/After failed.';
    set({ beforeAfter: { text: acc, status: 'error', error: msg } });
    es.close();
    beforeAfterEventSource = null;
  });
}

function openDiagramStream(bundle: PRBundle, set: (partial: Partial<State>) => void) {
  if (diagramEventSource) {
    diagramEventSource.close();
    diagramEventSource = null;
  }
  const url = `/api/diagram/stream?owner=${encodeURIComponent(bundle.meta.owner)}` +
    `&repo=${encodeURIComponent(bundle.meta.repo)}` +
    `&number=${bundle.meta.number}` +
    `&headSha=${bundle.meta.headSha}`;
  const es = new EventSource(url);
  diagramEventSource = es;
  set({ diagram: { text: '', status: 'streaming' } });
  let acc = '';
  const decode = (raw: string): string => {
    try { return JSON.parse(raw) as string; } catch { return raw; }
  };
  es.addEventListener('chunk', (e: MessageEvent) => {
    acc += decode(e.data);
    set({ diagram: { text: acc, status: 'streaming' } });
  });
  es.addEventListener('done', () => {
    set({ diagram: { text: acc.trim(), status: 'done' } });
    es.close();
    diagramEventSource = null;
  });
  es.addEventListener('error', (e: MessageEvent) => {
    const msg = e?.data ? decode(e.data) : 'Diagram failed.';
    set({ diagram: { text: acc, status: 'error', error: msg } });
    es.close();
    diagramEventSource = null;
  });
}

function openHeadlineStream(bundle: PRBundle, set: (partial: Partial<State>) => void) {
  if (headlineEventSource) {
    headlineEventSource.close();
    headlineEventSource = null;
  }
  const url = `/api/headline/stream?owner=${encodeURIComponent(bundle.meta.owner)}` +
    `&repo=${encodeURIComponent(bundle.meta.repo)}` +
    `&number=${bundle.meta.number}` +
    `&headSha=${bundle.meta.headSha}`;
  const es = new EventSource(url);
  headlineEventSource = es;
  set({ headline: { text: '', status: 'streaming' } });
  let acc = '';

  const decode = (raw: string): string => {
    try { return JSON.parse(raw) as string; } catch { return raw; }
  };

  es.addEventListener('chunk', (e: MessageEvent) => {
    acc += decode(e.data);
    set({ headline: { text: acc, status: 'streaming' } });
  });
  es.addEventListener('done', () => {
    set({ headline: { text: acc.trim(), status: 'done' } });
    es.close();
    headlineEventSource = null;
  });
  es.addEventListener('error', (e: MessageEvent) => {
    const msg = e?.data ? decode(e.data) : 'Headline failed.';
    set({ headline: { text: acc, status: 'error', error: msg } });
    es.close();
    headlineEventSource = null;
  });
}

function openTLDRStream(bundle: PRBundle, set: (partial: Partial<State>) => void) {
  if (tldrEventSource) {
    tldrEventSource.close();
    tldrEventSource = null;
  }
  const url = `/api/tldr/stream?owner=${encodeURIComponent(bundle.meta.owner)}` +
    `&repo=${encodeURIComponent(bundle.meta.repo)}` +
    `&number=${bundle.meta.number}` +
    `&headSha=${bundle.meta.headSha}`;
  const es = new EventSource(url);
  tldrEventSource = es;
  set({ tldr: { text: '', status: 'streaming' } });
  let acc = '';

  const decode = (raw: string): string => {
    try { return JSON.parse(raw) as string; } catch { return raw; }
  };

  es.addEventListener('chunk', (e: MessageEvent) => {
    acc += decode(e.data);
    set({ tldr: { text: acc, status: 'streaming' } });
  });
  es.addEventListener('done', () => {
    set({ tldr: { text: acc, status: 'done' } });
    es.close();
    tldrEventSource = null;
  });
  es.addEventListener('error', (e: MessageEvent) => {
    // EventSource fires plain 'error' for network drops (no e.data). Custom
    // 'error' SSE events arrive here too with a decodable payload.
    const msg = e?.data ? decode(e.data) : 'TL;DR stream failed.';
    set({ tldr: { text: acc, status: 'error', error: msg } });
    es.close();
    tldrEventSource = null;
  });
}

export const useStore = create<State>((set, get) => ({
  bundle: null,
  activeFilePath: null,
  loading: false,
  error: null,
  showNoise: false,
  tldr: emptyTLDR,
  headline: emptyTLDR,
  diagram: emptyTLDR,
  beforeAfter: emptyTLDR,
  complexity: emptyTLDR,
  fullContent: {},
  blame: {},
  reviewed: {},
  comments: {},
  lineComments: {},
  composerTarget: null,
  reviewSummary: '',
  postingReview: { status: 'idle' },

  async loadPR(ref) {
    set({
      loading: true,
      error: null,
      tldr: emptyTLDR,
      headline: emptyTLDR,
      diagram: emptyTLDR,
      beforeAfter: emptyTLDR,
      complexity: emptyTLDR,
      fullContent: {},
      blame: {},
      reviewed: {},
      comments: {},
      postingReview: { status: 'idle' },
      personaResults: {},
      activeTab: 'brief',
    });
    try {
      const res = await fetch(`/api/pr?ref=${encodeURIComponent(ref)}`);
      const data = await res.json();
      if (!res.ok) {
        set({ loading: false, error: { message: data.error ?? 'Failed', detail: data.detail } });
        return;
      }
      const bundle = data as PRBundle;
      const firstVisible = bundle.files.find((f) => !f.noise) ?? bundle.files[0];
      // Restore reviewed + comments scoped to this headSha (resets if PR has new commits).
      const reviewed = readJSON<Record<string, boolean>>(reviewedStorageKey(bundle.meta.headSha), {});
      const comments = readJSON<Record<string, string>>(commentsStorageKey(bundle.meta.headSha), {});
      const lineComments = readJSON<Record<string, Record<number, LineComment>>>(
        lineCommentsStorageKey(bundle.meta.headSha),
        {},
      );
      set({
        bundle,
        activeFilePath: firstVisible?.path ?? null,
        loading: false,
        reviewed,
        comments,
        lineComments,
      });
      openTLDRStream(bundle, set);
      openHeadlineStream(bundle, set);
      openDiagramStream(bundle, set);
      openBeforeAfterStream(bundle, set);
      openComplexityStream(bundle, set);
      if (firstVisible) {
        get().fetchFullContent(firstVisible.path);
        get().fetchBlame(firstVisible.path);
      }
    } catch (err) {
      set({ loading: false, error: { message: (err as Error).message } });
    }
  },

  selectFile(path) {
    set({ activeFilePath: path });
    if (!get().fullContent[path]) get().fetchFullContent(path);
    if (!get().blame[path]) get().fetchBlame(path);
  },

  async fetchBlame(path) {
    const { bundle, blame } = get();
    if (!bundle) return;
    if (blame[path]?.status === 'ready' || blame[path]?.status === 'loading') return;
    set({ blame: { ...get().blame, [path]: { status: 'loading', ranges: [] } } });
    try {
      const url = `/api/blame?owner=${encodeURIComponent(bundle.meta.owner)}` +
        `&repo=${encodeURIComponent(bundle.meta.repo)}` +
        `&number=${bundle.meta.number}` +
        `&headSha=${bundle.meta.headSha}` +
        `&path=${encodeURIComponent(path)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        set({ blame: { ...get().blame, [path]: { status: 'error', ranges: [], error: data.error } } });
        return;
      }
      set({ blame: { ...get().blame, [path]: { status: 'ready', ranges: data.ranges ?? [] } } });
    } catch (err) {
      set({ blame: { ...get().blame, [path]: { status: 'error', ranges: [], error: (err as Error).message } } });
    }
  },

  async fetchFullContent(path) {
    const { bundle, fullContent } = get();
    if (!bundle) return;
    if (fullContent[path]?.status === 'ready' || fullContent[path]?.status === 'loading') return;

    set({
      fullContent: {
        ...get().fullContent,
        [path]: { status: 'loading', oldContent: null, newContent: null },
      },
    });

    try {
      const url = `/api/pr/file?owner=${encodeURIComponent(bundle.meta.owner)}` +
        `&repo=${encodeURIComponent(bundle.meta.repo)}` +
        `&number=${bundle.meta.number}` +
        `&headSha=${bundle.meta.headSha}` +
        `&path=${encodeURIComponent(path)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        set({
          fullContent: {
            ...get().fullContent,
            [path]: { status: 'error', oldContent: null, newContent: null, error: data.error },
          },
        });
        return;
      }
      set({
        fullContent: {
          ...get().fullContent,
          [path]: { status: 'ready', oldContent: data.oldContent, newContent: data.newContent },
        },
      });
    } catch (err) {
      set({
        fullContent: {
          ...get().fullContent,
          [path]: { status: 'error', oldContent: null, newContent: null, error: (err as Error).message },
        },
      });
    }
  },

  toggleNoise() {
    set({ showNoise: !get().showNoise });
  },

  startTLDR() {
    const b = get().bundle;
    if (b) openTLDRStream(b, set);
  },

  retryTLDR() {
    const b = get().bundle;
    if (b) openTLDRStream(b, set);
  },

  activeTab: 'brief',
  personaResults: {},

  selectTab(tab) {
    set({ activeTab: tab });
    if (tab === 'brief') return;
    const existing = get().personaResults[tab];
    if (existing && (existing.status === 'streaming' || existing.status === 'done')) return;
    const bundle = get().bundle;
    if (!bundle) return;
    openPersonaStream(bundle, tab, set, get);
  },

  retryPersona(id) {
    const bundle = get().bundle;
    if (!bundle) return;
    openPersonaStream(bundle, id, set, get);
  },

  toggleReviewed(path) {
    const { bundle, reviewed } = get();
    if (!bundle) return;
    const next = { ...reviewed, [path]: !reviewed[path] };
    if (!next[path]) delete next[path];
    set({ reviewed: next });
    writeJSON(reviewedStorageKey(bundle.meta.headSha), next);
  },

  setComment(path, body) {
    const { bundle, comments } = get();
    if (!bundle) return;
    const next = { ...comments };
    if (body.trim()) next[path] = body;
    else delete next[path];
    set({ comments: next });
    writeJSON(commentsStorageKey(bundle.meta.headSha), next);
  },

  setLineComment(path, line, body, startLine) {
    const { bundle } = get();
    if (!bundle) return;
    const lineComments = { ...get().lineComments };
    const forFile = { ...(lineComments[path] ?? {}) };
    if (body.trim()) {
      forFile[line] = {
        body,
        ...(startLine && startLine !== line ? { startLine } : {}),
      };
    } else {
      delete forFile[line];
    }
    if (Object.keys(forFile).length === 0) delete lineComments[path];
    else lineComments[path] = forFile;
    set({ lineComments });
    writeJSON(lineCommentsStorageKey(bundle.meta.headSha), lineComments);
  },

  removeLineComment(path, line) {
    get().setLineComment(path, line, '');
  },

  openComposer(path, startLine, endLine) {
    set({
      composerTarget: {
        path,
        line: endLine,
        startLine,
      },
    });
  },

  closeComposer() {
    set({ composerTarget: null });
  },

  setReviewSummary(text) {
    set({ reviewSummary: text });
  },

  async postReview(event) {
    const { bundle, comments, lineComments, reviewSummary } = get();
    if (!bundle) return;

    // Build inline comments list from lineComments map.
    const inline: {
      path: string; line: number; body: string; side: 'RIGHT'; startLine?: number;
    }[] = [];
    for (const [path, perLine] of Object.entries(lineComments)) {
      for (const [lineStr, entry] of Object.entries(perLine)) {
        if (entry?.body?.trim()) {
          inline.push({
            path,
            line: Number(lineStr),
            body: entry.body,
            side: 'RIGHT',
            ...(entry.startLine ? { startLine: entry.startLine } : {}),
          });
        }
      }
    }
    // Also fold per-file general comments into a single summary block, for backwards compat.
    const fileNotes = Object.entries(comments)
      .filter(([, v]) => v.trim())
      .map(([path, body]) => `**\`${path}\`**\n${body.trim()}`)
      .join('\n\n');
    const summary = [reviewSummary.trim(), fileNotes].filter(Boolean).join('\n\n');

    if (inline.length === 0 && !summary && event === 'COMMENT') {
      set({ postingReview: { status: 'error', message: 'Write something or add a comment first.' } });
      return;
    }

    set({ postingReview: { status: 'posting' } });
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: bundle.meta.owner,
          repo: bundle.meta.repo,
          number: bundle.meta.number,
          headSha: bundle.meta.headSha,
          event,
          summary,
          inlineComments: inline,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        set({
          postingReview: { status: 'error', message: data.error ?? 'Failed to post.', url: undefined },
        });
        return;
      }
      set({
        postingReview: { status: 'done', message: 'Posted.', url: data.url },
      });
    } catch (err) {
      set({ postingReview: { status: 'error', message: (err as Error).message } });
    }
  },
}));

function openPersonaStream(
  bundle: PRBundle,
  id: PersonaId,
  set: (partial: Partial<State>) => void,
  get: () => State,
) {
  const existing = personaEventSources.get(id);
  if (existing) {
    existing.close();
    personaEventSources.delete(id);
  }

  const url = `/api/explain/stream?owner=${encodeURIComponent(bundle.meta.owner)}` +
    `&repo=${encodeURIComponent(bundle.meta.repo)}` +
    `&number=${bundle.meta.number}` +
    `&headSha=${bundle.meta.headSha}` +
    `&persona=${encodeURIComponent(id)}`;
  const es = new EventSource(url);
  personaEventSources.set(id, es);
  set({ personaResults: { ...get().personaResults, [id]: { text: '', status: 'streaming' } } });
  let acc = '';

  const decode = (raw: string): string => {
    try { return JSON.parse(raw) as string; } catch { return raw; }
  };

  es.addEventListener('chunk', (e: MessageEvent) => {
    acc += decode(e.data);
    set({ personaResults: { ...get().personaResults, [id]: { text: acc, status: 'streaming' } } });
  });
  es.addEventListener('done', () => {
    set({ personaResults: { ...get().personaResults, [id]: { text: acc, status: 'done' } } });
    es.close();
    personaEventSources.delete(id);
  });
  es.addEventListener('error', (e: MessageEvent) => {
    const msg = e?.data ? decode(e.data) : 'Explanation failed.';
    set({
      personaResults: {
        ...get().personaResults,
        [id]: { text: acc, status: 'error', error: msg },
      },
    });
    es.close();
    personaEventSources.delete(id);
  });
}

/**
 * Derives Monaco-ready content + line-number maps. Each map array is indexed
 * by (monacoLine - 1) and gives the real file line for that row, or 0 for
 * separator rows (which we render as blank in the gutter).
 */
export function fileContentFor(file: DiffFile, includeNoise: boolean): {
  oldContent: string;
  newContent: string;
  oldLineMap: number[];
  newLineMap: number[];
} {
  const hunks = includeNoise ? file.hunks : file.hunks.filter((h) => !h.noise);

  const oldParts: string[] = [];
  const newParts: string[] = [];
  const oldMap: number[] = [];
  const newMap: number[] = [];

  hunks.forEach((h, idx) => {
    if (idx > 0) {
      // Blank separator row in both sides.
      oldParts.push('');
      newParts.push('');
      oldMap.push(0);
      newMap.push(0);
    }
    const oldLines = h.oldContent.split('\n');
    const newLines = h.newContent.split('\n');
    oldLines.forEach((line, i) => {
      oldParts.push(line);
      oldMap.push(h.oldStart + i);
    });
    newLines.forEach((line, i) => {
      newParts.push(line);
      newMap.push(h.newStart + i);
    });
  });

  return {
    oldContent: oldParts.join('\n'),
    newContent: newParts.join('\n'),
    oldLineMap: oldMap,
    newLineMap: newMap,
  };
}

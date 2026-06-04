import { create } from 'zustand';

export type Theme = 'github' | 'intellij' | 'vscode';
export type ViewMode = 'split' | 'unified';
/**
 * Reviewer's quality/speed tier for AI features. The server maps this to
 * a per-route model so we don't waste Opus on one-word outputs.
 *
 * - `fast`  — Sonnet everywhere. Cheap, snappy, fine for routine PRs.
 * - `smart` — Opus on the routes where reasoning matters (TL;DR + diagram);
 *             Sonnet on short outputs (headline / before-after / complexity /
 *             persona tabs) because Opus adds no quality there.
 *
 * This deliberately replaces the older 'auto' option, whose meaning silently
 * depended on each user's `claude` CLI config and produced inconsistent token
 * bills across teammates.
 */
export type ModelPreference = 'fast' | 'smart';

interface Preferences {
  theme: Theme;
  viewMode: ViewMode;
  tldrCollapsed: boolean;
  /** Height of the TLDR panel in pixels (within the left rail). */
  tldrHeight: number;
  /** Width of the left rail in pixels. */
  railWidth: number;
  /** Height of the Summary card in pixels. */
  summaryHeight: number;
  /** Suppress all reviewer/bot inline comments in the diff. */
  hideReviewerComments: boolean;
  /** Blame gutter width in CHARACTERS (only used when blame is visible). */
  blameWidth: number;
  /** Which Claude model to use for AI features. */
  modelPreference: ModelPreference;
  setTheme: (t: Theme) => void;
  setViewMode: (m: ViewMode) => void;
  toggleTLDR: () => void;
  setTLDRHeight: (px: number) => void;
  setRailWidth: (px: number) => void;
  setSummaryHeight: (px: number) => void;
  toggleHideReviewerComments: () => void;
  setBlameWidth: (chars: number) => void;
  setModelPreference: (m: ModelPreference) => void;
}

const BLAME_WIDTH_KEY = 'pra.blameWidth';
const BLAME_WIDTH_MIN = 10;
const BLAME_WIDTH_MAX = 50;
// 29 = date(10) + 2 sep + author(11) + 2 sep + 4 line# — fits common names
// (ShaharPash, mariaKull, matan-meshi, shacharPash) without leaving the
// awkward gap that the 32-default with author(14) created. Drag wider to
// fit longer logins; double-click the handle to snap back to default.
const BLAME_WIDTH_DEFAULT = 29;

const RAIL_WIDTH_KEY = 'pra.railWidth';
const RAIL_WIDTH_MIN = 280;
const RAIL_WIDTH_MAX = 800;
const RAIL_WIDTH_DEFAULT = 420;

const SUMMARY_HEIGHT_KEY = 'pra.summaryHeight';
const SUMMARY_HEIGHT_MIN = 60;
const SUMMARY_HEIGHT_MAX = 600;
const SUMMARY_HEIGHT_DEFAULT = 150;

const TLDR_HEIGHT_KEY = 'pra.tldrHeight';
const TLDR_HEIGHT_MIN = 100;
const TLDR_HEIGHT_MAX = 700;
const TLDR_HEIGHT_DEFAULT = 360;

const THEME_KEY = 'pra.theme';
const MODE_KEY = 'pra.viewMode';
const TLDR_KEY = 'pra.tldrCollapsed';
const HIDE_REVIEWER_KEY = 'pra.hideReviewerComments';
const MODEL_PREF_KEY = 'pra.modelPreference';

function readLS<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(key);
  return (allowed as readonly string[]).includes(v ?? '') ? (v as T) : fallback;
}

export const usePrefs = create<Preferences>((set, get) => ({
  theme: readLS<Theme>(THEME_KEY, 'github', ['github', 'intellij', 'vscode'] as const),
  viewMode: readLS<ViewMode>(MODE_KEY, 'split', ['split', 'unified'] as const),
  tldrCollapsed: typeof window !== 'undefined'
    ? window.localStorage.getItem(TLDR_KEY) === '1'
    : false,
  tldrHeight: (() => {
    if (typeof window === 'undefined') return TLDR_HEIGHT_DEFAULT;
    const raw = window.localStorage.getItem(TLDR_HEIGHT_KEY);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return TLDR_HEIGHT_DEFAULT;
    return Math.max(TLDR_HEIGHT_MIN, Math.min(TLDR_HEIGHT_MAX, n));
  })(),
  railWidth: (() => {
    if (typeof window === 'undefined') return RAIL_WIDTH_DEFAULT;
    const raw = window.localStorage.getItem(RAIL_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return RAIL_WIDTH_DEFAULT;
    return Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, n));
  })(),
  hideReviewerComments: typeof window !== 'undefined'
    ? window.localStorage.getItem(HIDE_REVIEWER_KEY) === '1'
    : false,
  modelPreference: (() => {
    if (typeof window === 'undefined') return 'smart' as ModelPreference;
    const raw = window.localStorage.getItem(MODEL_PREF_KEY);
    // Migrate the prior 3-pill values:
    //   auto / opus  → smart  (closest to what they were getting)
    //   sonnet       → fast
    // Anything else (or nothing) defaults to 'smart' so new users see the
    // tool's strongest reasoning on TL;DR + diagram out of the box.
    if (raw === 'fast' || raw === 'sonnet') return 'fast';
    return 'smart';
  })(),
  blameWidth: (() => {
    if (typeof window === 'undefined') return BLAME_WIDTH_DEFAULT;
    const raw = window.localStorage.getItem(BLAME_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return BLAME_WIDTH_DEFAULT;
    return Math.max(BLAME_WIDTH_MIN, Math.min(BLAME_WIDTH_MAX, n));
  })(),
  summaryHeight: (() => {
    if (typeof window === 'undefined') return SUMMARY_HEIGHT_DEFAULT;
    const raw = window.localStorage.getItem(SUMMARY_HEIGHT_KEY);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return SUMMARY_HEIGHT_DEFAULT;
    return Math.max(SUMMARY_HEIGHT_MIN, Math.min(SUMMARY_HEIGHT_MAX, n));
  })(),

  setTheme(t) {
    set({ theme: t });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_KEY, t);
      document.body.dataset.theme = t;
    }
  },

  setViewMode(m) {
    set({ viewMode: m });
    if (typeof window !== 'undefined') window.localStorage.setItem(MODE_KEY, m);
  },

  toggleTLDR() {
    const next = !get().tldrCollapsed;
    set({ tldrCollapsed: next });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TLDR_KEY, next ? '1' : '0');
    }
  },

  setTLDRHeight(px) {
    const clamped = Math.max(TLDR_HEIGHT_MIN, Math.min(TLDR_HEIGHT_MAX, Math.round(px)));
    set({ tldrHeight: clamped });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TLDR_HEIGHT_KEY, String(clamped));
    }
  },

  setRailWidth(px) {
    const clamped = Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, Math.round(px)));
    set({ railWidth: clamped });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RAIL_WIDTH_KEY, String(clamped));
    }
  },

  setSummaryHeight(px) {
    const clamped = Math.max(SUMMARY_HEIGHT_MIN, Math.min(SUMMARY_HEIGHT_MAX, Math.round(px)));
    set({ summaryHeight: clamped });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SUMMARY_HEIGHT_KEY, String(clamped));
    }
  },

  toggleHideReviewerComments() {
    const next = !get().hideReviewerComments;
    set({ hideReviewerComments: next });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HIDE_REVIEWER_KEY, next ? '1' : '0');
    }
  },

  setBlameWidth(chars) {
    const clamped = Math.max(BLAME_WIDTH_MIN, Math.min(BLAME_WIDTH_MAX, Math.round(chars)));
    set({ blameWidth: clamped });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BLAME_WIDTH_KEY, String(clamped));
    }
  },

  setModelPreference(m) {
    set({ modelPreference: m });
    if (typeof window !== 'undefined') window.localStorage.setItem(MODEL_PREF_KEY, m);
  },
}));

/** Map our theme to the Monaco theme name. Registered in main.tsx. */
export function monacoThemeFor(theme: Theme): string {
  switch (theme) {
    case 'intellij': return 'darcula-custom';
    case 'vscode': return 'vscode-dark-plus-custom';
    case 'github':
    default: return 'github-dark-custom';
  }
}

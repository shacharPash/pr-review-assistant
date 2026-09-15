import { create } from 'zustand';

export type Theme = 'github' | 'intellij' | 'vscode';
export type ViewMode = 'split' | 'unified';
/**
 * The Claude model used for every AI feature. The reviewer picks the
 * quality/speed/cost trade-off explicitly, once, and it applies globally
 * (TL;DR, AI Review, Ask, personas, etc.).
 *
 * - `opus`   — strongest reasoning; slowest and priciest.
 * - `sonnet` — balanced default; good quality, much snappier than Opus.
 * - `haiku`  — fastest and cheapest; great for quick questions / routine PRs.
 */
export type ModelPreference = 'opus' | 'sonnet' | 'haiku';

interface Preferences {
  theme: Theme;
  viewMode: ViewMode;
  /** Each left-rail section can be collapsed to a slim header so the reviewer
   * can focus (e.g. hide Summary + Insights to scan files + code). */
  tldrCollapsed: boolean;
  summaryCollapsed: boolean;
  filesCollapsed: boolean;
  /** Width of the left rail in pixels. */
  railWidth: number;
  /** Suppress all reviewer/bot inline comments in the diff. */
  hideReviewerComments: boolean;
  /** Blame gutter width in CHARACTERS (only used when blame is visible). */
  blameWidth: number;
  /** Which Claude model to use for AI features. */
  modelPreference: ModelPreference;
  setTheme: (t: Theme) => void;
  setViewMode: (m: ViewMode) => void;
  toggleTLDR: () => void;
  toggleSummary: () => void;
  toggleFiles: () => void;
  setRailWidth: (px: number) => void;
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

const THEME_KEY = 'pra.theme';
const MODE_KEY = 'pra.viewMode';
const TLDR_KEY = 'pra.tldrCollapsed';
const SUMMARY_COLLAPSED_KEY = 'pra.summaryCollapsed';
const FILES_COLLAPSED_KEY = 'pra.filesCollapsed';
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
  summaryCollapsed: typeof window !== 'undefined'
    ? window.localStorage.getItem(SUMMARY_COLLAPSED_KEY) === '1'
    : false,
  filesCollapsed: typeof window !== 'undefined'
    ? window.localStorage.getItem(FILES_COLLAPSED_KEY) === '1'
    : false,
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
    if (typeof window === 'undefined') return 'sonnet' as ModelPreference;
    const raw = window.localStorage.getItem(MODEL_PREF_KEY);
    if (raw === 'opus' || raw === 'sonnet' || raw === 'haiku') return raw;
    // Migrate the prior Fast/Smart tiers to an explicit model:
    //   smart → opus (it used Opus on the heavy routes)
    //   fast  → sonnet
    if (raw === 'smart') return 'opus';
    if (raw === 'fast') return 'sonnet';
    // New users: Sonnet — the balanced default (good quality, far snappier
    // than Opus, avoids surprise-slow first runs).
    return 'sonnet';
  })(),
  blameWidth: (() => {
    if (typeof window === 'undefined') return BLAME_WIDTH_DEFAULT;
    const raw = window.localStorage.getItem(BLAME_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return BLAME_WIDTH_DEFAULT;
    return Math.max(BLAME_WIDTH_MIN, Math.min(BLAME_WIDTH_MAX, n));
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

  toggleSummary() {
    const next = !get().summaryCollapsed;
    set({ summaryCollapsed: next });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SUMMARY_COLLAPSED_KEY, next ? '1' : '0');
    }
  },

  toggleFiles() {
    const next = !get().filesCollapsed;
    set({ filesCollapsed: next });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FILES_COLLAPSED_KEY, next ? '1' : '0');
    }
  },

  setRailWidth(px) {
    const clamped = Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, Math.round(px)));
    set({ railWidth: clamped });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RAIL_WIDTH_KEY, String(clamped));
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

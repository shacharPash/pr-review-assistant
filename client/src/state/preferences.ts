import { create } from 'zustand';

export type Theme = 'github' | 'intellij' | 'vscode';
export type ViewMode = 'split' | 'unified';

interface Preferences {
  theme: Theme;
  viewMode: ViewMode;
  tldrCollapsed: boolean;
  /** Height of the TLDR panel in pixels (within the left rail). */
  tldrHeight: number;
  setTheme: (t: Theme) => void;
  setViewMode: (m: ViewMode) => void;
  toggleTLDR: () => void;
  setTLDRHeight: (px: number) => void;
}

const TLDR_HEIGHT_KEY = 'pra.tldrHeight';
const TLDR_HEIGHT_MIN = 100;
const TLDR_HEIGHT_MAX = 700;
const TLDR_HEIGHT_DEFAULT = 360;

const THEME_KEY = 'pra.theme';
const MODE_KEY = 'pra.viewMode';
const TLDR_KEY = 'pra.tldrCollapsed';

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

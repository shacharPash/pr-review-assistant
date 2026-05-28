import { create } from 'zustand';

export type Theme = 'github' | 'intellij' | 'vscode';
export type ViewMode = 'split' | 'unified';

interface Preferences {
  theme: Theme;
  viewMode: ViewMode;
  tldrCollapsed: boolean;
  /** Height of the TLDR panel in pixels (within the left rail). */
  tldrHeight: number;
  /** Width of the left rail in pixels. */
  railWidth: number;
  setTheme: (t: Theme) => void;
  setViewMode: (m: ViewMode) => void;
  toggleTLDR: () => void;
  setTLDRHeight: (px: number) => void;
  setRailWidth: (px: number) => void;
}

const RAIL_WIDTH_KEY = 'pra.railWidth';
const RAIL_WIDTH_MIN = 280;
const RAIL_WIDTH_MAX = 800;
const RAIL_WIDTH_DEFAULT = 420;

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
  railWidth: (() => {
    if (typeof window === 'undefined') return RAIL_WIDTH_DEFAULT;
    const raw = window.localStorage.getItem(RAIL_WIDTH_KEY);
    const n = raw ? Number(raw) : NaN;
    if (!Number.isFinite(n)) return RAIL_WIDTH_DEFAULT;
    return Math.max(RAIL_WIDTH_MIN, Math.min(RAIL_WIDTH_MAX, n));
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

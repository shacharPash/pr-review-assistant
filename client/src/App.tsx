import { useEffect } from 'react';
import { useStore } from './state/store.js';
import { usePrefs } from './state/preferences.js';
import { PRInput } from './components/PRInput.js';
import { PRView } from './components/PRView.js';
import { HeaderControls } from './components/HeaderControls.js';
import { PRStatusBadge } from './components/PRStatusBadge.js';
import { JiraBadge } from './components/JiraBadge.js';
import { ChecksBadge } from './components/ChecksBadge.js';
import { AuthorChip } from './components/AuthorChip.js';
import { HealthBanner } from './components/HealthBanner.js';

export function App() {
  const bundle = useStore((s) => s.bundle);
  const files = useStore((s) => s.bundle?.files ?? []);
  const activePath = useStore((s) => s.activeFilePath);
  const showNoise = useStore((s) => s.showNoise);
  const selectFile = useStore((s) => s.selectFile);
  const loadPR = useStore((s) => s.loadPR);
  const theme = usePrefs((s) => s.theme);

  useEffect(() => {
    document.body.dataset.theme = theme;
  }, [theme]);

  // Auto-load the PR named in the URL (?pr=owner/repo#123) so refresh and
  // shared links restore the previous view instead of dropping the user
  // back on the empty landing page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ref = new URLSearchParams(window.location.search).get('pr');
    if (ref) loadPR(ref);
  }, [loadPR]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const visible = files.filter((f) => showNoise || !f.noise);
      if (visible.length === 0) return;
      const idx = visible.findIndex((f) => f.path === activePath);

      if (e.key === 'j') {
        e.preventDefault();
        selectFile(visible[Math.min(idx + 1, visible.length - 1)].path);
      } else if (e.key === 'k') {
        e.preventDefault();
        selectFile(visible[Math.max(idx - 1, 0)].path);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [files, activePath, showNoise, selectFile]);

  return (
    <div className="app">
      <header className="header">
        <span className="brand">
          <span className="dot" />
          PR Review Assistant
        </span>
        {bundle && <PRInput />}
        {bundle && (
          <div className="header-meta">
            <span className="pr-num">#{bundle.meta.number}</span>
            <PRStatusBadge />
            <a href={bundle.meta.url} target="_blank" rel="noreferrer">
              {bundle.meta.title}
            </a>
            <AuthorChip />
            <ChecksBadge />
            <JiraBadge />
          </div>
        )}
        <HeaderControls />
      </header>
      <HealthBanner />
      <PRView />
    </div>
  );
}

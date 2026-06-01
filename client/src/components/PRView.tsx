import { useMemo } from 'react';
import { useStore, selectDisplayFiles } from '../state/store.js';
import { usePrefs } from '../state/preferences.js';
import { FileSidebar } from './FileSidebar.js';
import { DiffViewer } from './DiffViewer.js';
import { TLDRPanel } from './TLDRPanel.js';
import { TLDRResizer } from './TLDRResizer.js';
import { RailResizer } from './RailResizer.js';
import { ReviewFooter } from './ReviewFooter.js';
import { LandingHero } from './LandingHero.js';

export function PRView() {
  const bundle = useStore((s) => s.bundle);
  const error = useStore((s) => s.error);
  const activePath = useStore((s) => s.activeFilePath);
  const showNoise = useStore((s) => s.showNoise);
  const files = useStore(selectDisplayFiles);
  const tldrHeight = usePrefs((s) => s.tldrHeight);
  const tldrCollapsed = usePrefs((s) => s.tldrCollapsed);
  const railWidth = usePrefs((s) => s.railWidth);

  const { activeFile, position } = useMemo(() => {
    if (!bundle) return { activeFile: null, position: null };
    const visible = files.filter((f) => showNoise || !f.noise);
    const idx = visible.findIndex((f) => f.path === activePath);
    if (idx < 0) return { activeFile: null, position: null };
    return {
      activeFile: visible[idx],
      position: { index: idx, total: visible.length },
    };
  }, [bundle, files, activePath, showNoise]);

  if (error) {
    return (
      <div className="error-card">
        <div className="title">{error.message}</div>
        {error.detail && <div className="detail">{error.detail}</div>}
      </div>
    );
  }

  if (!bundle) {
    return <LandingHero />;
  }

  // Clamp the rail to at most ~50% of the viewport so a wide rail set on a
  // big screen doesn't squash the diff column when the user moves to a
  // smaller one. The setter still allows the value to grow; this just
  // caps what we APPLY for layout.
  const maxRailForView = typeof window !== 'undefined'
    ? Math.max(280, Math.floor(window.innerWidth * 0.5))
    : railWidth;
  const effectiveRail = Math.min(railWidth, maxRailForView);

  return (
    <div className="main" style={{ gridTemplateColumns: `${effectiveRail}px 6px minmax(0, 1fr)` }}>
      <aside className="left-rail">
        <div
          className="tldr-slot"
          style={tldrCollapsed ? undefined : { height: tldrHeight }}
        >
          <TLDRPanel />
        </div>
        <TLDRResizer />
        <FileSidebar />
        <ReviewFooter />
      </aside>
      <RailResizer />
      <div className="diff-column">
        <DiffViewer file={activeFile} position={position} />
      </div>
    </div>
  );
}

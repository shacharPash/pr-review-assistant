import type { ReactNode } from 'react';

/**
 * Shared collapsible header for the left-rail sections (Summary, Insights,
 * Files). A chevron flips ▾/▸; clicking anywhere on the row toggles the
 * section so the reviewer can hide parts and focus (e.g. just files + code).
 * `right` holds optional trailing content (e.g. a count) that stays visible
 * even when collapsed.
 */
export function RailSectionHead({
  title,
  collapsed,
  onToggle,
  right,
}: {
  title: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  right?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rail-section-head ${collapsed ? 'collapsed' : ''}`}
      onClick={onToggle}
      aria-expanded={!collapsed}
    >
      <span className="rail-chev" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
      <span className="rail-section-title">{title}</span>
      {right != null && <span className="rail-section-right">{right}</span>}
    </button>
  );
}

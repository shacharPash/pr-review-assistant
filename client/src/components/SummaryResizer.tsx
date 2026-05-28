import { useCallback, useRef } from 'react';
import { usePrefs } from '../state/preferences.js';

/** Horizontal drag handle between the Summary card and the main work area. */
export function SummaryResizer() {
  const summaryHeight = usePrefs((s) => s.summaryHeight);
  const setSummaryHeight = usePrefs((s) => s.setSummaryHeight);
  const startRef = useRef<{ y: number; h: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startRef.current = { y: e.clientY, h: summaryHeight };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!startRef.current) return;
      const delta = ev.clientY - startRef.current.y;
      setSummaryHeight(startRef.current.h + delta);
    };
    const onUp = () => {
      startRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [summaryHeight, setSummaryHeight]);

  return (
    <div
      className="summary-resizer"
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize summary"
      title="Drag to resize the summary"
    >
      <div className="summary-resizer-grip" />
    </div>
  );
}

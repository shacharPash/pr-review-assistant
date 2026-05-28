import { useCallback, useRef } from 'react';
import { usePrefs } from '../state/preferences.js';

/** Vertical drag handle between the left rail and the diff column. */
export function RailResizer() {
  const railWidth = usePrefs((s) => s.railWidth);
  const setRailWidth = usePrefs((s) => s.setRailWidth);
  const startRef = useRef<{ x: number; w: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, w: railWidth };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!startRef.current) return;
      const delta = ev.clientX - startRef.current.x;
      setRailWidth(startRef.current.w + delta);
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
  }, [railWidth, setRailWidth]);

  return (
    <div
      className="rail-resizer"
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize left rail"
      title="Drag to resize the left rail"
    >
      <div className="rail-resizer-grip" />
    </div>
  );
}

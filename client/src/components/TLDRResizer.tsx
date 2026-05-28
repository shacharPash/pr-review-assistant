import { useCallback, useRef } from 'react';
import { usePrefs } from '../state/preferences.js';

/** Drag handle between the TLDR panel and the file list. Vertical resize. */
export function TLDRResizer() {
  const tldrHeight = usePrefs((s) => s.tldrHeight);
  const setTLDRHeight = usePrefs((s) => s.setTLDRHeight);
  const tldrCollapsed = usePrefs((s) => s.tldrCollapsed);
  const startRef = useRef<{ y: number; h: number } | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startRef.current = { y: e.clientY, h: tldrHeight };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onMove = (ev: MouseEvent) => {
      if (!startRef.current) return;
      const delta = ev.clientY - startRef.current.y;
      setTLDRHeight(startRef.current.h + delta);
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
  }, [tldrHeight, setTLDRHeight]);

  if (tldrCollapsed) return null;

  return (
    <div
      className="tldr-resizer"
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize summary panel"
      title="Drag to resize"
    >
      <div className="tldr-resizer-grip" />
    </div>
  );
}

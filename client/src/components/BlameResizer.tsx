import { useRef } from 'react';

/**
 * Drag-to-resize handle for the blame gutter width.
 *
 * Positioned absolutely on top of the diff editor at the right edge of the
 * modified-side gutter. Drag horizontally to grow/shrink the blame column;
 * the underlying `setWidth` is what eventually flows into Monaco's
 * `lineNumbersMinChars` (in chars, not pixels).
 *
 * Char width is approximated from the editor's fixed 13px monospace font.
 * Empirical value works across SF Mono / JetBrains Mono / Menlo within ±1px
 * which is well under one drag step.
 */
const CHAR_PX = 7.8;     // px per monospace char at fontSize=13
const GUTTER_PAD = 26;   // px of glyph margin + left padding before line numbers
const MIN = 10;
const MAX = 50;

export function BlameResizer({
  width,
  setWidth,
  visible,
}: {
  width: number;
  setWidth: (w: number) => void;
  visible: boolean;
}) {
  const startX = useRef(0);
  const startWidth = useRef(width);
  const dragging = useRef(false);
  const rafId = useRef<number | null>(null);
  const pendingWidth = useRef<number | null>(null);

  if (!visible) return null;

  const left = width * CHAR_PX + GUTTER_PAD;
  return (
    <div
      className="blame-resizer"
      style={{ left: `${left}px` }}
      onMouseDown={(e) => {
        dragging.current = true;
        startX.current = e.clientX;
        startWidth.current = width;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        // Attach the global listeners on demand.
        const onMove = (ev: MouseEvent) => {
          if (!dragging.current) return;
          const deltaPx = ev.clientX - startX.current;
          const deltaChars = Math.round(deltaPx / CHAR_PX);
          const next = Math.max(MIN, Math.min(MAX, startWidth.current + deltaChars));
          pendingWidth.current = next;
          if (rafId.current == null) {
            rafId.current = requestAnimationFrame(() => {
              rafId.current = null;
              if (pendingWidth.current != null) {
                setWidth(pendingWidth.current);
                pendingWidth.current = null;
              }
            });
          }
        };
        const onUp = () => {
          dragging.current = false;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp, { once: true });
        e.preventDefault();
      }}
      onDoubleClick={() => setWidth(32)}
      title="Drag to resize the blame column — double-click to reset"
      aria-label="Resize blame column"
    />
  );
}

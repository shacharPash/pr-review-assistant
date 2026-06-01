import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import mermaid from 'mermaid';
import { useStore } from '../state/store.js';
import { usePrefs } from '../state/preferences.js';

let renderCounter = 0;

function initMermaid(theme: 'github' | 'intellij' | 'vscode') {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'dark',
    themeVariables: theme === 'intellij'
      ? {
          background: '#1e1f22',
          primaryColor: '#2b2d30',
          primaryTextColor: '#bcbec4',
          primaryBorderColor: '#4e5157',
          lineColor: '#cf8e6d',
          secondaryColor: '#393b40',
          tertiaryColor: '#26282e',
        }
      : theme === 'vscode'
      ? {
          background: '#1e1e1e',
          primaryColor: '#252526',
          primaryTextColor: '#d4d4d4',
          primaryBorderColor: '#454545',
          lineColor: '#569cd6',
          secondaryColor: '#2d2d2d',
          tertiaryColor: '#1e1e1e',
        }
      : {
          background: '#161b22',
          primaryColor: '#1c2128',
          primaryTextColor: '#e6edf3',
          primaryBorderColor: '#30363d',
          lineColor: '#2f81f7',
          secondaryColor: '#22272e',
          tertiaryColor: '#0d1117',
        },
  });
}

function extractMermaid(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed || /^none\b/i.test(trimmed)) return null;
  const fenced = trimmed.match(/```(?:mermaid)?\s*\n?([\s\S]*?)```/);
  if (fenced) {
    const body = fenced[1].trim();
    return body || null;
  }
  if (/^(sequenceDiagram|flowchart|graph|classDiagram|stateDiagram|erDiagram)\b/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

export function DiagramPanel() {
  const diagram = useStore((s) => s.diagram);
  const theme = usePrefs((s) => s.theme);
  const [expanded, setExpanded] = useState(false);
  const [validated, setValidated] = useState<'pending' | 'ok' | 'invalid'>('pending');

  const source = diagram.status === 'done' ? extractMermaid(diagram.text) : null;

  // Validate Mermaid source up-front. If parse fails, we hide the panel
  // entirely instead of showing a useless "View diagram" button or a
  // broken render. Diagrams are a bonus, not a critical surface.
  useEffect(() => {
    if (!source) {
      setValidated('invalid');
      return;
    }
    let cancelled = false;
    initMermaid(theme);
    (async () => {
      try {
        await mermaid.parse(source);
        if (!cancelled) setValidated('ok');
      } catch {
        if (!cancelled) setValidated('invalid');
      }
    })();
    return () => { cancelled = true; };
  }, [source, theme]);

  if (diagram.status === 'idle') return null;
  if (diagram.status === 'streaming') {
    return (
      <div className="diagram-panel-button loading">
        <span>Considering whether a diagram would help…</span>
      </div>
    );
  }
  // Skip silently on error, NONE, or unparseable Mermaid.
  if (diagram.status === 'error') return null;
  if (!source) return null;
  if (validated === 'invalid') return null;
  if (validated === 'pending') return null;

  return (
    <>
      <button
        type="button"
        className="diagram-panel-button"
        onClick={() => setExpanded(true)}
        title="Visual diagram of the change"
      >
        <span className="diagram-button-icon">⇄</span>
        <span>View visual diagram</span>
        <span className="diagram-button-arrow">↗</span>
      </button>
      {expanded && (
        <DiagramModal source={source!} theme={theme} onClose={() => setExpanded(false)} />
      )}
    </>
  );
}

interface MermaidRenderProps {
  source: string;
  theme: 'github' | 'intellij' | 'vscode';
  keyPrefix: string;
}

function MermaidRender({ source, theme, keyPrefix }: MermaidRenderProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    initMermaid(theme);
    setErr(null);
    let cancelled = false;
    const id = `mermaid-${keyPrefix}-${++renderCounter}`;

    // Mermaid v11's render() can succeed-but-return-a-bomb-SVG for invalid
    // input AND leak temporary measuring divs into document.body. Parse
    // first so we never call render() on bad input.
    (async () => {
      try {
        await mermaid.parse(source);
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
          if (ref.current) ref.current.innerHTML = '';
        }
        return;
      }
      try {
        const { svg } = await mermaid.render(id, source);
        if (cancelled || !ref.current) return;
        // Defense in depth: if Mermaid still produced an error SVG, treat
        // it as a failure rather than rendering a stack of bombs.
        if (/syntax error/i.test(svg)) {
          setErr('Mermaid could not render this diagram.');
          ref.current.innerHTML = '';
          return;
        }
        ref.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : String(e));
          if (ref.current) ref.current.innerHTML = '';
        }
      }
    })();

    return () => {
      cancelled = true;
      // Mermaid leaves a measuring container in document.body keyed by id;
      // clean it up so failed renders don't stack visible bombs.
      const orphan = document.getElementById(`d${id}`);
      if (orphan) orphan.remove();
      document.querySelectorAll(`#${id}`).forEach((el) => el.remove());
    };
  }, [source, theme, keyPrefix]);

  if (err) {
    return (
      <div className="diagram-unavailable">
        Couldn't render the diagram. Try clicking <strong>retry</strong> on
        the brief, or skip the diagram — the rest of the review still works.
      </div>
    );
  }
  return <div className="mermaid-container" ref={ref} />;
}

interface DiagramModalProps {
  source: string;
  theme: 'github' | 'intellij' | 'vscode';
  onClose: () => void;
}

function DiagramModal({ source, theme, onClose }: DiagramModalProps) {
  // Initial size: ~80% of viewport, capped at 1400x900 so it looks reasonable
  // on big screens. Position: centered. Both are user-mutable from here on.
  const initial = (() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
    const width = Math.min(1400, Math.floor(vw * 0.8));
    const height = Math.min(900, Math.floor(vh * 0.8));
    return {
      x: Math.floor((vw - width) / 2),
      y: Math.floor((vh - height) / 2),
      width,
      height,
    };
  });
  const [pos, setPos] = useState(initial);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function onHeadPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // Ignore clicks on the close button so it still closes the modal.
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };
  }

  function onHeadPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current;
    if (!d) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Clamp so the title bar is always at least partially visible — keeps the
    // modal recoverable if the user drags it off-screen.
    const x = Math.max(-pos.width + 80, Math.min(vw - 80, d.origX + (e.clientX - d.startX)));
    const y = Math.max(0, Math.min(vh - 40, d.origY + (e.clientY - d.startY)));
    setPos((p) => ({ ...p, x, y }));
  }

  function onHeadPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content modal-floating"
        onClick={(e) => e.stopPropagation()}
        style={{
          left: pos.x,
          top: pos.y,
          width: pos.width,
          height: pos.height,
        }}
      >
        <div
          className="modal-head modal-drag-handle"
          onPointerDown={onHeadPointerDown}
          onPointerMove={onHeadPointerMove}
          onPointerUp={onHeadPointerUp}
          onPointerCancel={onHeadPointerUp}
        >
          <span className="diagram-tag">DIAGRAM</span>
          <span className="modal-drag-hint">drag to move · grab corner to resize</span>
          <button className="link-btn" onClick={onClose} aria-label="Close">
            Close (esc)
          </button>
        </div>
        <div className="modal-diagram">
          <MermaidRender source={source} theme={theme} keyPrefix="modal" />
        </div>
      </div>
    </div>
  );
}

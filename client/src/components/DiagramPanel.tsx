import { useEffect, useRef, useState } from 'react';
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
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="diagram-tag">DIAGRAM</span>
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

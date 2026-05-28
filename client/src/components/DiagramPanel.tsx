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

  if (diagram.status === 'idle') return null;
  if (diagram.status === 'streaming') {
    return (
      <div className="diagram-panel-button loading">
        <span>Considering whether a diagram would help…</span>
      </div>
    );
  }
  if (diagram.status === 'error') return null;
  const source = extractMermaid(diagram.text);
  if (!source) return null;

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
        <DiagramModal source={source} theme={theme} onClose={() => setExpanded(false)} />
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
    const id = `mermaid-${keyPrefix}-${++renderCounter}`;
    setErr(null);
    mermaid
      .render(id, source)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch((e: Error) => {
        setErr(e.message);
        if (ref.current) ref.current.innerHTML = '';
      });
  }, [source, theme, keyPrefix]);

  if (err) return <pre className="diagram-fallback">{source}</pre>;
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

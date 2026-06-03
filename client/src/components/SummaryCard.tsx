import { useState } from 'react';
import { useStore } from '../state/store.js';
import { ReviewEffort } from './ReviewEffort.js';

interface BeforeAfter {
  before: string;
  after: string;
}

/** Escape HTML, then render `inline code` as a chip. The summary/before-after
 * text arrives with literal backticks from the model; without this they'd
 * show as raw backticks. */
function inlineCode(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
}

function parseBeforeAfter(raw: string): BeforeAfter | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^none\b/i.test(trimmed)) return null;
  const before = trimmed.match(/BEFORE:\s*([^\n]+)/i)?.[1]?.trim();
  const after = trimmed.match(/AFTER:\s*([^\n]+)/i)?.[1]?.trim();
  if (!before || !after) return null;
  return { before, after };
}

export function SummaryCard() {
  const bundle = useStore((s) => s.bundle);
  const headline = useStore((s) => s.headline);
  const beforeAfter = useStore((s) => s.beforeAfter);
  const [collapsed, setCollapsed] = useState(false);

  if (!bundle) return null;

  const ba = beforeAfter.status === 'done' ? parseBeforeAfter(beforeAfter.text) : null;

  return (
    <section className="summary-card">
      <div className="summary-card-grid">
        <div className="summary-main">
          <span className="summary-tag">📌 SUMMARY</span>
          <div className="summary-body">
            {headline.status === 'streaming' && (
              <>
                <span dangerouslySetInnerHTML={{ __html: inlineCode(headline.text || 'Reading the diff…') }} />
                <span className="cursor" />
              </>
            )}
            {headline.status === 'done' && (
              <span dangerouslySetInnerHTML={{ __html: inlineCode(headline.text) }} />
            )}
            {headline.status === 'error' && (
              <span className="summary-error">Couldn't generate summary.</span>
            )}
          </div>
        </div>
        <ReviewEffort />
      </div>

      {ba && (
        <div className="summary-ba-wrap">
          <button
            type="button"
            className="summary-ba-toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            aria-controls="summary-ba-content"
          >
            <span className={`summary-ba-chev ${collapsed ? 'collapsed' : ''}`}>▾</span>
            <span className="summary-ba-toggle-label">Before / After</span>
          </button>
          {!collapsed && (
            <div id="summary-ba-content" className="summary-ba">
              <div className="summary-ba-card before">
                <div className="summary-ba-label">
                  <span className="summary-ba-icon">❌</span>
                  <span>Before</span>
                </div>
                <div className="summary-ba-text" dangerouslySetInnerHTML={{ __html: inlineCode(ba.before) }} />
              </div>
              <div className="summary-ba-arrow">→</div>
              <div className="summary-ba-card after">
                <div className="summary-ba-label">
                  <span className="summary-ba-icon">✅</span>
                  <span>After</span>
                </div>
                <div className="summary-ba-text" dangerouslySetInnerHTML={{ __html: inlineCode(ba.after) }} />
              </div>
            </div>
          )}
        </div>
      )}

      {beforeAfter.status === 'streaming' && !ba && (
        <div className="summary-ba-loading">considering a before/after…</div>
      )}
    </section>
  );
}

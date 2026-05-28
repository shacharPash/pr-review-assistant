import { useState } from 'react';
import { useStore } from '../state/store.js';

interface BeforeAfter {
  before: string;
  after: string;
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
  const showBA = !!ba && !collapsed;

  return (
    <section className="summary-card">
      <div className="summary-head">
        <span className="summary-tag">📌 SUMMARY</span>
        {ba && (
          <button
            type="button"
            className="summary-collapse"
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Show before/after' : 'Hide before/after'}
          >
            {collapsed ? '▾ show before/after' : '▴ hide details'}
          </button>
        )}
      </div>

      <div className="summary-body">
        {headline.status === 'streaming' && (
          <>
            <span>{headline.text || 'Reading the diff…'}</span>
            <span className="cursor" />
          </>
        )}
        {headline.status === 'done' && <span>{headline.text}</span>}
        {headline.status === 'error' && (
          <span className="summary-error">Couldn't generate summary.</span>
        )}
      </div>

      {showBA && ba && (
        <div className="summary-ba">
          <div className="summary-ba-card before">
            <div className="summary-ba-label">
              <span className="summary-ba-icon">❌</span>
              <span>Before</span>
            </div>
            <div className="summary-ba-text">{ba.before}</div>
          </div>
          <div className="summary-ba-arrow">→</div>
          <div className="summary-ba-card after">
            <div className="summary-ba-label">
              <span className="summary-ba-icon">✅</span>
              <span>After</span>
            </div>
            <div className="summary-ba-text">{ba.after}</div>
          </div>
        </div>
      )}

      {beforeAfter.status === 'streaming' && !ba && (
        <div className="summary-ba-loading">considering a before/after…</div>
      )}
    </section>
  );
}

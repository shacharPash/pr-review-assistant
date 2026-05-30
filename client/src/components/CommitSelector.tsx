import { useEffect, useRef, useState } from 'react';
import { useStore, type SelectedScope } from '../state/store.js';

export function CommitSelector() {
  const bundle = useStore((s) => s.bundle);
  const scope = useStore((s) => s.scope);
  const scopeLoading = useStore((s) => s.scopeLoading);
  const lastReviewedSha = useStore((s) => s.lastReviewedSha);
  const selectScope = useStore((s) => s.selectScope);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const commits = bundle?.commits ?? [];
  if (!bundle || commits.length === 0) return null;

  const sinceReviewAvailable =
    !!lastReviewedSha && lastReviewedSha !== bundle.meta.headSha &&
    commits.some((c) => c.oid === lastReviewedSha);

  const pick = async (next: SelectedScope) => {
    setOpen(false);
    if (next.kind === scope.kind && next.commitSha === scope.commitSha) return;
    await selectScope(next);
  };

  return (
    <div className="commit-selector" ref={wrapRef}>
      <button
        type="button"
        className={`commit-selector-button ${scope.kind !== 'all' ? 'scoped' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Choose which commits to review"
      >
        <span className="cs-icon">⟁</span>
        <span className="cs-label">{scopeLoading ? 'Loading…' : scope.label}</span>
        <span className="cs-caret">▾</span>
      </button>

      {open && (
        <div className="commit-selector-popover" role="menu">
          <button
            className={`cs-option ${scope.kind === 'all' ? 'active' : ''}`}
            onClick={() => pick({ kind: 'all', label: 'All commits' })}
          >
            <span className="cs-radio">{scope.kind === 'all' ? '●' : '○'}</span>
            <div className="cs-option-text">
              <div className="cs-option-title">All commits</div>
              <div className="cs-option-sub">Full PR diff ({commits.length} commit{commits.length === 1 ? '' : 's'})</div>
            </div>
          </button>

          <button
            className={`cs-option ${scope.kind === 'since-review' ? 'active' : ''} ${
              sinceReviewAvailable ? '' : 'disabled'
            }`}
            disabled={!sinceReviewAvailable}
            onClick={() => {
              if (!sinceReviewAvailable || !lastReviewedSha) return;
              pick({
                kind: 'since-review',
                baseSha: lastReviewedSha,
                label: 'Since your last review',
              });
            }}
            title={
              sinceReviewAvailable
                ? `Compare against ${lastReviewedSha?.slice(0, 7)} (your last review)`
                : lastReviewedSha === bundle.meta.headSha
                  ? "You've already reviewed the current commit"
                  : "You haven't reviewed this PR yet"
            }
          >
            <span className="cs-radio">{scope.kind === 'since-review' ? '●' : '○'}</span>
            <div className="cs-option-text">
              <div className="cs-option-title">Changes since your last review</div>
              <div className="cs-option-sub">
                {sinceReviewAvailable
                  ? `${lastReviewedSha?.slice(0, 7)} → ${bundle.meta.headSha.slice(0, 7)}`
                  : 'Not available yet'}
              </div>
            </div>
          </button>

          <div className="cs-divider">Specific commit</div>
          <div className="cs-commit-list">
            {commits.map((c) => {
              const active = scope.kind === 'commit' && scope.commitSha === c.oid;
              return (
                <button
                  key={c.oid}
                  className={`cs-option cs-commit ${active ? 'active' : ''}`}
                  onClick={() => pick({
                    kind: 'commit',
                    commitSha: c.oid,
                    label: `${c.short} — ${truncate(c.message, 40)}`,
                  })}
                  title={c.message}
                >
                  <span className="cs-radio">{active ? '●' : '○'}</span>
                  <div className="cs-option-text">
                    <div className="cs-option-title">{truncate(c.message, 60)}</div>
                    <div className="cs-option-sub">
                      <code>{c.short}</code> · {c.author}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

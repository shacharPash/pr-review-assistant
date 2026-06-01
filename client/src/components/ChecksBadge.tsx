import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { summarize, type CheckRun, type ChecksSummary } from '@shared/checks';

/**
 * CI status pill (header). Click to expand: shows failed/pending first,
 * collapses passing into a count. Each row links to the GH Actions job.
 */
export function ChecksBadge() {
  const checks = useStore((s) => s.checks);
  const fetchChecks = useStore((s) => s.fetchChecks);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Don't render until we have a PR (the button would be meaningless).
  if (checks.status === 'idle') return null;

  if (checks.status === 'loading') {
    return <span className="checks-pill checks-loading">◌ checks…</span>;
  }
  if (checks.status === 'error') {
    return (
      <button
        type="button"
        className="checks-pill checks-error"
        title={checks.error}
        onClick={() => fetchChecks()}
      >
        ! checks
      </button>
    );
  }

  const summary = summarize(checks.runs);
  if (summary.total === 0) {
    return <span className="checks-pill checks-none" title="No CI checks ran for this PR">— no checks</span>;
  }

  return (
    <div className="checks-root" ref={rootRef}>
      <button
        type="button"
        className={`checks-pill checks-${summary.overall}`}
        onClick={() => setOpen((o) => !o)}
        title={pillTitle(summary)}
        aria-expanded={open}
      >
        <span className="checks-icon">{pillIcon(summary.overall)}</span>
        <span className="checks-label">{pillLabel(summary)}</span>
      </button>
      {open && (
        <ChecksPopover runs={checks.runs} summary={summary} onRefresh={() => fetchChecks()} loading={false} />
      )}
    </div>
  );
}

function pillIcon(overall: ChecksSummary['overall']): string {
  switch (overall) {
    case 'pass': return '✓';
    case 'fail': return '✕';
    case 'pending': return '◐';
    case 'cancel': return '⊘';
    default: return '—';
  }
}

function pillLabel(s: ChecksSummary): string {
  if (s.overall === 'pass') return `${s.passed}/${s.total}`;
  if (s.overall === 'fail') return `${s.failed} failed`;
  if (s.overall === 'pending') return `${s.pending} running`;
  if (s.overall === 'cancel') return `${s.cancelled} cancelled`;
  return `${s.total}`;
}

function pillTitle(s: ChecksSummary): string {
  const parts: string[] = [];
  if (s.passed) parts.push(`${s.passed} passed`);
  if (s.failed) parts.push(`${s.failed} failed`);
  if (s.pending) parts.push(`${s.pending} running`);
  if (s.cancelled) parts.push(`${s.cancelled} cancelled`);
  if (s.skipped) parts.push(`${s.skipped} skipped`);
  return parts.join(' · ') || 'No checks';
}

interface ChecksPopoverProps {
  runs: CheckRun[];
  summary: ChecksSummary;
  onRefresh: () => void;
  loading: boolean;
}

/** Sort key — failed and running first, then cancelled, then passed. */
const BUCKET_ORDER: Record<CheckRun['bucket'], number> = {
  fail: 0, pending: 1, cancel: 2, pass: 3, skipping: 4,
};

function ChecksPopover({ runs, summary, onRefresh, loading }: ChecksPopoverProps) {
  const [showPassed, setShowPassed] = useState(false);
  const sorted = [...runs].sort((a, b) => {
    const d = BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket];
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
  const interesting = sorted.filter((r) => r.bucket === 'fail' || r.bucket === 'pending' || r.bucket === 'cancel');
  const passing = sorted.filter((r) => r.bucket === 'pass');
  const skipped = sorted.filter((r) => r.bucket === 'skipping');
  const visible = showPassed ? sorted : interesting.length > 0 ? interesting : sorted;

  return (
    <div className="checks-popover" role="dialog" aria-label="CI checks">
      <div className="checks-popover-head">
        <span className="checks-popover-title">CI · {pillTitle(summary)}</span>
        <button
          type="button"
          className="link-btn"
          onClick={onRefresh}
          disabled={loading}
          title="Re-fetch checks"
        >
          {loading ? '…' : '↻'}
        </button>
      </div>
      <ul className="checks-list">
        {visible.map((r) => (
          <CheckRow key={`${r.workflow}/${r.name}`} run={r} />
        ))}
      </ul>
      {!showPassed && interesting.length > 0 && passing.length > 0 && (
        <button
          type="button"
          className="checks-show-more"
          onClick={() => setShowPassed(true)}
        >
          show {passing.length} passing
          {skipped.length > 0 ? ` + ${skipped.length} skipped` : ''}
        </button>
      )}
    </div>
  );
}

function CheckRow({ run }: { run: CheckRun }) {
  const duration = formatDuration(run.startedAt, run.completedAt);
  return (
    <li className={`checks-row checks-row-${run.bucket}`}>
      <span className="checks-row-icon" aria-hidden>{rowIcon(run.bucket)}</span>
      <div className="checks-row-body">
        <a href={run.link} target="_blank" rel="noreferrer" className="checks-row-name">
          {run.name}
        </a>
        <span className="checks-row-meta">
          {run.workflow}
          {duration ? ` · ${duration}` : ''}
        </span>
      </div>
    </li>
  );
}

function rowIcon(bucket: CheckRun['bucket']): string {
  switch (bucket) {
    case 'pass': return '✓';
    case 'fail': return '✕';
    case 'pending': return '◐';
    case 'cancel': return '⊘';
    case 'skipping': return '–';
  }
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt) return '';
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const ms = end - new Date(startedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return rs === 0 ? `${m}m` : `${m}m ${rs}s`;
}

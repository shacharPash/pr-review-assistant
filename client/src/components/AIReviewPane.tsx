import { SafeInline } from '../lib/SafeMarkdown.js';
import { useEffect, useMemo, useState } from 'react';
import { parseAIReview, resolveAIReviewComment, type AISeverity } from '@shared/aiReview';
import { useStore } from '../state/store.js';

const SEVERITY_META: Record<AISeverity, { label: string; emoji: string }> = {
  bug: { label: 'Bug', emoji: '🐞' },
  security: { label: 'Security', emoji: '🔒' },
  correctness: { label: 'Correctness', emoji: '🎯' },
  perf: { label: 'Performance', emoji: '⚡' },
  convention: { label: 'Convention', emoji: '📐' },
};

/**
 * AI Review tab. Renders the model's suggested inline comments as clickable
 * cards — clicking one jumps the diff to that line and opens the composer
 * pre-filled with the suggestion (see `jumpToSuggestion` + DiffViewer). When
 * the model finds nothing important, shows a "ready to approve" state.
 */
export function AIReviewPane() {
  const aiReview = useStore((s) => s.aiReview);
  const startedAt = useStore((s) => s.aiReviewStartedAt);
  const retry = useStore((s) => s.retryAIReview);
  const bundle = useStore((s) => s.bundle);
  const jumpToSuggestion = useStore((s) => s.jumpToSuggestion);
  const lineComments = useStore((s) => s.lineComments);

  const parsed = useMemo(
    () => (aiReview.status === 'done' ? parseAIReview(aiReview.text) : null),
    [aiReview.status, aiReview.text],
  );

  // Live elapsed-seconds counter while the review streams, so a multi-minute
  // run on a large PR reads as "working", not "hung". Derived from the store's
  // `aiReviewStartedAt` (not a mount-time timestamp) so switching tabs away and
  // back — which unmounts and remounts this pane — resumes the count instead of
  // restarting it at 0.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (aiReview.status !== 'streaming' || !startedAt) {
      setElapsed(0);
      return;
    }
    const tick = () => setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [aiReview.status, startedAt]);

  // Keep only suggestions we can actually anchor to a changed diff line,
  // snapping near-misses to the nearest changed line in the same file.
  const comments = useMemo(() => {
    if (!parsed || !bundle) return [];
    return parsed.comments
      .map((c) => resolveAIReviewComment(bundle, c));
  }, [parsed, bundle]);

  if (aiReview.status === 'error') {
    return (
      <div className="tldr-error">
        {aiReview.error || "Couldn't generate the AI review."}
        <button className="link-btn retry" onClick={retry}>Retry</button>
      </div>
    );
  }

  if (aiReview.status !== 'done') {
    return (
      <div className="ai-review-thinking" aria-label="Reviewing the diff">
        <div className="air-spinner" aria-hidden="true" />
        <div className="air-thinking-text">
          Reviewing for real issues{elapsed > 0 ? ` · ${elapsed}s` : '…'}
          <span className="air-thinking-sub">
            bugs, correctness, security, and your repo's conventions. Large PRs can
            take a couple of minutes; the result is cached afterward.
          </span>
        </div>
      </div>
    );
  }

  if (!parsed) {
    return (
      <div className="tldr-error">
        Couldn't parse the AI review.
        <button className="link-btn retry" onClick={retry}>Retry</button>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="ai-review-clean">
        <div className="air-clean-badge">✓</div>
        <div className="air-clean-title">{parsed.verdict === 'approve' ? 'No findings reported by AI' : 'Review completed without inline findings'}</div>
        <div className="air-clean-sub">
          {parsed.summary}
          <p>This is an AI assessment of the supplied diff. Review the change before deciding whether to approve.</p>
        </div>
        <button className="link-btn retry air-clean-retry" onClick={retry}>Re-run review</button>
      </div>
    );
  }

  return (
    <div className="ai-review-body">
      <div className="air-header">
        <span className="air-count">{comments.length}</span>
        <span className="air-count-label">
          suggested {comments.length === 1 ? 'comment' : 'comments'}
        </span>
        {parsed.summary && <span className="air-summary">{parsed.summary}</span>}
      </div>
      {comments.map((c, i) => {
        const staged = !c.anchorWarning && !!lineComments[c.file]?.[c.line];
        return (
          <button
            key={`${c.file}:${c.line}:${i}`}
            type="button"
            className={`air-card ai-sev-${c.severity} ${staged ? 'staged' : ''}`}
            onClick={() => { if (!c.anchorWarning) jumpToSuggestion(c); }}
            disabled={!!c.anchorWarning}
            title="Jump to this line and draft the comment"
          >
            <div className="air-card-top">
              <span className="air-sev">
                {SEVERITY_META[c.severity].emoji} {SEVERITY_META[c.severity].label}
              </span>
              <span className="air-loc">
                {shortPath(c.file)}:{c.line}
              </span>
              {staged && <span className="air-staged">✓ added</span>}
            </div>
            <div className="air-card-title">{c.title}</div>
            <div
              className="air-card-body"
              children={<SafeInline text={c.body} />}
            />
            {c.anchorWarning ? <div className="air-anchor-warning" role="note">Unanchored finding: {c.anchorWarning}</div> :
              <div className="air-card-cta">{staged ? 'Open in diff →' : 'Add as comment →'}</div>}
          </button>
        );
      })}
    </div>
  );
}

function shortPath(path: string): string {
  const parts = path.split('/');
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`;
}


import { useStore } from '../state/store.js';
import type { PRMeta } from '@shared/types';

type StatusKind = 'open' | 'draft' | 'merged' | 'closed';

/** GitHub's four PR states: Merged/Closed are terminal; an open PR is either a
 * Draft or Open depending on `isDraft`. */
function statusOf(meta: PRMeta): { kind: StatusKind; label: string } {
  if (meta.state === 'merged') return { kind: 'merged', label: 'Merged' };
  if (meta.state === 'closed') return { kind: 'closed', label: 'Closed' };
  if (meta.isDraft) return { kind: 'draft', label: 'Draft' };
  return { kind: 'open', label: 'Open' };
}

const REVIEW: Record<NonNullable<PRMeta['reviewDecision']>, { label: string; cls: string; icon: string }> = {
  approved: { label: 'Approved', cls: 'approved', icon: '✓' },
  changes_requested: { label: 'Changes requested', cls: 'changes', icon: '✕' },
  review_required: { label: 'Review required', cls: 'required', icon: '◐' },
};

export function PRStatusBadge() {
  const meta = useStore((s) => s.bundle?.meta);
  if (!meta) return null;

  const status = statusOf(meta);
  // The review decision is only meaningful while the PR is open — once it's
  // merged or closed, "Approved"/"Review required" is just noise.
  const review = meta.state === 'open' && meta.reviewDecision ? REVIEW[meta.reviewDecision] : null;

  return (
    <span className="pr-status-wrap">
      <span className={`pr-status pr-status-${status.kind}`}>{status.label}</span>
      {review && (
        <span className={`pr-review pr-review-${review.cls}`}>
          <span aria-hidden="true">{review.icon}</span>
          {review.label}
        </span>
      )}
    </span>
  );
}

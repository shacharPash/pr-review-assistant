import { useState } from 'react';
import { useStore } from '../state/store.js';
import { SlackNotify } from './SlackNotify.js';

type Event = 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';

export function ReviewFooter() {
  const lineComments = useStore((s) => s.lineComments);
  const comments = useStore((s) => s.comments);
  const reviewSummary = useStore((s) => s.reviewSummary);
  const setReviewSummary = useStore((s) => s.setReviewSummary);
  const posting = useStore((s) => s.postingReview);
  const postReview = useStore((s) => s.postReview);
  const bundle = useStore((s) => s.bundle);
  const [expanded, setExpanded] = useState(false);

  if (!bundle) return null;

  const inlineCount = Object.values(lineComments).reduce(
    (n, perFile) => n + Object.values(perFile).filter((v) => v?.body?.trim()).length,
    0,
  );
  const fileNoteCount = Object.values(comments).filter((c) => c?.trim()).length;
  const totalNotes = inlineCount + fileNoteCount;

  const isPosting = posting.status === 'posting';
  const isDone = posting.status === 'done';
  const isError = posting.status === 'error';

  // Color hint: when there are comments, lean red (suggests changes);
  // when there are none, lean green (suggests approve). Neutral while
  // we don't know intent.
  const ctaTone = totalNotes === 0 ? 'approve' : 'changes';

  if (!expanded && !isDone && !isError) {
    return (
      <button className={`review-cta tone-${ctaTone}`} onClick={() => setExpanded(true)}>
        <span className="review-cta-emoji">{totalNotes === 0 ? '✅' : '📝'}</span>
        <span className="review-cta-text">
          {totalNotes === 0
            ? 'Ready to approve →'
            : `Submit review (${totalNotes} comment${totalNotes === 1 ? '' : 's'})`}
        </span>
        <span className="review-cta-arrow">→</span>
      </button>
    );
  }

  const submit = (event: Event) => postReview(event);

  return (
    <div className="review-footer expanded">
      {!isDone && (
        <>
          <div className="review-footer-head">
            <span className="review-title">📝 Submit review</span>
            <button className="link-btn small" onClick={() => setExpanded(false)}>collapse</button>
          </div>
          <textarea
            className="review-summary"
            value={reviewSummary}
            onChange={(e) => setReviewSummary(e.target.value)}
            placeholder="Overall review summary (optional)…"
            rows={2}
          />
          <div className="review-actions big">
            <button
              className="review-btn-big approve"
              onClick={() => submit('APPROVE')}
              disabled={isPosting}
              title="Approve this PR"
            >
              <span className="rb-emoji">✅</span>
              <span className="rb-label">Approve</span>
            </button>
            <button
              className="review-btn-big comment"
              onClick={() => submit('COMMENT')}
              disabled={isPosting || (totalNotes === 0 && !reviewSummary.trim())}
              title="Submit as a comment-only review"
            >
              <span className="rb-emoji">💬</span>
              <span className="rb-label">Comment</span>
            </button>
            <button
              className="review-btn-big changes"
              onClick={() => submit('REQUEST_CHANGES')}
              disabled={isPosting}
              title="Request changes"
            >
              <span className="rb-emoji">🛑</span>
              <span className="rb-label">Request changes</span>
            </button>
          </div>
          <div className="review-meta">
            {inlineCount} inline · {fileNoteCount} file note{fileNoteCount === 1 ? '' : 's'}
            {isPosting && ' · submitting to GitHub…'}
          </div>
        </>
      )}
      {isError && (
        <div className="post-status error" title={posting.message}>
          {posting.message}
        </div>
      )}
      {isDone && (
        <div className="post-status ok">
          <div>Review posted to GitHub ✓</div>
          {posting.url && (
            <a href={posting.url} target="_blank" rel="noreferrer" className="link-btn">
              View review on GitHub →
            </a>
          )}
          <SlackNotify />
        </div>
      )}
    </div>
  );
}

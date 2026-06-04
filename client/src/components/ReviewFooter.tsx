import { useState } from 'react';
import { useStore } from '../state/store.js';
import { SlackNotify } from './SlackNotify.js';

type Event = 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';

interface PendingComment {
  path: string;
  line?: number;
  startLine?: number;
  body: string;
  kind: 'inline' | 'file';
}

export function ReviewFooter() {
  const lineComments = useStore((s) => s.lineComments);
  const comments = useStore((s) => s.comments);
  const reviewSummary = useStore((s) => s.reviewSummary);
  const setReviewSummary = useStore((s) => s.setReviewSummary);
  const posting = useStore((s) => s.postingReview);
  const postReview = useStore((s) => s.postReview);
  const bundle = useStore((s) => s.bundle);
  const selectFile = useStore((s) => s.selectFile);
  const removeLineComment = useStore((s) => s.removeLineComment);
  const setComment = useStore((s) => s.setComment);
  const [expanded, setExpanded] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  if (!bundle) return null;

  // A merged or closed PR can't be approved / have changes requested, so the
  // "Ready to approve" CTA is wrong there. Show a calm status note instead —
  // the reviewer is reading it after the fact, not reviewing it.
  if (bundle.meta.state === 'merged' || bundle.meta.state === 'closed') {
    const merged = bundle.meta.state === 'merged';
    return (
      <div className={`review-footer terminal-state ${merged ? 'merged' : 'closed'}`}>
        <span className="terminal-state-label">
          {merged ? '🟣 This PR is merged' : '🔴 This PR is closed'} — review actions don’t apply.
        </span>
        <a href={bundle.meta.url} target="_blank" rel="noreferrer" className="link-btn">
          View on GitHub →
        </a>
      </div>
    );
  }

  // Flatten all pending comments so we can both count them accurately AND
  // show the user exactly where each one lives — fixes the "1 comment but
  // I can't find it" puzzle when an entry survives from a previous PR.
  const pending: PendingComment[] = [];
  for (const [path, perLine] of Object.entries(lineComments)) {
    for (const [lineStr, entry] of Object.entries(perLine)) {
      if (entry?.body?.trim()) {
        pending.push({
          path,
          line: Number(lineStr),
          startLine: entry.startLine,
          body: entry.body,
          kind: 'inline',
        });
      }
    }
  }
  for (const [path, body] of Object.entries(comments)) {
    if (body?.trim()) pending.push({ path, body, kind: 'file' });
  }
  const inlineCount = pending.filter((p) => p.kind === 'inline').length;
  const fileNoteCount = pending.filter((p) => p.kind === 'file').length;
  const totalNotes = pending.length;

  const isPosting = posting.status === 'posting';
  const isDone = posting.status === 'done';
  const isError = posting.status === 'error';

  // Color hint: when there are comments, lean red (suggests changes);
  // when there are none, lean green (suggests approve). Neutral while
  // we don't know intent.
  const ctaTone = totalNotes === 0 ? 'approve' : 'changes';

  if (!expanded && !isDone && !isError) {
    return (
      <div className="review-cta-wrap">
        <button className={`review-cta tone-${ctaTone}`} onClick={() => setExpanded(true)}>
          <span className="review-cta-emoji">{totalNotes === 0 ? '✅' : '📝'}</span>
          <span className="review-cta-text">
            {totalNotes === 0
              ? 'Ready to approve →'
              : `Submit review (${totalNotes} comment${totalNotes === 1 ? '' : 's'})`}
          </span>
          <span className="review-cta-arrow">→</span>
        </button>
        {totalNotes > 0 && (
          <button
            className="review-peek-btn"
            onClick={() => setReviewing((v) => !v)}
            title="Show my pending comments"
          >
            {reviewing ? '▾' : '▸'} {totalNotes} pending
          </button>
        )}
        {reviewing && totalNotes > 0 && (
          <PendingList
            pending={pending}
            onJump={(path) => selectFile(path)}
            onDelete={(p) => {
              if (p.kind === 'inline' && p.line != null) removeLineComment(p.path, p.line);
              else setComment(p.path, '');
            }}
          />
        )}
      </div>
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

function PendingList({
  pending,
  onJump,
  onDelete,
}: {
  pending: PendingComment[];
  onJump: (path: string) => void;
  onDelete: (p: PendingComment) => void;
}) {
  return (
    <div className="pending-list">
      {pending.map((p, i) => {
        const lineLabel =
          p.kind === 'inline'
            ? p.startLine && p.startLine !== p.line
              ? `L${p.startLine}–${p.line}`
              : `L${p.line}`
            : 'file';
        const shortPath = p.path.split('/').slice(-2).join('/');
        return (
          <div key={`${p.kind}:${p.path}:${p.line ?? 'file'}:${i}`} className="pending-item">
            <button className="pending-jump" onClick={() => onJump(p.path)} title={p.path}>
              <span className="pending-kind">{p.kind === 'inline' ? '💬' : '📄'}</span>
              <span className="pending-path">{shortPath}</span>
              <span className="pending-line">{lineLabel}</span>
            </button>
            <div className="pending-body">{p.body.trim().slice(0, 140)}{p.body.length > 140 && '…'}</div>
            <button
              className="pending-delete"
              onClick={() => onDelete(p)}
              title="Discard this comment"
              aria-label="Discard comment"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

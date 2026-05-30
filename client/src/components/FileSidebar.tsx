import { useMemo, type MouseEvent } from 'react';
import { useStore, selectDisplayFiles } from '../state/store.js';
import type { DiffFile } from '@shared/types';
import { CommitSelector } from './CommitSelector.js';

export function FileSidebar() {
  const files = useStore(selectDisplayFiles);
  const active = useStore((s) => s.activeFilePath);
  const showNoise = useStore((s) => s.showNoise);
  const toggleNoise = useStore((s) => s.toggleNoise);
  const selectFile = useStore((s) => s.selectFile);
  const reviewed = useStore((s) => s.reviewed);
  const comments = useStore((s) => s.comments);
  const lineComments = useStore((s) => s.lineComments);
  const toggleReviewed = useStore((s) => s.toggleReviewed);

  const { visible, hidden } = useMemo(() => {
    const visible: DiffFile[] = [];
    const hidden: DiffFile[] = [];
    for (const f of files) {
      if (f.noise && !showNoise) hidden.push(f);
      else visible.push(f);
    }
    return { visible, hidden };
  }, [files, showNoise]);

  const reviewedCount = visible.filter((f) => reviewed[f.path]).length;
  const total = visible.length;

  if (files.length === 0) return null;

  const orderExplain = 'Production code is shown before tests; interfaces and ' +
    'schemas before implementations; lockfiles and generated files at the bottom. ' +
    'Read top to bottom — earlier files usually establish the contract that later ' +
    'files implement or verify.';

  return (
    <div className="file-list">
      <CommitSelector />
      <div className="section-label">
        <span className="label-with-info">
          Reading order
          <span className="info-tip" tabIndex={0} aria-label="How files are ordered">
            <span className="info-icon">i</span>
            <span className="info-pop">{orderExplain}</span>
          </span>
        </span>
        <span className="count">
          {reviewedCount}/{total} reviewed
        </span>
      </div>
      <div className="review-progress">
        <div
          className="review-progress-fill"
          style={{ width: total ? `${(reviewedCount / total) * 100}%` : '0%' }}
        />
      </div>
      {visible.map((f, i) => {
        const isReviewed = !!reviewed[f.path];
        const hasFileNote = !!comments[f.path]?.trim();
        const inlineCount = Object.values(lineComments[f.path] ?? {}).filter((v) => v?.body?.trim()).length;
        const commentCount = (hasFileNote ? 1 : 0) + inlineCount;
        const className = classNameOf(f.path);
        const badges = badgesFor(f);
        const handleCheckClick = (e: MouseEvent) => {
          e.stopPropagation();
          toggleReviewed(f.path);
        };
        return (
          <div
            key={f.path}
            className={`file-card ${active === f.path ? 'active' : ''} ${isReviewed ? 'reviewed' : ''}`}
            onClick={() => selectFile(f.path)}
            title={f.path}
          >
            <button
              type="button"
              className={`review-check ${isReviewed ? 'checked' : ''}`}
              onClick={handleCheckClick}
              aria-label={isReviewed ? 'Mark not reviewed' : 'Mark reviewed'}
              title={isReviewed ? 'Reviewed — click to unmark' : 'Mark as reviewed'}
            >
              {isReviewed ? '✓' : i + 1}
            </button>
            <div className="info">
              <div className="name">
                <span>{className}</span>
                {badges.map((b) => (
                  <span key={b.label} className={`badge ${b.kind}`}>{b.label}</span>
                ))}
                {commentCount > 0 && (
                  <span
                    className="badge comment-count-badge"
                    title={`${commentCount} comment${commentCount === 1 ? '' : 's'} on this file`}
                  >
                    💬 {commentCount}
                  </span>
                )}
              </div>
              <div className="path">{f.path}</div>
            </div>
            <div className="stats">
              <span className="add">+{f.additions}</span>
              <span className="del">-{f.deletions}</span>
            </div>
          </div>
        );
      })}
      {hidden.length > 0 && (
        <div className="noise-toggle" onClick={toggleNoise}>
          + Show {hidden.length} noise file{hidden.length === 1 ? '' : 's'}{' '}
          <span style={{ color: 'var(--fg-faint)' }}>(lockfiles, generated, etc.)</span>
        </div>
      )}
      {showNoise && hidden.length === 0 && files.some((f) => f.noise) && (
        <div className="noise-toggle" onClick={toggleNoise}>
          Hide noise files
        </div>
      )}
    </div>
  );
}

function classNameOf(path: string): string {
  const last = path.split('/').pop() ?? path;
  return last.replace(/\.[^.]+$/, '');
}

interface Badge {
  label: string;
  kind: 'new' | 'removed' | 'test' | 'renamed' | 'noise';
}

function badgesFor(file: DiffFile): Badge[] {
  const badges: Badge[] = [];
  if (file.status === 'added') badges.push({ label: 'NEW', kind: 'new' });
  else if (file.status === 'removed') badges.push({ label: 'DEL', kind: 'removed' });
  else if (file.status === 'renamed') badges.push({ label: 'MOVED', kind: 'renamed' });

  if (isTestPath(file.path)) badges.push({ label: 'TEST', kind: 'test' });
  if (file.noise) badges.push({ label: file.noise.toUpperCase(), kind: 'noise' });

  return badges;
}

function isTestPath(path: string): boolean {
  const lc = path.toLowerCase();
  return (
    lc.includes('/test/') ||
    lc.includes('/tests/') ||
    lc.includes('__tests__') ||
    /\.(test|spec)\.[a-z]+$/.test(lc) ||
    /test\.(java|kt|go|py|ts|tsx|js)$/.test(lc)
  );
}

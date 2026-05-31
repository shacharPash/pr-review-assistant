import { useState } from 'react';
import { useStore } from '../state/store.js';
import { usePrefs } from '../state/preferences.js';
import { BotAvatar } from './BotAvatar.js';
import type { PRLevelComment } from '@shared/reviewComments';

/**
 * Activity tab: PR-level review summaries + bot reports (SonarCloud, Jit,
 * Cursor BugBot summary, Claude Code review, etc.) in one chronological feed.
 *
 * Inline (line-anchored) comments are rendered in the diff via
 * ReviewCommentsLayer — they don't appear here to avoid duplication.
 */
export function ReviewActivityPane() {
  const status = useStore((s) => s.reviewCommentsStatus);
  const error = useStore((s) => s.reviewCommentsError);
  const reviewComments = useStore((s) => s.reviewComments);
  const refetch = useStore((s) => s.fetchReviewComments);
  const hideAll = usePrefs((s) => s.hideReviewerComments);
  const toggleHideAll = usePrefs((s) => s.toggleHideReviewerComments);
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({});
  const [allCollapsed, setAllCollapsed] = useState(false);

  const setAllCollapsedState = (next: boolean) => {
    setAllCollapsed(next);
    // Reset per-item overrides when toggling globally so the new state takes effect.
    setCollapsedById({});
  };
  const toggleOne = (id: string) =>
    setCollapsedById((c) => ({ ...c, [id]: !(c[id] ?? allCollapsed) }));
  const isCollapsed = (id: string) => collapsedById[id] ?? allCollapsed;

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="tldr-skeleton" aria-label="Loading review activity">
        <div className="skel-row" style={{ width: '60%' }} />
        <div className="skel-row" style={{ width: '90%' }} />
        <div className="skel-row" style={{ width: '0', height: 6 }} />
        <div className="skel-row" style={{ width: '50%' }} />
        <div className="skel-row" style={{ width: '85%' }} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="tldr-error">
        {error || 'Could not load review activity.'}
        <button className="link-btn retry" onClick={refetch}>Retry</button>
      </div>
    );
  }

  const prLevel = reviewComments?.prLevel ?? [];
  const inline = reviewComments?.inline ?? [];

  if (prLevel.length === 0 && inline.length === 0) {
    return (
      <div className="rc-empty">
        <div className="rc-empty-emoji">🦗</div>
        <div className="rc-empty-text">
          No reviews or bot comments yet on this PR.
        </div>
      </div>
    );
  }

  // Count inline by author so we can show a small "X bots left N inline comments" header.
  const inlineByAuthor = new Map<string, number>();
  for (const c of inline) {
    inlineByAuthor.set(c.author.login, (inlineByAuthor.get(c.author.login) ?? 0) + 1);
  }
  const inlineSummary = Array.from(inlineByAuthor.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="review-activity-pane">
      <div className="rc-activity-toolbar">
        <button
          className="link-btn small"
          onClick={() => setAllCollapsedState(!allCollapsed)}
        >
          {allCollapsed ? '▾ Expand all' : '▸ Collapse all'}
        </button>
        <label className="rc-hide-toggle">
          <input
            type="checkbox"
            checked={hideAll}
            onChange={toggleHideAll}
          />
          Hide review comments in diff
        </label>
      </div>
      {inline.length > 0 && (
        <div className="rc-inline-summary">
          <div className="rc-inline-summary-title">
            {inline.length} inline {inline.length === 1 ? 'comment' : 'comments'} on the diff
          </div>
          <div className="rc-inline-summary-list">
            {inlineSummary.map(([login, count]) => (
              <span key={login} className="rc-inline-pill">
                {login.replace(/\[bot\]$/, '')}
                <span className="rc-inline-pill-count">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="rc-pr-level-list">
        {prLevel.map((c) => (
          <PRLevelCommentCard
            key={c.id}
            comment={c}
            collapsed={isCollapsed(c.id)}
            onToggle={() => toggleOne(c.id)}
          />
        ))}
      </div>
    </div>
  );
}

function PRLevelCommentCard({
  comment,
  collapsed,
  onToggle,
}: {
  comment: PRLevelComment;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const a = comment.author;
  const when = formatRelative(comment.createdAt);
  const preview = comment.body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[#*`>_-]+/g, '')
    .trim()
    .split('\n')[0]
    .slice(0, 100);
  return (
    <div
      className={`rc-pr-card brand-${a.brand ?? 'none'} ${a.type === 'Bot' ? 'is-bot' : ''} ${
        collapsed ? 'collapsed' : ''
      }`}
    >
      <div className="rc-head">
        <button
          type="button"
          className="rc-fold"
          onClick={onToggle}
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <BotAvatar author={a} size={20} />
        <span className="rc-name">{a.login.replace(/\[bot\]$/, '')}</span>
        {a.type === 'Bot' && <span className="rc-bot-tag">bot</span>}
        {comment.reviewState && (
          <span className={`rc-state state-${comment.reviewState.toLowerCase()}`}>
            {formatState(comment.reviewState)}
          </span>
        )}
        {collapsed && preview && <span className="rc-preview">{preview}</span>}
        <span className="rc-when">{when}</span>
        <a
          className="rc-open"
          href={comment.htmlUrl}
          target="_blank"
          rel="noreferrer"
          title="Open in GitHub"
        >
          ↗
        </a>
      </div>
      {!collapsed && (
        <div
          className="rc-body"
          dangerouslySetInnerHTML={{ __html: renderMarkdownish(comment.body) }}
        />
      )}
    </div>
  );
}

function formatState(s: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED'): string {
  if (s === 'APPROVED') return '✓ approved';
  if (s === 'CHANGES_REQUESTED') return '⚠ changes requested';
  return 'commented';
}

function renderMarkdownish(raw: string): string {
  let text = raw.replace(/<!--[\s\S]*?-->/g, '');
  text = text.replace(/<\/?details>/gi, '').replace(/<\/?summary>[^<]*<\/?summary>/gi, '');
  text = text.replace(/<div>[\s\S]*?Fix in Web[\s\S]*?<\/div>/gi, '');
  text = text.replace(/<picture>[\s\S]*?<\/picture>/gi, '');
  text = text.replace(/<img\b[^>]*>/gi, '');
  const escaped = escapeHTML(text);
  return `<p class="rc-p">${escaped
    .replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```/g,
      (_, lang, code) => `<pre class="rc-pre"><code data-lang="${lang}">${code}</code></pre>`)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/^###\s+(.+)$/gm, '<h4 class="rc-h">$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3 class="rc-h">$1</h3>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
    .replace(/\n{2,}/g, '</p><p class="rc-p">')
    .replace(/\n/g, '<br />')}</p>`;
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const delta = Date.now() - t;
  const min = 60 * 1000, hr = 60 * min, day = 24 * hr;
  if (delta < hr) return `${Math.max(1, Math.round(delta / min))}m ago`;
  if (delta < day) return `${Math.round(delta / hr)}h ago`;
  if (delta < 30 * day) return `${Math.round(delta / day)}d ago`;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

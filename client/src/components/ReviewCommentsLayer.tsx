import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useStore } from '../state/store.js';
import { usePrefs } from '../state/preferences.js';
import { BotAvatar } from './BotAvatar.js';
import type { InlineReviewComment, ReviewThread } from '@shared/reviewComments';

interface Props {
  /** The modified-side editor (same one InlineCommentsLayer attaches to). */
  editor: MonacoEditor.ICodeEditor | null;
  filePath: string;
  /** Real → Monaco translator (so we land on the right rendered row). */
  newLineMap?: number[];
}

interface Zone {
  id: string;
  node: HTMLDivElement;
  threads: ReviewThread[];
  line: number; // monaco line where the zone sits
}

const COLLAPSED_CARD_HEIGHT = 32; // header-only row
const MIN_ZONE_HEIGHT = 48;

/**
 * Renders OTHER reviewers' / bots' inline comments as Monaco view zones on
 * the modified side. Comments are read-only (we don't post replies from here).
 * Visually distinct from the user's pending Composer/Thread zones so the
 * reviewer can tell at a glance "this came from elsewhere".
 *
 * Multiple comments on the same line stack inside one view zone, like GitHub.
 */
export function ReviewCommentsLayer({ editor, filePath, newLineMap }: Props) {
  const reviewComments = useStore((s) => s.reviewComments);
  const hideAll = usePrefs((s) => s.hideReviewerComments);
  const threadActions = useStore((s) => s.threadActions);
  const replyToThread = useStore((s) => s.replyToThread);
  const setThreadResolved = useStore((s) => s.setThreadResolved);
  const [zones, setZones] = useState<Zone[]>([]);
  // Per-thread collapse state, keyed by thread id. Defaults to expanded.
  // Lives in component state (not preferences) so it resets per file open —
  // intentional: collapse is a "while I'm reading this" affordance.
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>({});

  const toggleCollapsed = (id: string) =>
    setCollapsedById((c) => ({ ...c, [id]: !c[id] }));

  // Same Monaco-line <-> real-line translation as InlineCommentsLayer.
  const realToMonaco = (realLine: number): number => {
    if (!newLineMap?.length) return realLine;
    const idx = newLineMap.indexOf(realLine);
    return idx >= 0 ? idx + 1 : realLine;
  };

  // Mutable per-zone "current height" so the resize callback can update Monaco
  // without re-running the effect. Lives in a ref to dodge stale closures.
  const zonesRef = useRef<Zone[]>([]);

  useEffect(() => {
    if (!editor || hideAll) return;
    const allThreads = reviewComments?.threads ?? [];

    // Group threads by REAL line for this file. We only render threads on
    // the RIGHT side here — LEFT-side comments would need the old-content
    // editor and aren't visible in the modified pane anyway.
    const groups = new Map<number, ReviewThread[]>();
    for (const t of allThreads) {
      if (t.path !== filePath) continue;
      if (t.side === 'LEFT') continue;
      const arr = groups.get(t.line) ?? [];
      arr.push(t);
      groups.set(t.line, arr);
    }

    const newZones: Zone[] = [];
    const stop = (e: Event) => { e.stopPropagation(); };

    editor.changeViewZones((accessor) => {
      for (const [realLine, threads] of groups) {
        const monacoLine = realToMonaco(realLine);
        const node = document.createElement('div');
        node.className = 'pra-view-zone review';
        node.addEventListener('mousedown', stop);
        node.addEventListener('mouseup', stop);
        node.addEventListener('click', stop);
        node.addEventListener('wheel', stop);
        // Start with a minimal placeholder height; <ZoneSizer> below will
        // call setZoneHeight() once React renders the inner thread and the
        // ResizeObserver measures the real content.
        const id = accessor.addZone({
          afterLineNumber: monacoLine,
          heightInPx: MIN_ZONE_HEIGHT,
          domNode: node,
        });
        newZones.push({ id, node, threads, line: monacoLine });
      }
    });
    zonesRef.current = newZones;
    setZones(newZones);

    return () => {
      editor.changeViewZones((accessor) => {
        for (const z of newZones) accessor.removeZone(z.id);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, filePath, reviewComments, hideAll, JSON.stringify(newLineMap)]);

  // Re-register a zone with a new height. Called by <ZoneSizer> whenever
  // its content measures a different height (fold, unfold, "show more",
  // even the first mount after the placeholder height was registered).
  const setZoneHeight = (zoneIndex: number, height: number) => {
    if (!editor) return;
    const zone = zonesRef.current[zoneIndex];
    if (!zone) return;
    const desired = Math.max(MIN_ZONE_HEIGHT, Math.round(height + 8));
    editor.changeViewZones((accessor) => {
      accessor.removeZone(zone.id);
      const newId = accessor.addZone({
        afterLineNumber: zone.line,
        heightInPx: desired,
        domNode: zone.node,
      });
      zone.id = newId;
    });
  };

  if (hideAll) return null;

  return (
    <>
      {zones.map((z, i) =>
        createPortal(
          <ZoneSizer onHeight={(h) => setZoneHeight(i, h)}>
            <div className="rc-thread">
              {z.threads.map((t) => (
                <ReviewThreadCard
                  key={t.id}
                  thread={t}
                  collapsed={collapsedById[t.id] ?? (t.isResolved || t.isOutdated)}
                  onToggle={() => toggleCollapsed(t.id)}
                  action={threadActions[t.id] ?? { status: 'idle' }}
                  onReply={(body) => replyToThread(t.id, t.replyToId, body)}
                  onResolve={() => setThreadResolved(t.id, !t.isResolved)}
                />
              ))}
            </div>
          </ZoneSizer>,
          z.node,
        ),
      )}
    </>
  );
}

/**
 * Measures its own rendered height and notifies the parent whenever it
 * changes. The ResizeObserver lives on this React-owned element (not the
 * Monaco-sized outer view-zone wrapper, which has its height set externally)
 * so collapsing/expanding cards INSIDE actually triggers a measurement.
 */
function ZoneSizer({
  onHeight,
  children,
}: {
  onHeight: (h: number) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => onHeight(el.scrollHeight);
    measure(); // initial
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);
  return <div ref={ref}>{children}</div>;
}

function ReviewThreadCard({
  thread,
  collapsed,
  onToggle,
  action,
  onReply,
  onResolve,
}: {
  thread: ReviewThread;
  collapsed: boolean;
  onToggle: () => void;
  action: { status: 'idle' | 'pending' | 'error'; message?: string };
  onReply: (body: string) => void;
  onResolve: () => void;
}) {
  const [replyText, setReplyText] = useState('');
  const root = thread.comments[0];
  const a = root.author;
  const pending = action.status === 'pending';
  const headLabel = a.login.replace(/\[bot\]$/, '');
  const preview = root.body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[#*`>_-]+/g, '')
    .trim()
    .split('\n')[0]
    .slice(0, 80);

  function submitReply() {
    const body = replyText.trim();
    if (!body || pending) return;
    onReply(body);
    setReplyText('');
  }

  return (
    <div className={`rc-card brand-${a.brand ?? 'none'} ${a.type === 'Bot' ? 'is-bot' : ''} ${collapsed ? 'collapsed' : ''} ${thread.isResolved ? 'resolved' : ''}`}>
      <div className="rc-head">
        <button type="button" className="rc-fold" onClick={onToggle} title={collapsed ? 'Expand' : 'Collapse'} aria-label={collapsed ? 'Expand thread' : 'Collapse thread'}>
          {collapsed ? '▸' : '▾'}
        </button>
        <BotAvatar author={a} />
        <span className="rc-name">{headLabel}</span>
        {a.type === 'Bot' && <span className="rc-bot-tag">bot</span>}
        {thread.isOutdated && <span className="rc-badge outdated">Outdated</span>}
        {thread.isResolved && <span className="rc-badge resolved">Resolved</span>}
        {thread.comments.length > 1 && <span className="rc-count">{thread.comments.length}</span>}
        {collapsed && preview && <span className="rc-preview">{preview}</span>}
        <span className="rc-when">{formatRelative(root.createdAt)}</span>
        <a className="rc-open" href={root.htmlUrl} target="_blank" rel="noreferrer" title="Open in GitHub">↗</a>
      </div>

      {!collapsed && (
        <>
          {thread.comments.map((c) => (
            <div key={c.id} className="rc-comment">
              <div className="rc-comment-head">
                <BotAvatar author={c.author} size={16} />
                <span className="rc-name">{c.author.login.replace(/\[bot\]$/, '')}</span>
                <span className="rc-when">{formatRelative(c.createdAt)}</span>
              </div>
              <div className="rc-body" dangerouslySetInnerHTML={{ __html: renderMarkdownish(c.body) }} />
            </div>
          ))}

          <div className="rc-thread-actions">
            <button type="button" className="rc-resolve-btn" onClick={onResolve} disabled={pending}>
              {thread.isResolved ? 'Unresolve' : 'Resolve conversation'}
            </button>
          </div>

          <div className="rc-reply">
            <textarea
              className="rc-reply-input"
              placeholder="Reply…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              disabled={pending}
              rows={2}
            />
            <button type="button" className="rc-reply-btn" onClick={submitReply} disabled={pending || !replyText.trim()}>
              {pending ? 'Posting…' : 'Reply'}
            </button>
          </div>

          {action.status === 'error' && (
            <div className="rc-action-error">⚠ {action.message ?? 'Action failed.'}</div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Light markdown rendering — enough to make bot comments readable without
 * pulling in a full markdown lib. Bots emit very structured HTML/markdown
 * mixes; we strip dangerous tags via escape, then re-enable the safe
 * subset (bold, italic, inline code, code fences, links, simple line
 * breaks, headings).
 */
function renderMarkdownish(raw: string): string {
  // Trim Cursor BugBot's "<!-- DESCRIPTION START -->" wrappers and similar
  // HTML comments — they're just internal markers.
  let text = raw.replace(/<!--[\s\S]*?-->/g, '');

  // Strip <details> blocks' chrome but keep the inner text. Bots use them
  // for "Additional Locations" etc.; the content is the useful bit.
  text = text.replace(/<\/?details>/gi, '').replace(/<\/?summary>[^<]*<\/?summary>/gi, '');

  // Pull out the Cursor "Fix in Cursor" image blob — it's noise inside our card.
  text = text.replace(/<div>[\s\S]*?Fix in Web[\s\S]*?<\/div>/gi, '');
  text = text.replace(/<picture>[\s\S]*?<\/picture>/gi, '');

  // Strip raw <img> for safety + density.
  text = text.replace(/<img\b[^>]*>/gi, '');

  // HTML-escape everything we're about to render — we'll re-introduce the
  // safe subset below.
  const escaped = escapeHTML(text);

  // Now apply small markdown.
  let html = escaped
    // Fenced code blocks ```lang\n...\n```
    .replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)\n```/g, (_, lang, code) => {
      return `<pre class="rc-pre"><code data-lang="${lang}">${code}</code></pre>`;
    })
    // Inline code `…`
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    // Bold **…**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic _…_
    .replace(/(^|[^_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>')
    // Headings ### / ##
    .replace(/^###\s+(.+)$/gm, '<h4 class="rc-h">$1</h4>')
    .replace(/^##\s+(.+)$/gm, '<h3 class="rc-h">$1</h3>')
    // Auto-link bare URLs
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
    // Paragraph breaks
    .replace(/\n{2,}/g, '</p><p class="rc-p">')
    // Single line breaks
    .replace(/\n/g, '<br />');

  return `<p class="rc-p">${html}</p>`;
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
  // Older — fall back to date.
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

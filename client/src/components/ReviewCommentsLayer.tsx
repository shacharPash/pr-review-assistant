import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useStore } from '../state/store.js';
import { BotAvatar } from './BotAvatar.js';
import type { InlineReviewComment } from '@shared/reviewComments';

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
  comments: InlineReviewComment[];
  line: number; // monaco line where the zone sits
}

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
  const [zones, setZones] = useState<Zone[]>([]);

  // Same Monaco-line <-> real-line translation as InlineCommentsLayer.
  const realToMonaco = (realLine: number): number => {
    if (!newLineMap?.length) return realLine;
    const idx = newLineMap.indexOf(realLine);
    return idx >= 0 ? idx + 1 : realLine;
  };

  useEffect(() => {
    if (!editor) return;
    const inline = reviewComments?.inline ?? [];

    // Group comments by REAL line for this file. We only render comments on
    // the RIGHT side here — LEFT-side comments would need the old-content
    // editor and aren't visible in the modified pane anyway.
    const groups = new Map<number, InlineReviewComment[]>();
    for (const c of inline) {
      if (c.path !== filePath) continue;
      if (c.side === 'LEFT') continue;
      const arr = groups.get(c.line) ?? [];
      arr.push(c);
      groups.set(c.line, arr);
    }

    const newZones: Zone[] = [];
    const stop = (e: Event) => { e.stopPropagation(); };

    editor.changeViewZones((accessor) => {
      for (const [realLine, comments] of groups) {
        const monacoLine = realToMonaco(realLine);
        const node = document.createElement('div');
        node.className = 'pra-view-zone review';
        node.addEventListener('mousedown', stop);
        node.addEventListener('mouseup', stop);
        node.addEventListener('click', stop);
        node.addEventListener('wheel', stop);
        // Height grows with comment count; cap at 320 so a long chain doesn't
        // dominate the screen — overflow scrolls inside the zone.
        const heightInPx = Math.min(320, 80 + comments.length * 110);
        const id = accessor.addZone({
          afterLineNumber: monacoLine,
          heightInPx,
          domNode: node,
        });
        newZones.push({ id, node, comments, line: monacoLine });
      }
    });
    setZones(newZones);

    return () => {
      editor.changeViewZones((accessor) => {
        for (const z of newZones) accessor.removeZone(z.id);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, filePath, reviewComments, JSON.stringify(newLineMap)]);

  return (
    <>
      {zones.map((z) =>
        createPortal(
          <div className="rc-thread">
            {z.comments.map((c) => (
              <ReviewCommentCard key={c.id} comment={c} />
            ))}
          </div>,
          z.node,
        ),
      )}
    </>
  );
}

function ReviewCommentCard({ comment }: { comment: InlineReviewComment }) {
  const a = comment.author;
  const when = formatRelative(comment.createdAt);
  return (
    <div className={`rc-card brand-${a.brand ?? 'none'} ${a.type === 'Bot' ? 'is-bot' : ''}`}>
      <div className="rc-head">
        <BotAvatar author={a} />
        <span className="rc-name">{a.login.replace(/\[bot\]$/, '')}</span>
        {a.type === 'Bot' && <span className="rc-bot-tag">bot</span>}
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
      <div className="rc-body" dangerouslySetInnerHTML={{ __html: renderMarkdownish(comment.body) }} />
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

import React, { Fragment, type ReactNode } from 'react';

/** Only web links are navigable. Raw HTML always remains text. */
export function safeHref(value: string): string | undefined {
  if (/[\u0000-\u0020\u007f<>"'`\\]/.test(value)) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Parse original text once, never generated HTML or code contents. */
export function SafeInline({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const tokens = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]\n]+)\]\(([^\s)]+)\)|https?:\/\/[^\s<>"'`]+|\n/g;
  let offset = 0;
  for (const match of text.matchAll(tokens)) {
    const start = match.index!;
    if (start > offset) parts.push(text.slice(offset, start));
    const [raw, code, bold, italic, underscore, label, destination] = match;
    let node: ReactNode;
    if (code !== undefined) node = <code>{code}</code>;
    else if (bold !== undefined) node = <strong>{bold}</strong>;
    else if (italic !== undefined || underscore !== undefined) node = <em>{italic ?? underscore}</em>;
    else if (raw === '\n') node = <br />;
    else {
      const urlText = destination ?? raw.replace(/[.,;:!?)}\]]+$/, '');
      const href = safeHref(urlText);
      node = href
        ? <><a href={href} target="_blank" rel="noopener noreferrer">{label ?? urlText}</a>{destination ? '' : raw.slice(urlText.length)}</>
        : raw;
    }
    parts.push(<Fragment key={start}>{node}</Fragment>);
    offset = start + raw.length;
  }
  if (offset < text.length) parts.push(text.slice(offset));
  return <>{parts}</>;
}

/** Deliberately small markdown subset. No raw HTML, images or executable URLs. */
export function SafeMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      const key = i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push(<pre className="rc-pre" key={key}><code data-lang={fence[1]}>{code.join('\n')}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push(<h4 className="rc-h" key={i}><SafeInline text={heading[2]} /></h4>);
      i++;
      continue;
    }
    if (/^[-*+]\s+/.test(line)) {
      const key = i;
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        items.push(<li key={i}><SafeInline text={lines[i++].replace(/^[-*+]\s+/, '')} /></li>);
      }
      blocks.push(<ul key={key}>{items}</ul>);
      continue;
    }
    const key = i;
    const paragraph = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !/^(?:```|#{1,3}\s|[-*+]\s)/.test(lines[i])) paragraph.push(lines[i++]);
    blocks.push(<p className="rc-p" key={key}><SafeInline text={paragraph.join('\n')} /></p>);
  }
  return <>{blocks}</>;
}

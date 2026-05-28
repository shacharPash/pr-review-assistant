import { useEffect } from 'react';
import type { editor as MonacoEditor, IDisposable, languages } from 'monaco-editor';
import type { BlameRange } from '@shared/types';

interface Props {
  /** The modified-side editor or single editor (for added/deleted files). */
  editor: MonacoEditor.ICodeEditor | null;
  ranges: BlameRange[] | null;
}

/** Registers a Monaco hover provider that surfaces blame info for any line. */
export function BlameHoverProvider({ editor, ranges }: Props) {
  useEffect(() => {
    if (!editor || !ranges || ranges.length === 0) return;
    const model = editor.getModel();
    if (!model) return;
    const m = (window as { monaco?: typeof import('monaco-editor') }).monaco;
    if (!m) return;

    const provider: languages.HoverProvider = {
      provideHover: (hoveredModel, position) => {
        if (hoveredModel.uri.toString() !== model.uri.toString()) return null;
        const lineNumber = position.lineNumber;
        const range = ranges.find(
          (r) => lineNumber >= r.startingLine && lineNumber <= r.endingLine,
        );
        if (!range) return null;

        const author = range.authorLogin
          ? `@${range.authorLogin}`
          : range.authorName ?? '(unknown)';
        const when = relativeAge(range.authoredDate);
        const shortSha = range.commitSha.slice(0, 7);
        const headline = range.commitMessageHeadline.replace(/\|/g, '\\|');

        return {
          range: new m.Range(lineNumber, 1, lineNumber, 1),
          contents: [
            { value: `**${author}** · ${when}` },
            { value: headline },
            { value: `[${shortSha} on GitHub](${range.commitUrl})`, isTrusted: true },
          ],
        };
      },
    };

    // Register on the model's language so it only applies where this editor
    // is showing this file.
    const langId = model.getLanguageId();
    const dispose: IDisposable = m.languages.registerHoverProvider(langId, provider);
    return () => dispose.dispose();
  }, [editor, ranges]);

  return null;
}

function relativeAge(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'unknown time';
  const diff = Date.now() - then;
  const day = 86_400_000;
  const days = Math.floor(diff / day);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365 * 2) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

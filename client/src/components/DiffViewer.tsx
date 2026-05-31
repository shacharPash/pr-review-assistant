import { DiffEditor, Editor } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useEffect, useRef, useState } from 'react';
import type { DiffFile, BlameRange } from '@shared/types';
import { fileContentFor, useStore } from '../state/store.js';
import { monacoThemeFor, usePrefs } from '../state/preferences.js';
import { InlineCommentsLayer } from './InlineCommentsLayer.js';
import { ReviewCommentsLayer } from './ReviewCommentsLayer.js';
import { BlameResizer } from './BlameResizer.js';
import { BlameHoverProvider } from './BlameHoverProvider.js';

interface Props {
  file: DiffFile | null;
  position: { index: number; total: number } | null;
}

export function DiffViewer({ file, position }: Props) {
  const showNoise = useStore((s) => s.showNoise);
  const toggleNoise = useStore((s) => s.toggleNoise);
  const fullEntry = useStore((s) => (file ? s.fullContent[file.path] : undefined));
  const blameEntry = useStore((s) => (file ? s.blame[file.path] : undefined));
  const theme = usePrefs((s) => s.theme);
  const viewMode = usePrefs((s) => s.viewMode);
  const hideReviewerComments = usePrefs((s) => s.hideReviewerComments);
  const toggleHideReviewerComments = usePrefs((s) => s.toggleHideReviewerComments);
  const blameWidth = usePrefs((s) => s.blameWidth);
  const setBlameWidth = usePrefs((s) => s.setBlameWidth);
  const reviewComments = useStore((s) => s.reviewComments);
  const reviewerCountOnFile = reviewComments?.inline.filter((c) => c.path === file?.path).length ?? 0;
  const expansions = useStore((s) => (file ? s.hunkExpansions[file.path] : undefined)) ?? {};
  const expandHunk = useStore((s) => s.expandHunk);
  const [commentEditor, setCommentEditor] = useState<MonacoEditor.ICodeEditor | null>(null);
  const [blameVisible, setBlameVisible] = useState(false);

  // When the active file changes, dispose the inline composer.
  const closeComposer = useStore((s) => s.closeComposer);
  useEffect(() => {
    closeComposer();
  }, [file?.path, closeComposer]);

  if (!file) {
    return (
      <div className="diff-pane">
        <div className="diff-placeholder">
          <div>
            <div className="big">Select a file from the sidebar</div>
            <div>Or press <span className="kbd-hint">j</span> / <span className="kbd-hint">k</span> to navigate.</div>
          </div>
        </div>
      </div>
    );
  }

  const isNewFile = file.status === 'added';
  const isDeleted = file.status === 'removed';
  const lang = languageFor(file.path);
  const monacoTheme = monacoThemeFor(theme);

  const noiseHunkCount = file.hunks.filter((h) => h.noise).length;
  const blameReady = blameEntry?.status === 'ready' && blameEntry.ranges.length > 0;
  const canUseFull = noiseHunkCount === 0 || showNoise;
  const fullReady = fullEntry?.status === 'ready';
  const loadingFull = fullEntry?.status === 'loading';
  const hasFull = fullReady && canUseFull;
  const {
    oldContent: hunkOld,
    newContent: hunkNew,
    oldLineMap,
    newLineMap,
    hunkBoundaries,
  } = fileContentFor(
    file,
    showNoise,
    expansions,
    fullReady ? { oldContent: fullEntry!.oldContent, newContent: fullEntry!.newContent } : undefined,
  );
  const oldContent = hasFull ? (fullEntry!.oldContent ?? '') : hunkOld;
  const newContent = hasFull ? (fullEntry!.newContent ?? '') : hunkNew;

  const [otherEditor, setOtherEditor] = useState<MonacoEditor.ICodeEditor | null>(null);

  const handleDiffMount = (editor: MonacoEditor.IStandaloneDiffEditor) => {
    setCommentEditor(editor.getModifiedEditor());
    setOtherEditor(editor.getOriginalEditor());
  };

  const handleSingleMount = (editor: MonacoEditor.IStandaloneCodeEditor) => {
    setCommentEditor(editor);
    setOtherEditor(null);
  };

  // Decoration management for blame age colors. When blame mode is on we
  // tint each line's gutter (via `lineNumberClassName`) by how old the line
  // is. Decorations are cleared when blame is off.
  const decorationsRef = useRef<string[]>([]);
  useEffect(() => {
    if (!commentEditor) return;
    const m = (window as { monaco?: typeof import('monaco-editor') }).monaco;
    if (!m) return;

    if (!(blameVisible && blameReady) || !blameEntry) {
      decorationsRef.current = commentEditor.deltaDecorations(decorationsRef.current, []);
      return;
    }
    const decos = blameEntry.ranges.map((r) => ({
      range: new m.Range(r.startingLine, 1, r.endingLine, 1),
      options: {
        lineNumberClassName: ageBucketClass(r.authoredDate),
        isWholeLine: true,
      },
    }));
    decorationsRef.current = commentEditor.deltaDecorations(decorationsRef.current, decos);
    return () => {
      if (commentEditor && !commentEditor.getModel()?.isDisposed?.()) {
        decorationsRef.current = commentEditor.deltaDecorations(decorationsRef.current, []);
      }
    };
  }, [commentEditor, blameVisible, blameReady, blameEntry]);

  // Effect-based line-numbers control: combines (hunks-only line map) +
  // (optional blame annotation). Recomputes whenever any input changes.
  useEffect(() => {
    if (!commentEditor) return;

    // Monaco-line → real file line. Identity in full-file mode where the
    // editor model IS the file; otherwise via newLineMap which knows the
    // hunk-and-context layout. Returns 0 for separator rows (between
    // hidden hunks) so the caller can render a `⋯` marker.
    const toRealLine = hasFull
      ? (n: number) => n
      : (n: number) => newLineMap[n - 1] ?? 0;

    const blameOn = blameVisible && blameReady;
    const blameFn = blameOn
      ? makeBlameLineNumbers(blameEntry!.ranges, toRealLine, blameWidth)
      : null;

    const modifiedLineNumbers = blameFn
      ? blameFn
      : (n: number) => {
          if (hasFull) return String(n);
          const real = newLineMap[n - 1];
          // Separator rows between hidden hunks show `⋯` so the reader
          // sees the discontinuity instead of an unexplained blank line.
          return real ? String(real) : '⋯';
        };

    // Gutter width is 4 when blame is OFF (just the line number), and
    // matches the user's chosen blame width when ON. We only reserve
    // those wide chars when actually showing blame — solves the
    // "empty stripe when blame is off" problem.
    commentEditor.updateOptions({
      lineNumbers: modifiedLineNumbers,
      lineNumbersMinChars: blameOn ? blameWidth : 4,
    });

    if (otherEditor) {
      otherEditor.updateOptions({
        lineNumbers: (n: number) => {
          if (hasFull) return String(n);
          const real = oldLineMap[n - 1];
          return real ? String(real) : '⋯';
        },
        // Original side doesn't render blame — keep it narrow.
        lineNumbersMinChars: 4,
      });
    }
    // Single-editor mode (added/deleted file)
    if (!otherEditor && isDeleted && !hasFull) {
      commentEditor.updateOptions({
        lineNumbers: (n: number) => {
          const real = oldLineMap[n - 1];
          return real ? String(real) : '⋯';
        },
      });
    }

    // Force a full layout pass so Monaco fully re-paints the gutter
    // instead of doing an in-place incremental patch.
    commentEditor.layout();
    otherEditor?.layout();
  }, [commentEditor, otherEditor, blameVisible, blameReady, blameEntry, hasFull, newLineMap, oldLineMap, isDeleted, blameWidth]);

  // Context-expansion content widgets — small "↑ 10 more" / "↓ 10 more"
  // buttons that splice file context into each hunk on click. Skipped in
  // full-file mode (the surrounding context is already there).
  const expandWidgetsRef = useRef<unknown[]>([]);
  useEffect(() => {
    if (!commentEditor) return;
    // Remove any previously-attached widgets first (otherwise stale ones from
    // a prior render with a different hunk count would stack up).
    for (const w of expandWidgetsRef.current) {
      commentEditor.removeContentWidget(w as Parameters<typeof commentEditor.removeContentWidget>[0]);
    }
    expandWidgetsRef.current = [];
    if (hasFull || !fullReady || !file) return;

    const newWidgets: unknown[] = [];
    hunkBoundaries.forEach((b) => {
      // Top-of-hunk widget: "↑ Expand"
      if (b.canExpandAbove > 0) {
        const node = document.createElement('div');
        node.className = 'expand-context-btn';
        node.innerHTML = `<span class="ec-icon">↑</span><span>Expand ${Math.min(10, b.canExpandAbove)}${b.canExpandAbove > 10 ? '' : ' (last)'}</span>`;
        node.title = `${b.canExpandAbove} more lines available above this hunk`;
        node.onclick = (e) => {
          e.stopPropagation();
          expandHunk(file.path, b.hunkIdx, 'above', 10);
        };
        const widget = {
          getId: () => `pra.expand-above.${b.hunkIdx}`,
          getDomNode: () => node,
          getPosition: () => ({
            position: { lineNumber: b.monacoStartLine, column: 1 },
            preference: [1 /* ABOVE */],
          }),
        };
        commentEditor.addContentWidget(widget as Parameters<typeof commentEditor.addContentWidget>[0]);
        newWidgets.push(widget);
      }
      // Bottom-of-hunk widget: "↓ Expand"
      if (b.canExpandBelow > 0) {
        const node = document.createElement('div');
        node.className = 'expand-context-btn';
        node.innerHTML = `<span class="ec-icon">↓</span><span>Expand ${Math.min(10, b.canExpandBelow)}${b.canExpandBelow > 10 ? '' : ' (last)'}</span>`;
        node.title = `${b.canExpandBelow} more lines available below this hunk`;
        node.onclick = (e) => {
          e.stopPropagation();
          expandHunk(file.path, b.hunkIdx, 'below', 10);
        };
        const widget = {
          getId: () => `pra.expand-below.${b.hunkIdx}`,
          getDomNode: () => node,
          getPosition: () => ({
            position: { lineNumber: b.monacoEndLine, column: 1 },
            preference: [2 /* BELOW */],
          }),
        };
        commentEditor.addContentWidget(widget as Parameters<typeof commentEditor.addContentWidget>[0]);
        newWidgets.push(widget);
      }
    });
    expandWidgetsRef.current = newWidgets;

    return () => {
      for (const w of newWidgets) {
        if (!commentEditor.getModel()?.isDisposed?.()) {
          commentEditor.removeContentWidget(w as Parameters<typeof commentEditor.removeContentWidget>[0]);
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentEditor, hasFull, fullReady, file?.path, JSON.stringify(hunkBoundaries)]);

  return (
    <div className="diff-pane">
      <div className="diff-context">
        {position && (
          <span className="position">
            {position.index + 1} / {position.total}
          </span>
        )}
        <span className="file-path">{file.path}</span>
        <div className="badges">
          {isNewFile && <span className="badge new">NEW FILE</span>}
          {isDeleted && <span className="badge removed">DELETED</span>}
          {file.status === 'renamed' && <span className="badge renamed">RENAMED</span>}
          <span className="badge" style={{ background: 'var(--added-soft)', color: 'var(--added)' }}>+{file.additions}</span>
          <span className="badge" style={{ background: 'var(--removed-soft)', color: 'var(--removed)' }}>−{file.deletions}</span>
        </div>
        {loadingFull && <span className="context-status">loading full context…</span>}
        {hasFull && <span className="context-status ready" title="Full file loaded — expand context above/below changes">full file</span>}
        {blameReady && (
          <button
            type="button"
            className={`blame-toggle ${blameVisible ? 'on' : ''}`}
            onClick={() => setBlameVisible((v) => !v)}
            title={
              blameVisible
                ? 'Hide blame annotations'
                : 'Show git blame: who last touched each line'
            }
          >
            <span className="blame-toggle-icon">👤</span>
            <span>{blameVisible ? 'Blame on' : 'Blame'}</span>
          </button>
        )}
        {reviewerCountOnFile > 0 && (
          <button
            type="button"
            className={`blame-toggle bots ${hideReviewerComments ? '' : 'on'}`}
            onClick={toggleHideReviewerComments}
            title={
              hideReviewerComments
                ? `Show ${reviewerCountOnFile} review comment${reviewerCountOnFile === 1 ? '' : 's'} (bots + humans) on this file`
                : `Hide review comments (bots + humans) on the diff. Still visible in the Activity tab.`
            }
          >
            <span className="blame-toggle-icon">💬</span>
            <span>
              {hideReviewerComments ? 'Reviews hidden' : `Reviews ${reviewerCountOnFile}`}
            </span>
          </button>
        )}
        {noiseHunkCount > 0 && (
          <span className="noise-banner">
            {showNoise ? `${noiseHunkCount} noise hunk${noiseHunkCount > 1 ? 's' : ''} shown` : `${noiseHunkCount} noise hunk${noiseHunkCount > 1 ? 's' : ''} hidden`}{' '}
            <button className="link-btn" onClick={toggleNoise}>
              {showNoise ? 'hide' : 'show'}
            </button>
          </span>
        )}
      </div>

      {file.binary ? (
        <div className="diff-placeholder">
          <div>
            <div className="big">Binary file</div>
            <div>Diff not shown.</div>
          </div>
        </div>
      ) : file.noise && !showNoise ? (
        <div className="diff-placeholder">
          <div>
            <div className="big">Hidden as {file.noise}</div>
            <div>This file usually adds noise without changing behavior.</div>
            <div style={{ marginTop: 12 }}>
              <button className="link-btn" onClick={toggleNoise}>Show anyway</button>
            </div>
          </div>
        </div>
      ) : isNewFile ? (
        <div className="diff-monaco">
          <Editor
            height="100%"
            value={newContent}
            language={lang}
            theme={monacoTheme}
            options={editorOptions}
            onMount={handleSingleMount}
          />
        </div>
      ) : isDeleted ? (
        <div className="diff-monaco">
          <Editor
            height="100%"
            value={oldContent}
            language={lang}
            theme={monacoTheme}
            options={editorOptions}
            onMount={handleSingleMount}
          />
        </div>
      ) : (
        <div className="diff-monaco">
          <DiffEditor
            key={`${file.path}:${hasFull ? 'full' : 'hunks'}:${viewMode}`}
            height="100%"
            original={oldContent}
            modified={newContent}
            language={lang}
            theme={monacoTheme}
            options={{
              ...editorOptions,
              renderSideBySide: viewMode === 'split',
              ignoreTrimWhitespace: false,
              hideUnchangedRegions: hasFull
                ? {
                    enabled: true,
                    contextLineCount: 3,
                    minimumLineCount: 4,
                    revealLineCount: 10,
                  }
                : { enabled: false },
            }}
            onMount={handleDiffMount}
          />
        </div>
      )}
      <InlineCommentsLayer
        editor={commentEditor}
        filePath={file.path}
        newLineMap={hasFull ? undefined : newLineMap}
      />
      <ReviewCommentsLayer
        editor={commentEditor}
        filePath={file.path}
        newLineMap={hasFull ? undefined : newLineMap}
      />
      <BlameResizer
        width={blameWidth}
        setWidth={setBlameWidth}
        visible={blameVisible && blameReady}
      />
      <BlameHoverProvider
        editor={commentEditor}
        ranges={hasFull && blameEntry?.status === 'ready' ? blameEntry.ranges : null}
      />
    </div>
  );
}

const editorOptions = {
  readOnly: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 13,
  fontFamily: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace',
  lineNumbers: 'on' as const,
  renderLineHighlight: 'none' as const,
  wordWrap: 'off' as const,
  smoothScrolling: true,
  padding: { top: 12, bottom: 12 },
  // Right-click is enabled by default; the addAction above appears in that menu.
};

/**
 * Builds a Monaco line-numbers function that prefixes the line number with
 * `DD/MM/YYYY  AUTHOR  N` from blame data — IntelliJ-style gutter annotation.
 *
 * Fixed column widths (date 10ch, author 12ch, line number 4ch) keep the
 * three "columns" aligned. Long handles get ellipsised to 11ch + "…".
 * Lines without a matching blame range still get padded so the gutter stays
 * the same width and Monaco doesn't truncate.
 */
/**
 * Author field width chosen to fit ~98% of real GitHub handles without
 * truncation. Truncation uses ASCII ".." (not Unicode "…") because some
 * monospace fonts render the single-char ellipsis at a different glyph
 * width — that was causing rows with truncated names to shift by ~1px,
 * breaking column alignment.
 */
const BLAME_LINENUM_WIDTH = 4;
// Non-breaking spaces — HTML collapses runs of regular spaces, which made the
// columns shift visually depending on name length. NBSP keeps every column at
// the exact same pixel position regardless of how short or long the name is.
const NBSP = ' ';
const BLAME_SEP = NBSP.repeat(2);

/**
 * Pick the date+author layout for a given total gutter width (in chars).
 * As space shrinks we sacrifice date precision first, then author width.
 *
 * Width budget = date + (2 sep, when date present) + author + 2 sep + 4 line#.
 */
interface BlameFormat {
  dateChars: 10 | 7 | 4 | 0;
  authorWidth: number;
}
function blameFormatFor(totalWidth: number): BlameFormat {
  // Layout overhead per format (sep + sep + line#):
  //   with date    → dateChars + 2 + 2 + 4 = dateChars + 8
  //   without date →             2 + 4    = 6
  // Whatever remains goes to the author column. Author grows when you drag
  // the gutter wider; shrinks (then truncates) when you drag narrower.
  if (totalWidth >= 28) return { dateChars: 10, authorWidth: Math.max(4, totalWidth - 18) };
  if (totalWidth >= 25) return { dateChars: 7,  authorWidth: Math.max(4, totalWidth - 15) };
  if (totalWidth >= 22) return { dateChars: 4,  authorWidth: Math.max(4, totalWidth - 12) };
  // Below 22 we drop the date entirely.
  return { dateChars: 0, authorWidth: Math.max(4, totalWidth - 6) };
}

/**
 * Build the gutter callback for blame mode.
 *
 * `toRealLine(n)` converts Monaco's row number to the file's real line
 * number, so the blame range lookup matches the right commit even in
 * hunks-only mode (where Monaco line ≠ real file line). Returns 0 for
 * separator rows between hidden hunks; we render `⋯` there instead of a
 * fake blame entry.
 *
 * The displayed line number is also the REAL file line (consistent with
 * what the gutter shows when blame is OFF).
 */
function makeBlameLineNumbers(
  ranges: BlameRange[],
  toRealLine: (n: number) => number,
  width: number,
): (n: number) => string {
  const fmt = blameFormatFor(width);
  const hasDate = fmt.dateChars > 0;
  const emptyDate = NBSP.repeat(fmt.dateChars);
  const emptyAuthor = NBSP.repeat(fmt.authorWidth);
  const dateSep = hasDate ? BLAME_SEP : '';
  const GAP_LINENUM = '⋯'.padStart(BLAME_LINENUM_WIDTH, NBSP);

  return (n: number) => {
    const realLine = toRealLine(n);
    if (realLine === 0) {
      return `${emptyDate}${dateSep}${emptyAuthor}${BLAME_SEP}${GAP_LINENUM}`;
    }
    const lineNum = String(realLine).padStart(BLAME_LINENUM_WIDTH, NBSP);
    const r = ranges.find((x) => realLine >= x.startingLine && realLine <= x.endingLine);
    if (!r) return `${emptyDate}${dateSep}${emptyAuthor}${BLAME_SEP}${lineNum}`;
    const date = formatBlameDate(r.authoredDate, fmt.dateChars);
    const who = shortAuthorPadded(r.authorName, r.authorLogin, fmt.authorWidth);
    return `${date}${dateSep}${who}${BLAME_SEP}${lineNum}`;
  };
}

/**
 * Picks the most readable short label for the author. Prefers the LAST
 * token of the commit's full name ("Shay Berman" → "Berman") so the
 * gutter shows IntelliJ-style surnames instead of long GitHub handles.
 * Falls back to the full name, then the login. LEFT-aligns the result so
 * the name always starts at the same column (right side may vary, which is
 * fine — IntelliJ does the same).
 */
function shortAuthorPadded(name: string | null, login: string | null, width: number): string {
  let label = '?';
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).filter((p) => p.length > 0);
    // Use the last token if it's reasonably "name-like" (≥ 2 chars and not
    // obviously a suffix like "Jr").
    const last = parts[parts.length - 1];
    if (last && last.length >= 2 && !/^(jr|sr|iii?|iv)\.?$/i.test(last)) {
      label = last;
    } else {
      label = name.trim();
    }
  } else if (login) {
    label = login;
  }

  // Replace ASCII hyphens with U+2011 NON-BREAKING HYPHEN. Visually
  // identical, but Monaco's gutter would otherwise treat the hyphen as
  // a soft word-break boundary, splitting names like "matan-meshi" so
  // only the "meshi" half ended up rendered on certain rows. With a
  // non-breaking hyphen the name stays one token and renders intact.
  label = label.replace(/-/g, '‑');

  if (label.length === width) return label;
  if (label.length < width) return label.padEnd(width, NBSP);
  return label.slice(0, width - 2) + '..';
}

function formatBlameDate(iso: string | null | undefined, dateChars: 10 | 7 | 4 | 0): string {
  if (dateChars === 0) return '';
  // Visible "we don't know" placeholder for the rare case GitHub returns
  // no authoredDate. Beats blank spaces that look like a render bug.
  const unknown = dateChars === 10 ? '??/??/????' : dateChars === 7 ? '??/????' : '????';
  if (!iso) return unknown;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return unknown;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  switch (dateChars) {
    case 10: return `${dd}/${mm}/${yyyy}`;
    case 7:  return `${mm}/${yyyy}`;
    case 4:  return yyyy;
  }
}

/**
 * Age buckets for blame coloring — IntelliJ-style gradient.
 * Returns a CSS class name; the CSS rule on each class sets the
 * background of the line-number gutter via `lineNumberClassName`.
 */
/**
 * Calibrated to match IntelliJ's blame coloring on real repos:
 * recent commits read GREEN, multi-year-old code reads BROWN-RED. The
 * fresh tier (≤ 90 days) marks "this PR's work" prominently; the
 * ancient tier (7y+) is the deepest red.
 */
function ageBucketClass(iso: string): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'blame-age-unknown';
  const days = (Date.now() - ts) / 86_400_000;
  if (days < 90)        return 'blame-age-fresh';
  if (days < 365)       return 'blame-age-recent';
  if (days < 365 * 3)   return 'blame-age-moderate';
  if (days < 365 * 7)   return 'blame-age-old';
  return 'blame-age-ancient';
}

function languageFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'java': return 'java';
    case 'kt': return 'kotlin';
    case 'ts': case 'tsx': return 'typescript';
    case 'js': case 'jsx': return 'javascript';
    case 'json': return 'json';
    case 'xml': return 'xml';
    case 'yml': case 'yaml': return 'yaml';
    case 'md': return 'markdown';
    case 'py': return 'python';
    case 'sql': return 'sql';
    case 'sh': return 'shell';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'rb': return 'ruby';
    case 'css': case 'scss': return 'css';
    case 'html': return 'html';
    default: return 'plaintext';
  }
}

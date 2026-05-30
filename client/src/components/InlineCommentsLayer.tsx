import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor';
import { useStore, type LineComment } from '../state/store.js';

interface Props {
  /** The modified-side editor (or the single editor for new/deleted files). */
  editor: MonacoEditor.ICodeEditor | null;
  filePath: string;
  /**
   * Map from Monaco line number → real file line on the modified side.
   * When noise is hidden, Monaco shows fewer lines than the file has,
   * so we must translate between the two coordinate systems for storage
   * (real lines) and placement (Monaco lines). Empty / undefined = identity.
   */
  newLineMap?: number[];
}

interface ZoneEntry {
  id: string;
  line: number;
  node: HTMLDivElement;
  kind: 'thread' | 'composer';
}

/**
 * GitHub-style inline comments for Monaco. Provides:
 * - A `+` button that follows the hovered line in the gutter
 * - View zones beneath commented lines showing the thread
 * - A view zone for the open composer
 * Comments are stored in the global store; this component is pure UI.
 */
export function InlineCommentsLayer({ editor, filePath, newLineMap }: Props) {
  // Translation helpers — both default to identity when no map is provided
  // (full-file mode, where Monaco lines === real file lines).
  const monacoToReal = (monacoLine: number): number => {
    if (!newLineMap?.length) return monacoLine;
    const real = newLineMap[monacoLine - 1];
    return real && real > 0 ? real : monacoLine;
  };
  const realToMonaco = (realLine: number): number => {
    if (!newLineMap?.length) return realLine;
    const idx = newLineMap.indexOf(realLine);
    return idx >= 0 ? idx + 1 : realLine;
  };
  const lineComments = useStore((s) => s.lineComments[filePath] ?? {});
  const composerTarget = useStore((s) => s.composerTarget);
  const openComposer = useStore((s) => s.openComposer);
  const closeComposer = useStore((s) => s.closeComposer);
  const setLineComment = useStore((s) => s.setLineComment);
  const removeLineComment = useStore((s) => s.removeLineComment);

  const [zones, setZones] = useState<ZoneEntry[]>([]);
  const addBtnRef = useRef<HTMLButtonElement | null>(null);
  const currentHoverLine = useRef<number>(0);

  // ---- "+" button as a Monaco content widget pinned to the hovered line ----
  // Content widgets are positioned by Monaco using line/column, so the button
  // sits exactly next to the line, no manual coordinate math required.
  useEffect(() => {
    if (!editor) return;

    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'pra-add-comment-btn';
    node.innerHTML = '+';
    node.title = 'Add a comment on this line (or selected range)';

    let currentLine = 0;
    let currentEndLine = 0;
    let visible = false;

    const widget = {
      getId: () => 'pra.add-comment-widget',
      getDomNode: () => node,
      getPosition: () => {
        if (!visible || currentLine === 0) return null;
        return {
          position: { lineNumber: currentLine, column: 1 },
          preference: [0 /* EXACT */],
        };
      },
    } as MonacoEditor.IContentWidget;

    editor.addContentWidget(widget);

    // Click-and-drag-to-extend: mousedown on +, drag up/down to grow the
    // line range live (and reveal a soft highlight), mouseup opens the
    // composer with that range.
    let dragging = false;
    let dragAnchorLine = 0;
    let dragEndLine = 0;
    let dragDecorations: string[] = [];
    const m = (window as { monaco?: typeof import('monaco-editor') }).monaco;

    const updateDragDecorations = (start: number, end: number) => {
      if (!m) return;
      const a = Math.min(start, end);
      const b = Math.max(start, end);
      dragDecorations = editor.deltaDecorations(dragDecorations, [
        {
          range: new m.Range(a, 1, b, 1),
          options: {
            isWholeLine: true,
            className: 'pra-drag-range',
            linesDecorationsClassName: 'pra-drag-range-gutter',
          },
        },
      ]);
    };

    const clearDragDecorations = () => {
      if (dragDecorations.length) {
        dragDecorations = editor.deltaDecorations(dragDecorations, []);
      }
    };

    const onDragMove = (e: MouseEvent) => {
      if (!dragging) return;
      const target = editor.getTargetAtClientPoint(e.clientX, e.clientY);
      const ln = target?.position?.lineNumber;
      if (!ln) return;
      if (ln !== dragEndLine) {
        dragEndLine = ln;
        updateDragDecorations(dragAnchorLine, dragEndLine);
      }
    };

    const onDragEnd = (e: MouseEvent) => {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener('mousemove', onDragMove);
      window.removeEventListener('mouseup', onDragEnd);
      const start = Math.min(dragAnchorLine, dragEndLine);
      const end = Math.max(dragAnchorLine, dragEndLine);
      clearDragDecorations();
      openComposer(filePath, monacoToReal(start), monacoToReal(end));
      e.preventDefault();
      e.stopPropagation();
    };

    node.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (currentLine === 0) return;
      // Prefer Monaco selection if user already made one with click+drag.
      const selection = editor.getSelection();
      if (selection && !selection.isEmpty()) {
        const startLine = Math.min(selection.startLineNumber, selection.endLineNumber);
        const endLine = Math.max(selection.startLineNumber, selection.endLineNumber);
        // Don't start a drag — open composer for the existing selection.
        openComposer(filePath, monacoToReal(startLine), monacoToReal(endLine));
        return;
      }
      dragging = true;
      dragAnchorLine = currentLine;
      dragEndLine = currentLine;
      window.addEventListener('mousemove', onDragMove);
      window.addEventListener('mouseup', onDragEnd, { once: true });
    });

    node.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      // The click path is reached when the user pressed and released on the
      // + without dragging at all. Handler in onDragEnd already opens the
      // composer in that case (start == end). Stop default behavior here.
    });

    const disposables: IDisposable[] = [];

    disposables.push(
      editor.onMouseMove((e) => {
        const line = e.target.position?.lineNumber ?? 0;
        if (line === 0) return; // keep last shown
        const sel = editor.getSelection();
        const inSel =
          sel && !sel.isEmpty() &&
          line >= Math.min(sel.startLineNumber, sel.endLineNumber) &&
          line <= Math.max(sel.startLineNumber, sel.endLineNumber);
        if (inSel && sel) {
          currentLine = Math.min(sel.startLineNumber, sel.endLineNumber);
          currentEndLine = Math.max(sel.startLineNumber, sel.endLineNumber);
        } else {
          currentLine = line;
          currentEndLine = line;
        }
        visible = true;
        editor.layoutContentWidget(widget);
      }),
    );

    disposables.push(
      editor.onMouseLeave(() => {
        // Don't hide if there's an active selection.
        const sel = editor.getSelection();
        if (sel && !sel.isEmpty()) return;
        visible = false;
        editor.layoutContentWidget(widget);
      }),
    );

    disposables.push(
      editor.onDidChangeCursorSelection(() => {
        const sel = editor.getSelection();
        if (sel && !sel.isEmpty()) {
          currentLine = Math.min(sel.startLineNumber, sel.endLineNumber);
          currentEndLine = Math.max(sel.startLineNumber, sel.endLineNumber);
          visible = true;
          editor.layoutContentWidget(widget);
        }
      }),
    );

    return () => {
      for (const d of disposables) d.dispose();
      editor.removeContentWidget(widget);
    };
  }, [editor, filePath, openComposer]);

  // ---- View zones for threads + composer ----
  useEffect(() => {
    if (!editor) return;

    const threadLines = Object.keys(lineComments).map(Number).filter((n) => n > 0);
    const composerLine =
      composerTarget?.path === filePath ? composerTarget.line : null;

    // Compose a target set: threads + composer (composer might be on a line
    // that already has a thread → we render the editor below the thread).
    type Wanted = { line: number; kind: 'thread' | 'composer' };
    const wanted: Wanted[] = [
      ...threadLines.map((line) => ({ line, kind: 'thread' as const })),
      ...(composerLine !== null && !lineComments[composerLine]
        ? [{ line: composerLine, kind: 'composer' as const }]
        : []),
    ];

    const newZones: ZoneEntry[] = [];
    // Native handlers that block Monaco from receiving events while letting
    // them flow through React naturally inside the zone.
    const stop = (e: Event) => { e.stopPropagation(); };

    editor.changeViewZones((accessor) => {
      for (const w of wanted) {
        const node = document.createElement('div');
        node.className = 'pra-view-zone';
        node.addEventListener('mousedown', stop);
        node.addEventListener('mouseup', stop);
        node.addEventListener('click', stop);
        node.addEventListener('wheel', stop);
        node.addEventListener('keydown', stop);
        // w.line is a REAL file line (storage coord). Convert to Monaco line
        // for placement so the zone appears at the visible row, regardless
        // of whether noise is hidden.
        const id = accessor.addZone({
          afterLineNumber: realToMonaco(w.line),
          heightInPx: w.kind === 'composer' ? 260 : 150,
          domNode: node,
        });
        newZones.push({ id, line: w.line, node, kind: w.kind });
      }
    });
    setZones(newZones);

    return () => {
      editor.changeViewZones((accessor) => {
        for (const z of newZones) accessor.removeZone(z.id);
      });
    };
  }, [editor, JSON.stringify(Object.keys(lineComments)), composerTarget?.line, composerTarget?.path, filePath]);

  // Accepts REAL file lines and reads the corresponding rows from Monaco's
  // model, translating real → Monaco internally so suggestion/AI helpers
  // pick up the right source even when noise is hidden.
  const readOriginalLines = (startLine: number, endLine: number): string => {
    if (!editor) return '';
    const model = editor.getModel();
    if (!model) return '';
    const monacoStart = realToMonaco(Math.min(startLine, endLine));
    const monacoEnd = realToMonaco(Math.max(startLine, endLine));
    const a = Math.max(1, Math.min(monacoStart, monacoEnd));
    const b = Math.min(model.getLineCount(), Math.max(monacoStart, monacoEnd));
    const lines: string[] = [];
    for (let i = a; i <= b; i++) lines.push(model.getLineContent(i));
    return lines.join('\n');
  };

  // No React-level stopPropagation here. The native listeners attached
  // to the view-zone node (see effect above) handle that BEFORE the event
  // reaches Monaco, while still letting React events route through the
  // portal to the buttons/textarea normally.

  return (
    <>
      {zones.map((z) => {
        if (z.kind === 'thread') {
          const entry: LineComment = lineComments[z.line] ?? { body: '' };
          const isEditing =
            composerTarget?.path === filePath && composerTarget?.line === z.line;
          return createPortal(
            <div>
              <Thread
                line={z.line}
                startLine={entry.startLine ?? z.line}
                entry={entry}
                editing={isEditing}
                filePath={filePath}
                readOriginalLines={readOriginalLines}
                onEdit={() => openComposer(filePath, entry.startLine ?? z.line, z.line)}
                onDelete={() => removeLineComment(filePath, z.line)}
                onCancel={closeComposer}
                onSave={(text, s, e) => {
                  if (e !== z.line) removeLineComment(filePath, z.line);
                  setLineComment(filePath, e, text, s);
                  closeComposer();
                }}
              />
            </div>,
            z.node,
          );
        }
        const startLine = composerTarget?.startLine ?? z.line;
        return createPortal(
          <div>
            <Composer
              startLine={startLine}
              endLine={z.line}
              filePath={filePath}
              readOriginalLines={readOriginalLines}
              onCancel={closeComposer}
              onSave={(text, s, e) => {
                setLineComment(filePath, e, text, s);
                closeComposer();
              }}
            />
          </div>,
          z.node,
        );
      })}
    </>
  );
}

function lineRangeLabel(start: number, end: number): string {
  return start === end ? `line R${end}` : `lines R${start}–R${end}`;
}

interface ComposerCoreProps {
  startLine: number;
  endLine: number;
  filePath: string;
  initialBody?: string;
  readOriginalLines: (start: number, end: number) => string;
  onCancel: () => void;
  onSave: (text: string, startLine: number, endLine: number) => void;
  onDelete?: () => void;
  isEdit?: boolean;
}

function ComposerCore({
  startLine, endLine, filePath, initialBody = '', readOriginalLines,
  onCancel, onSave, onDelete, isEdit = false,
}: ComposerCoreProps) {
  const [draft, setDraft] = useState(initialBody);
  const [busy, setBusy] = useState<null | 'suggest' | 'enhance'>(null);
  const [start, setStart] = useState(startLine);
  const [end, setEnd] = useState(endLine);

  const insertSuggestion = () => {
    const original = readOriginalLines(start, end);
    const block = '\n\n```suggestion\n' + original + '\n```\n';
    setDraft((d) => d.trim() + block);
  };

  const callAI = async (mode: 'suggest' | 'enhance') => {
    setBusy(mode);
    try {
      const original = readOriginalLines(start, end);
      const res = await fetch('/api/ai-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode, filePath, startLine: start, endLine: end, originalCode: original, draft,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        setDraft((d) => d + `\n\n_AI ${mode} failed: ${err.error ?? 'unknown error'}_`);
        return;
      }
      const data = (await res.json()) as { text: string };
      if (mode === 'suggest') {
        // The endpoint returns just the replacement code; wrap as suggestion.
        const block = '\n\n```suggestion\n' + data.text.trim() + '\n```\n';
        setDraft((d) => (d.trim() ? d.trim() + block : `Suggested change:${block}`));
      } else {
        setDraft(data.text.trim());
      }
    } catch (err) {
      setDraft((d) => d + `\n\n_AI ${mode} failed: ${(err as Error).message}_`);
    } finally {
      setBusy(null);
    }
  };

  const adjustStart = (d: number) => setStart((s) => Math.max(1, Math.min(end, s + d)));
  const adjustEnd = (d: number) => setEnd((e2) => Math.max(start, e2 + d));

  return (
    <div className="vz-thread editing">
      <div className="vz-thread-head">
        <span>
          <span className="vz-chev down">⌄</span>
          <span>{isEdit ? 'Editing' : 'Adding'} comment on </span>
          <span className="vz-range">
            <span className="vz-range-label">lines</span>
            <button className="vz-range-step" onClick={() => adjustStart(-1)} title="Extend start up">−</button>
            <span className="vz-range-num">R{start}</span>
            <button className="vz-range-step" onClick={() => adjustStart(+1)} title="Move start down">+</button>
            <span className="vz-range-dash">→</span>
            <button className="vz-range-step" onClick={() => adjustEnd(-1)} title="Move end up">−</button>
            <span className="vz-range-num">R{end}</span>
            <button className="vz-range-step" onClick={() => adjustEnd(+1)} title="Extend end down">+</button>
          </span>
        </span>
      </div>
      <div className="vz-edit">
        <textarea
          className="vz-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Your inline comment. Use the buttons below to insert a suggestion or get AI help."
          autoFocus={!isEdit}
          rows={4}
        />
        <div className="vz-tools">
          <button
            type="button"
            className="vz-tool"
            onClick={insertSuggestion}
            title="Insert a suggestion block prefilled with the original code"
          >
            ⤷ Suggest change
          </button>
          <button
            type="button"
            className="vz-tool ai"
            onClick={() => callAI('suggest')}
            disabled={!!busy}
            title="Let AI propose a code change for this range"
          >
            {busy === 'suggest' ? '✨ Thinking…' : '✨ AI suggest fix'}
          </button>
          <button
            type="button"
            className="vz-tool ai"
            onClick={() => callAI('enhance')}
            disabled={!!busy || !draft.trim()}
            title="Polish the comment you've started"
          >
            {busy === 'enhance' ? '✨ Polishing…' : '✨ Enhance comment'}
          </button>
        </div>
        <div className="vz-actions">
          <button className="link-btn small" onClick={onCancel}>Cancel</button>
          <div style={{ flex: 1 }} />
          {isEdit && onDelete && (
            <button className="link-btn small danger" onClick={onDelete}>Delete</button>
          )}
          <button
            className="primary-btn"
            onClick={() => onSave(draft.trim(), start, end)}
            disabled={!draft.trim()}
          >
            Save comment
          </button>
        </div>
      </div>
    </div>
  );
}

interface ThreadProps {
  filePath: string;
  line: number;
  startLine: number;
  entry: LineComment;
  editing: boolean;
  readOriginalLines: (start: number, end: number) => string;
  onEdit: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onSave: (text: string, startLine: number, endLine: number) => void;
}

function Thread(props: ThreadProps) {
  const { line, startLine, entry, editing, readOriginalLines, filePath,
    onEdit, onDelete, onCancel, onSave } = props;
  const [collapsed, setCollapsed] = useState(false);
  const rangeLabel = lineRangeLabel(startLine, line);

  if (collapsed && !editing) {
    return (
      <div className="vz-thread collapsed">
        <button className="vz-collapse-btn" onClick={() => setCollapsed(false)}>
          <span>💬 Comment on {rangeLabel}</span>
          <span className="vz-chev">›</span>
        </button>
      </div>
    );
  }

  if (editing) {
    return (
      <ComposerCore
        startLine={startLine}
        endLine={line}
        filePath={filePath}
        initialBody={entry.body}
        readOriginalLines={readOriginalLines}
        onCancel={onCancel}
        onSave={onSave}
        onDelete={onDelete}
        isEdit
      />
    );
  }

  return (
    <div className="vz-thread">
      <div className="vz-thread-head">
        <button className="vz-collapse-btn inline" onClick={() => setCollapsed(true)}>
          <span className="vz-chev down">⌄</span>
          <span>Comment on <strong>{rangeLabel}</strong></span>
        </button>
      </div>
      <div className="vz-body">
        <CommentBody body={entry.body} />
        <div className="vz-actions ghost">
          <button className="link-btn small" onClick={onEdit}>Edit</button>
          <button className="link-btn small danger" onClick={onDelete}>Delete</button>
        </div>
      </div>
    </div>
  );
}

interface ComposerProps {
  startLine: number;
  endLine: number;
  filePath: string;
  readOriginalLines: (start: number, end: number) => string;
  onCancel: () => void;
  onSave: (text: string, startLine: number, endLine: number) => void;
}

function Composer(props: ComposerProps) {
  return (
    <ComposerCore
      {...props}
      initialBody=""
    />
  );
}

/** Renders comment body, breaking out ```suggestion``` blocks visually. */
function CommentBody({ body }: { body: string }) {
  const parts: { kind: 'text' | 'suggestion'; content: string }[] = [];
  const regex = /```suggestion\n([\s\S]*?)\n```/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(body)) !== null) {
    if (m.index > lastIdx) parts.push({ kind: 'text', content: body.slice(lastIdx, m.index) });
    parts.push({ kind: 'suggestion', content: m[1] });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < body.length) parts.push({ kind: 'text', content: body.slice(lastIdx) });
  if (parts.length === 0) return <div className="vz-body-text">{body}</div>;

  return (
    <>
      {parts.map((p, i) =>
        p.kind === 'suggestion' ? (
          <pre key={i} className="vz-suggestion">
            <div className="vz-suggestion-label">Suggested change</div>
            <code>{p.content}</code>
          </pre>
        ) : (
          <div key={i} className="vz-body-text">{p.content.trim()}</div>
        ),
      )}
    </>
  );
}

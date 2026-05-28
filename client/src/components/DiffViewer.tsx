import { DiffEditor, Editor } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { useEffect, useState } from 'react';
import type { DiffFile } from '@shared/types';
import { fileContentFor, useStore } from '../state/store.js';
import { monacoThemeFor, usePrefs } from '../state/preferences.js';
import { InlineCommentsLayer } from './InlineCommentsLayer.js';

interface Props {
  file: DiffFile | null;
  position: { index: number; total: number } | null;
}

export function DiffViewer({ file, position }: Props) {
  const showNoise = useStore((s) => s.showNoise);
  const toggleNoise = useStore((s) => s.toggleNoise);
  const fullEntry = useStore((s) => (file ? s.fullContent[file.path] : undefined));
  const theme = usePrefs((s) => s.theme);
  const viewMode = usePrefs((s) => s.viewMode);
  const [commentEditor, setCommentEditor] = useState<MonacoEditor.ICodeEditor | null>(null);

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
  const canUseFull = noiseHunkCount === 0 || showNoise;
  const fullReady = fullEntry?.status === 'ready';
  const loadingFull = fullEntry?.status === 'loading';
  const hasFull = fullReady && canUseFull;
  const {
    oldContent: hunkOld,
    newContent: hunkNew,
    oldLineMap,
    newLineMap,
  } = fileContentFor(file, showNoise);
  const oldContent = hasFull ? (fullEntry!.oldContent ?? '') : hunkOld;
  const newContent = hasFull ? (fullEntry!.newContent ?? '') : hunkNew;

  const handleDiffMount = (
    editor: MonacoEditor.IStandaloneDiffEditor,
  ) => {
    setCommentEditor(editor.getModifiedEditor());
    // Apply real-line numbers when in hunks-only mode.
    if (!hasFull) {
      editor.getModifiedEditor().updateOptions({
        lineNumbers: (n) => {
          const real = newLineMap[n - 1];
          return real ? String(real) : '';
        },
      });
      editor.getOriginalEditor().updateOptions({
        lineNumbers: (n) => {
          const real = oldLineMap[n - 1];
          return real ? String(real) : '';
        },
      });
    }
  };

  const handleSingleMount = (editor: MonacoEditor.IStandaloneCodeEditor) => {
    setCommentEditor(editor);
    if (!hasFull) {
      const map = isDeleted ? oldLineMap : newLineMap;
      editor.updateOptions({
        lineNumbers: (n) => {
          const real = map[n - 1];
          return real ? String(real) : '';
        },
      });
    }
  };

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
      <InlineCommentsLayer editor={commentEditor} filePath={file.path} />
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

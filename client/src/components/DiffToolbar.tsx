import { usePrefs, type Theme, type ViewMode } from '../state/preferences.js';

/**
 * Thin strip above the diff column hosting the controls that affect the
 * code viewer itself — view layout and syntax theme. Lives here (not in
 * the global header) because reviewers reach for these *while reading
 * code*, and the row was getting busy with PR-meta chips next to view
 * preferences that have nothing to do with the PR.
 */
export function DiffToolbar() {
  const viewMode = usePrefs((s) => s.viewMode);
  const setViewMode = usePrefs((s) => s.setViewMode);
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);

  return (
    <div className="diff-toolbar" role="toolbar" aria-label="Diff viewer controls">
      <div className="diff-toolbar-group">
        <span className="diff-toolbar-label">View</span>
        <DiffSegmented<ViewMode>
          label="View"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'split', label: 'Split' },
            { value: 'unified', label: 'Unified' },
          ]}
        />
      </div>
      <div className="diff-toolbar-group">
        <span className="diff-toolbar-label">Theme</span>
        <DiffSegmented<Theme>
          label="Code theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'github', label: 'GitHub' },
            { value: 'vscode', label: 'VS Code' },
            { value: 'intellij', label: 'IntelliJ' },
          ]}
        />
      </div>
    </div>
  );
}

interface SegProps<T extends string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}

function DiffSegmented<T extends string>({ label, value, onChange, options }: SegProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`seg ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

import { usePrefs, type Theme, type ViewMode } from '../state/preferences.js';
import { TokenBadge } from './TokenBadge.js';

export function HeaderControls() {
  const theme = usePrefs((s) => s.theme);
  const viewMode = usePrefs((s) => s.viewMode);
  const setTheme = usePrefs((s) => s.setTheme);
  const setViewMode = usePrefs((s) => s.setViewMode);

  return (
    <div className="controls">
      <TokenBadge />
      <SegmentedControl<ViewMode>
        label="View"
        value={viewMode}
        onChange={setViewMode}
        options={[
          { value: 'split', label: 'Split' },
          { value: 'unified', label: 'Unified' },
        ]}
      />
      <SegmentedControl<Theme>
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
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}

function SegmentedControl<T extends string>({ label, value, onChange, options }: SegmentedProps<T>) {
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

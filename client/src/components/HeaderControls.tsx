import { usePrefs, type ModelPreference } from '../state/preferences.js';
import { TokenBadge } from './TokenBadge.js';

export function HeaderControls() {
  const modelPreference = usePrefs((s) => s.modelPreference);
  const setModelPreference = usePrefs((s) => s.setModelPreference);

  return (
    <div className="controls">
      <TokenBadge />
      <SegmentedControl<ModelPreference>
        label="AI model"
        value={modelPreference}
        onChange={setModelPreference}
        options={[
          { value: 'sonnet', label: 'Fast', title: 'Sonnet — fast, cheap, good enough for most PRs' },
          { value: 'opus', label: 'Smart', title: 'Opus — slower and pricier; better on dense logic' },
          { value: 'auto', label: 'Auto', title: 'Per-feature defaults (Sonnet for short outputs, CLI default for the rest)' },
        ]}
      />
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; title?: string }[];
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
          title={opt.title}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

import { usePrefs, type ModelPreference } from '../state/preferences.js';
import { TokenBadge } from './TokenBadge.js';

export function HeaderControls() {
  const modelPreference = usePrefs((s) => s.modelPreference);
  const setModelPreference = usePrefs((s) => s.setModelPreference);

  return (
    <div className="controls">
      <TokenBadge />
      <SegmentedControl<ModelPreference>
        label="AI mode"
        value={modelPreference}
        onChange={setModelPreference}
        options={[
          { value: 'fast', label: 'Fast', title: 'Sonnet on every AI feature — cheap and snappy, fine for routine PRs' },
          { value: 'smart', label: 'Smart', title: 'Opus on TL;DR + diagram (where reasoning helps); Sonnet on the short outputs' },
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

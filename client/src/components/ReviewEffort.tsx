import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';

type Size = 'XS' | 'S' | 'M' | 'L' | 'XL';
type Complexity = 'simple' | 'moderate' | 'complex' | 'unknown';

type VerdictKey = 'quick' | 'standard' | 'careful' | 'deep' | 'reviewer' | 'pending';

interface Verdict {
  key: VerdictKey;
  emoji: string;
  label: string;
  /** Position on the 1..4 ranked scale, or null for off-scale. */
  level: 1 | 2 | 3 | 4 | null;
  tone: 'green' | 'blue' | 'orange' | 'red' | 'neutral' | 'pending';
}

const VERDICTS: Record<VerdictKey, Verdict> = {
  quick:    { key: 'quick',    emoji: '⚡', label: 'Quick scan',         level: 1,    tone: 'green'   },
  standard: { key: 'standard', emoji: '📖', label: 'Standard review',    level: 2,    tone: 'blue'    },
  careful:  { key: 'careful',  emoji: '🧐', label: 'Careful read',       level: 3,    tone: 'orange'  },
  deep:     { key: 'deep',     emoji: '🧠', label: 'Deep dive',          level: 4,    tone: 'red'     },
  reviewer: { key: 'reviewer', emoji: '🤔', label: "Reviewer's call",    level: null, tone: 'neutral' },
  pending:  { key: 'pending',  emoji: '⏳', label: 'Estimating effort…', level: null, tone: 'pending' },
};

const ALL_VERDICTS: Verdict[] = [VERDICTS.quick, VERDICTS.standard, VERDICTS.careful, VERDICTS.deep];

export function ReviewEffort() {
  const bundle = useStore((s) => s.bundle);
  const complexityState = useStore((s) => s.complexity);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  if (!bundle) return null;

  const sized = sizeFromBundle(bundle);
  const complexity = parseComplexity(complexityState.text, complexityState.status);
  const minutes = estimateMinutes(sized);
  const verdict = pickVerdict(sized.size, complexity, complexityState.status);

  return (
    <div className={`effort-pill effort-${verdict.tone}`}>
      <div className="effort-line1">
        <span className="effort-emoji">{verdict.emoji}</span>
        <span className="effort-label">{verdict.label}</span>
        <button
          type="button"
          className="effort-info"
          onClick={() => setHelpOpen((v) => !v)}
          aria-label="How is this calculated?"
          title="How is this calculated?"
        >
          i
        </button>
      </div>
      <div className="effort-meter" aria-label={
        verdict.level ? `Level ${verdict.level} of 4` : 'Off scale'
      }>
        {[1, 2, 3, 4].map((n) => (
          <span
            key={n}
            className={`effort-dot ${
              verdict.level !== null && n <= verdict.level ? 'filled' : ''
            }`}
          />
        ))}
      </div>
      <div className="effort-line2">
        {verdict.key === 'pending'
          ? `~${minutes} min · ${sized.size}`
          : `~${minutes} min · ${sized.size} · ${sized.lines} lines`}
      </div>

      {helpOpen && (
        <>
          <div className="effort-overlay" onClick={() => setHelpOpen(false)} />
          <div className="effort-help" role="dialog" aria-label="How review effort is calculated">
            <EffortHelp sized={sized} complexity={complexity} complexityStatus={complexityState.status} minutes={minutes} verdict={verdict} />
          </div>
        </>
      )}
    </div>
  );
}

interface HelpProps {
  sized: SizeInfo;
  complexity: Complexity;
  complexityStatus: string;
  minutes: number;
  verdict: Verdict;
}

function EffortHelp({ sized, complexity, complexityStatus, minutes, verdict }: HelpProps) {
  return (
    <>
      <div className="effort-help-title">How we calculate this</div>

      <div className="effort-help-section">
        <div className="effort-help-section-label">For this PR</div>
        <div className="effort-help-row">
          <span>Size</span>
          <span><strong>{sized.size}</strong> — {sized.lines} changed lines, {sized.files} file{sized.files === 1 ? '' : 's'}{sized.testFiles ? `, ${sized.testFiles} test` : ''}{sized.noiseFiles ? `, ${sized.noiseFiles} noise hidden` : ''}</span>
        </div>
        <div className="effort-help-row">
          <span>AI complexity</span>
          <span>
            {complexityStatus === 'streaming' ? <em>estimating…</em>
              : complexityStatus === 'error' ? <em>failed — size only</em>
              : complexity === 'unknown' ? <em>couldn't classify</em>
              : <strong>{complexity}</strong>}
          </span>
        </div>
        <div className="effort-help-row">
          <span>Time estimate</span>
          <span>~{minutes} min · <code>max(2, lines/120 + files*0.5)</code></span>
        </div>
        <div className="effort-help-row total">
          <span>Verdict</span>
          <span><strong>{verdict.emoji} {verdict.label}</strong></span>
        </div>
      </div>

      <div className="effort-help-section">
        <div className="effort-help-section-label">T-shirt size</div>
        <table className="effort-help-table">
          <tbody>
            <tr><td>XS</td><td>&lt; 30 lines</td></tr>
            <tr><td>S</td><td>30 – 150 lines</td></tr>
            <tr><td>M</td><td>150 – 500 lines</td></tr>
            <tr><td>L</td><td>500 – 1500 lines</td></tr>
            <tr><td>XL</td><td>1500+ lines</td></tr>
          </tbody>
        </table>
      </div>

      <div className="effort-help-section">
        <div className="effort-help-section-label">Verdict scale (size × AI complexity)</div>
        <table className="effort-help-table grid">
          <thead>
            <tr><th></th><th>simple</th><th>moderate</th><th>complex</th></tr>
          </thead>
          <tbody>
            <tr><th>XS</th><td>⚡</td><td>⚡</td><td>📖</td></tr>
            <tr><th>S</th><td>⚡</td><td>📖</td><td>🧐</td></tr>
            <tr><th>M</th><td>📖</td><td>🧐</td><td>🧐</td></tr>
            <tr><th>L</th><td>🧐</td><td>🧐</td><td>🧠</td></tr>
            <tr><th>XL</th><td>🧐</td><td>🧠</td><td>🧠</td></tr>
          </tbody>
        </table>
        <div className="effort-help-legend">
          <span>⚡ Quick scan</span>
          <span>📖 Standard review</span>
          <span>🧐 Careful read</span>
          <span>🧠 Deep dive</span>
          <span>🤔 Reviewer's call (AI couldn't classify)</span>
        </div>
      </div>

      <div className="effort-help-note">
        Rough heuristic — recalibrates by feel. Doesn't account for language familiarity.
      </div>
    </>
  );
}

interface SizeInfo {
  size: Size;
  lines: number;
  files: number;
  testFiles: number;
  noiseFiles: number;
}

function sizeFromBundle(bundle: NonNullable<ReturnType<typeof useStore.getState>['bundle']>): SizeInfo {
  let lines = 0;
  let files = 0;
  let testFiles = 0;
  let noiseFiles = 0;
  for (const f of bundle.files) {
    if (f.noise) { noiseFiles++; continue; }
    files++;
    lines += f.additions + f.deletions;
    if (/test|spec/i.test(f.path)) testFiles++;
  }
  let size: Size;
  if (lines < 30) size = 'XS';
  else if (lines < 150) size = 'S';
  else if (lines < 500) size = 'M';
  else if (lines < 1500) size = 'L';
  else size = 'XL';
  return { size, lines, files, testFiles, noiseFiles };
}

function estimateMinutes({ lines, files }: SizeInfo): number {
  const m = Math.round(lines / 120 + files * 0.5);
  return Math.max(2, m);
}

function parseComplexity(text: string, status: string): Complexity {
  if (status !== 'done') return 'unknown';
  const t = text.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (t === 'simple' || t === 'moderate' || t === 'complex' || t === 'unknown') return t;
  return 'unknown';
}

function pickVerdict(size: Size, complexity: Complexity, status: string): Verdict {
  if (status === 'streaming' || status === 'idle') return VERDICTS.pending;
  if (complexity === 'unknown') return VERDICTS.reviewer;

  const grid: Record<Exclude<Complexity, 'unknown'>, Record<Size, VerdictKey>> = {
    simple:   { XS: 'quick',    S: 'quick',    M: 'standard', L: 'careful', XL: 'careful' },
    moderate: { XS: 'quick',    S: 'standard', M: 'careful',  L: 'careful', XL: 'deep'    },
    complex:  { XS: 'standard', S: 'careful',  M: 'careful',  L: 'deep',    XL: 'deep'    },
  };
  return VERDICTS[grid[complexity][size]];
}

// Reference to ALL_VERDICTS to silence "imported but unused" if iterators change.
void ALL_VERDICTS;

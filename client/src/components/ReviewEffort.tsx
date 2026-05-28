import { useStore } from '../state/store.js';

type Size = 'XS' | 'S' | 'M' | 'L' | 'XL';
type Complexity = 'simple' | 'moderate' | 'complex' | 'unknown';

type VerdictKey = 'quick' | 'standard' | 'careful' | 'deep' | 'reviewer' | 'pending';

interface Verdict {
  key: VerdictKey;
  emoji: string;
  label: string;
  /** CSS class suffix on .effort-pill */
  tone: 'green' | 'blue' | 'orange' | 'red' | 'neutral' | 'pending';
}

const VERDICTS: Record<VerdictKey, Verdict> = {
  quick:    { key: 'quick',    emoji: '⚡', label: 'Quick scan',        tone: 'green' },
  standard: { key: 'standard', emoji: '📖', label: 'Standard review',   tone: 'blue' },
  careful:  { key: 'careful',  emoji: '🧐', label: 'Careful read',      tone: 'orange' },
  deep:     { key: 'deep',     emoji: '🧠', label: 'Deep dive',         tone: 'red' },
  reviewer: { key: 'reviewer', emoji: '🤔', label: "Reviewer's call",   tone: 'neutral' },
  pending:  { key: 'pending',  emoji: '⏳', label: 'Estimating effort…', tone: 'pending' },
};

export function ReviewEffort() {
  const bundle = useStore((s) => s.bundle);
  const complexityState = useStore((s) => s.complexity);
  if (!bundle) return null;

  const sized = sizeFromBundle(bundle);
  const complexity = parseComplexity(complexityState.text, complexityState.status);
  const minutes = estimateMinutes(sized);
  const verdict = pickVerdict(sized.size, complexity, complexityState.status);

  const tooltip = buildTooltip(sized, complexity, complexityState.status, minutes);

  return (
    <div className={`effort-pill effort-${verdict.tone}`} title={tooltip}>
      <div className="effort-line1">
        <span className="effort-emoji">{verdict.emoji}</span>
        <span className="effort-label">{verdict.label}</span>
      </div>
      <div className="effort-line2">
        {verdict.key === 'pending'
          ? `~${minutes} min · ${sized.size}`
          : `~${minutes} min · ${sized.size} · ${sized.lines} lines`}
      </div>
    </div>
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
  // Calibrated rough heuristic; reviewers can recalibrate by feel.
  const m = Math.round(lines / 120 + files * 0.5);
  return Math.max(2, m);
}

function parseComplexity(text: string, status: string): Complexity {
  if (status !== 'done') return 'unknown';
  const t = text.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (t === 'simple' || t === 'moderate' || t === 'complex' || t === 'unknown') return t;
  return 'unknown';
}

/**
 * Verdict logic — cross-table of deterministic size with AI complexity.
 * AI "complex" pulls harder than size; a small change in a sensitive area
 * still gets escalated to Careful read.
 */
function pickVerdict(size: Size, complexity: Complexity, status: string): Verdict {
  if (status === 'streaming' || status === 'idle') return VERDICTS.pending;
  if (complexity === 'unknown') return VERDICTS.reviewer;

  const grid: Record<Complexity, Record<Size, VerdictKey>> = {
    simple: {
      XS: 'quick', S: 'quick', M: 'standard', L: 'careful', XL: 'careful',
    },
    moderate: {
      XS: 'quick', S: 'standard', M: 'careful', L: 'careful', XL: 'deep',
    },
    complex: {
      XS: 'standard', S: 'careful', M: 'careful', L: 'deep', XL: 'deep',
    },
    unknown: { XS: 'reviewer', S: 'reviewer', M: 'reviewer', L: 'reviewer', XL: 'reviewer' },
  };
  return VERDICTS[grid[complexity][size]];
}

function buildTooltip(s: SizeInfo, c: Complexity, status: string, minutes: number): string {
  const lines: string[] = [];
  lines.push(`~${minutes} min review estimate.`);
  lines.push(`${s.size}: ${s.lines} changed lines across ${s.files} file${s.files === 1 ? '' : 's'}${s.testFiles ? ` (${s.testFiles} test)` : ''}${s.noiseFiles ? `, ${s.noiseFiles} noise hidden` : ''}.`);
  if (status === 'streaming') {
    lines.push(`AI complexity: estimating…`);
  } else if (status === 'error') {
    lines.push(`AI complexity: failed — using size only.`);
  } else if (c === 'unknown') {
    lines.push(`AI couldn't confidently classify complexity — your call.`);
  } else {
    lines.push(`AI complexity: ${c}.`);
  }
  lines.push(`Rough heuristic — your mileage may vary.`);
  return lines.join('\n');
}

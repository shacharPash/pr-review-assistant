/** Roll-up state for a single check (a job inside a workflow run). */
export type CheckBucket = 'pass' | 'fail' | 'pending' | 'skipping' | 'cancel';

export interface CheckRun {
  name: string;
  workflow: string;
  bucket: CheckBucket;
  /** Raw GitHub state (SUCCESS, FAILURE, IN_PROGRESS, etc) — useful for tooltips. */
  state: string;
  link: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** Aggregated view used by the header pill. */
export interface ChecksSummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  skipped: number;
  cancelled: number;
  /** Worst-state-wins rollup: fail > pending > cancel > pass > skip > none. */
  overall: 'pass' | 'fail' | 'pending' | 'cancel' | 'none';
}

export function summarize(runs: CheckRun[]): ChecksSummary {
  let passed = 0, failed = 0, pending = 0, skipped = 0, cancelled = 0;
  for (const r of runs) {
    if (r.bucket === 'pass') passed++;
    else if (r.bucket === 'fail') failed++;
    else if (r.bucket === 'pending') pending++;
    else if (r.bucket === 'skipping') skipped++;
    else if (r.bucket === 'cancel') cancelled++;
  }
  let overall: ChecksSummary['overall'];
  if (runs.length === 0) overall = 'none';
  else if (failed > 0) overall = 'fail';
  else if (pending > 0) overall = 'pending';
  else if (cancelled > 0) overall = 'cancel';
  else overall = 'pass';
  return { total: runs.length, passed, failed, pending, skipped, cancelled, overall };
}

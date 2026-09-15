import { useStore } from '../state/store.js';

export function CommitSelector() {
  const bundle = useStore((s) => s.bundle);
  const scope = useStore((s) => s.scope);
  const error = useStore((s) => s.scopeError);
  const loading = useStore((s) => s.scopeLoading);
  const lastReviewedSha = useStore((s) => s.lastReviewedSha);
  const selectScope = useStore((s) => s.selectScope);
  if (!bundle) return null;
  const commits = bundle.commits ?? [];
  const sinceAvailable = !!lastReviewedSha && lastReviewedSha !== bundle.meta.headSha &&
    commits.some((c) => c.oid === lastReviewedSha);
  return <div className="commit-selector">
    <label htmlFor="comparison-selector">Comparison</label>
    <select id="comparison-selector" className="commit-selector-button"
      aria-busy={loading} value={scope.kind === 'commit' ? scope.commitSha : scope.kind}
      onChange={(event) => {
        const value = event.target.value;
        if (value === 'all') void selectScope({ kind: 'all', label: 'All commits' });
        else if (value === 'since-review' && lastReviewedSha) void selectScope({
          kind: 'since-review', label: 'Since your last review', baseSha: lastReviewedSha,
        });
        else {
          const commit = commits.find((c) => c.oid === value);
          if (commit) void selectScope({ kind: 'commit', commitSha: value, label: `${commit.short}: ${commit.message}` });
        }
      }}>
      <option value="all">All commits ({commits.length})</option>
      <option value="since-review" disabled={!sinceAvailable}>Since your last review</option>
      <optgroup label="Specific commit">
        {commits.map((c) => <option key={c.oid} value={c.oid}>{c.short}: {c.message}</option>)}
      </optgroup>
    </select>
    {error && <p role="alert">{error}</p>}
    {loading && <span role="status">Loading comparison...</span>}
  </div>;
}

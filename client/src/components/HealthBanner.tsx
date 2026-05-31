import { useEffect } from 'react';
import { useStore } from '../state/store.js';

/**
 * Shows a friendly banner when one of the required external CLIs (gh, claude)
 * is missing or unauthenticated. Replaces the old behavior where users would
 * just see a 502 or a cryptic stack trace the moment they opened a PR.
 *
 * Hidden when everything's OK. Includes a "Re-check" button so users can
 * verify their fix without restarting the server.
 */
export function HealthBanner() {
  const health = useStore((s) => s.health);
  const fetchHealth = useStore((s) => s.fetchHealth);

  // Fire on mount. The first call is non-blocking; the banner only appears
  // if a problem is reported.
  useEffect(() => {
    if (health.status === 'idle') void fetchHealth();
  }, [health.status, fetchHealth]);

  if (health.status !== 'ready' || health.ok) return null;

  const problems = health.dependencies.filter((d) => d.problem);

  return (
    <div className="health-banner">
      <div className="hb-head">
        <span className="hb-icon">⚠</span>
        <span className="hb-title">Setup needed before you can review PRs</span>
        <button
          className="hb-recheck"
          onClick={() => fetchHealth(true)}
          title="Re-check after installing or authenticating"
        >
          Re-check
        </button>
      </div>
      <ul className="hb-list">
        {problems.map((d) => (
          <li key={d.name} className="hb-item">
            <code className="hb-name">{d.name}</code>
            <span className="hb-problem">
              {d.problem === 'missing' ? 'not installed' : 'not authenticated'}
            </span>
            {d.hint && <div className="hb-hint">{d.hint}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

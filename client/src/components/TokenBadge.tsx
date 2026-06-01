import { useStore } from '../state/store.js';
import { formatTokens, totalTokens } from '@shared/usage';

/**
 * Compact display of total Claude tokens used in the current PR session.
 * Hidden until the first usage event arrives so the empty state doesn't
 * confuse first-time users.
 */
export function TokenBadge() {
  const usage = useStore((s) => s.tokenUsage);
  const total = totalTokens(usage);
  if (total === 0) return null;

  const tooltip =
    `Input ${formatTokens(usage.input)} · Output ${formatTokens(usage.output)}` +
    (usage.cacheRead || usage.cacheCreation
      ? ` · Cache read ${formatTokens(usage.cacheRead)} · Cache write ${formatTokens(usage.cacheCreation)}`
      : '');

  return (
    <span className="token-badge" title={tooltip} aria-label={`Token usage: ${tooltip}`}>
      <span className="token-badge-icon" aria-hidden>◇</span>
      <span className="token-badge-value">{formatTokens(total)}</span>
      <span className="token-badge-unit">tokens</span>
    </span>
  );
}

import type { ReviewAuthor } from '@shared/reviewComments';
import { brandLogo } from '../lib/botLogos.js';

/**
 * Renders a small avatar for the comment author. For bots we recognize, we
 * show a brand-tinted circle with the brand letter so different bots are
 * visually distinguishable at a glance — humans get their GitHub avatar.
 */
export function BotAvatar({ author, size = 18 }: { author: ReviewAuthor; size?: number }) {
  if (author.type === 'User') {
    return (
      <img
        className="rc-avatar user"
        src={author.avatarUrl}
        width={size}
        height={size}
        alt={author.login}
        loading="lazy"
      />
    );
  }
  const label = author.login.replace(/\[bot\]$/, '');
  const logo = brandLogo(author.brand);
  if (logo) {
    return (
      <span className={`rc-avatar bot logo brand-${author.brand}`} style={{ width: size, height: size }} title={label} aria-label={label}>
        <img src={logo} width={size} height={size} alt={label} loading="lazy" />
      </span>
    );
  }
  if (author.avatarUrl) {
    return (
      <img className="rc-avatar bot" src={author.avatarUrl} width={size} height={size} alt={label} title={label} loading="lazy" />
    );
  }
  const letter = (author.brand?.[0] ?? 'B').toUpperCase();
  return (
    <span
      className={`rc-avatar bot brand-${author.brand ?? 'none'}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.6) }}
      title={label}
      aria-label={label}
    >
      {letter}
    </span>
  );
}

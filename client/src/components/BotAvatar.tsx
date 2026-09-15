import type { ReviewAuthor } from '@shared/reviewComments';

/** Initials keep authors distinguishable without loading remote images. */
export function BotAvatar({ author, size = 18 }: { author: ReviewAuthor; size?: number }) {
  const label = author.login.replace(/\[bot\]$/, '');
  return (
    <span
      className={`rc-avatar ${author.type === 'Bot' ? 'bot' : 'user'} brand-${author.brand ?? 'none'}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.6), display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      title={label}
      aria-label={label}
    >
      {label.slice(0, 1).toUpperCase() || '?'}
    </span>
  );
}

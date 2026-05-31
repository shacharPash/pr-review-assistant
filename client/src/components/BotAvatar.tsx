import type { ReviewAuthor } from '@shared/reviewComments';

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
  // Bots: branded dot with a letter. Real avatars from GitHub are often
  // generic and don't add information; branded chips communicate "this is
  // Cursor BugBot" / "this is SonarCloud" faster.
  const letter = (author.brand?.[0] ?? 'B').toUpperCase();
  const label = author.login.replace(/\[bot\]$/, '');
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

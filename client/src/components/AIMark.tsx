import { useId } from 'react';

/**
 * The mark for the AI-powered features (AI Review + Ask). A hexagon "node" with
 * a bright core , an engineering/graph feel that reads as a dev tool, and is
 * deliberately NOT the four-point sparkle (which looked like the Gemini logo).
 * Blue→teal gradient, distinct from Gemini's purple/blue.
 *
 * Sized via `size` (px). The gradient id is per-instance (useId) so multiple
 * marks on the page don't collide on a shared <defs> id.
 */
export function AIMark({ size = 15, className }: { size?: number; className?: string }) {
  const gid = `aimark-${useId()}`;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3b8cff" />
          <stop offset="1" stopColor="#33d6e0" />
        </linearGradient>
      </defs>
      <path
        d="M12 2.5 L20 7 V17 L12 21.5 L4 17 V7 Z"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.1" fill={`url(#${gid})`} />
    </svg>
  );
}

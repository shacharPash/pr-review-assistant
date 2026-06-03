/** Atlassian Jira logo — official two-tone blue chevron mark. */
export function JiraIcon({ size = 14, className = 'jira-badge-icon' }: { size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="jira-grad-a" x1="22.03" y1="16.71" x2="14.85" y2="9.5" gradientUnits="userSpaceOnUse">
          <stop offset="0.18" stopColor="#0052cc" />
          <stop offset="1" stopColor="#2684ff" />
        </linearGradient>
        <linearGradient id="jira-grad-b" x1="10.05" y1="15.39" x2="17.22" y2="22.61" gradientUnits="userSpaceOnUse">
          <stop offset="0.18" stopColor="#0052cc" />
          <stop offset="1" stopColor="#2684ff" />
        </linearGradient>
      </defs>
      <path fill="#2684ff" d="M30.32,15.34 16.16,1.18 14.79,2.55 a4.83,4.83 0,0 0,0 6.83 l7.85,7.85 -7.85,7.85 a4.83,4.83 0,0 0,0 6.83 l1.37,1.37 14.16,-14.16 a1.94,1.94 0,0 0,0 -2.74 Z" />
      <path fill="url(#jira-grad-a)" d="M16.16,8.55 a4.83,4.83 0,0 1,-0.01 -6.82 L6.7,11.18 11.39,15.87 Z" />
      <path fill="url(#jira-grad-b)" d="M20.59,16.13 16.16,20.55 a4.83,4.83 0,0 1,0 6.83 l-9.46,-9.46 4.69,-4.69 Z" />
    </svg>
  );
}

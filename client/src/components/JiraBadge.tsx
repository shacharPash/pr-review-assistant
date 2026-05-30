import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store.js';

/** Atlassian Jira logo — official two-tone blue chevron mark. */
function JiraIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      className="jira-badge-icon"
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

export function JiraBadge() {
  const bundle = useStore((s) => s.bundle);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close the popover on any click that lands outside the badge. The previous
  // `onMouseLeave` approach unmounted the popover the moment the cursor
  // crossed the 6px gap between the button and the popover, so the user
  // could never actually click the link inside.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!bundle) return null;
  const tickets = bundle.jira?.tickets ?? [];

  // No tickets known to the server. If we can spot a ticket-shaped key in
  // the PR text anyway, show a "configure to enable" hint so the user knows
  // why no link is appearing — clickable for the full setup instructions.
  if (tickets.length === 0) {
    const guessed = guessJiraKey(bundle.meta.title, bundle.meta.body, bundle.commitMessages);
    if (!guessed) return null;
    return (
      <div className={`jira-badge unconfigured ${open ? 'open' : ''}`} ref={wrapRef}>
        <button
          type="button"
          className="jira-badge-btn ghost"
          onClick={() => setOpen((v) => !v)}
          title={`Found ${guessed} — click to set up Jira links`}
        >
          <JiraIcon />
          <span className="jira-badge-key">{guessed}</span>
          <span className="jira-badge-cta">Set up →</span>
        </button>
        {open && <JiraSetupPopover detectedKey={guessed} />}
      </div>
    );
  }

  const first = tickets[0];
  return (
    <div className={`jira-badge ${open ? 'open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="jira-badge-btn"
        onClick={() => setOpen((v) => !v)}
        title="Jira context"
      >
        <JiraIcon />
        <span className="jira-badge-key">{first.key}</span>
        {tickets.length > 1 && <span className="jira-badge-more">+{tickets.length - 1}</span>}
      </button>
      {open && (
        <div className="jira-pop">
          {tickets.map((t) => {
            const hasDetails = !!t.title;
            return (
              <a key={t.key} href={t.url} target="_blank" rel="noreferrer" className="jira-pop-item">
                <div className="jira-pop-key">
                  <span className="jira-pop-keycode">{t.key}</span>
                  {t.type && <span className="jira-pop-type">{t.type}</span>}
                  {t.status && (
                    <span className={`jira-pop-status status-${t.status.toLowerCase().replace(/\s+/g, '-')}`}>
                      {t.status}
                    </span>
                  )}
                  {!hasDetails && (
                    <span className="jira-pop-link-only" title="Set JIRA_EMAIL and JIRA_API_TOKEN env vars to fetch ticket details">
                      link only
                    </span>
                  )}
                </div>
                {hasDetails ? (
                  <>
                    <div className="jira-pop-title">{t.title}</div>
                    {t.description && (
                      <div className="jira-pop-desc">
                        {t.description.split('\n').slice(0, 4).join('\n')}
                        {t.description.split('\n').length > 4 && '…'}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="jira-pop-title" style={{ color: 'var(--fg-dim)' }}>
                    Click to open in Jira →
                  </div>
                )}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/;

function guessJiraKey(title: string, body: string, commits: string[]): string | null {
  const haystack = [title, body, ...commits].join('\n');
  const m = haystack.match(JIRA_KEY_RE);
  return m ? `${m[1]}-${m[2]}` : null;
}

function JiraSetupPopover({ detectedKey }: { detectedKey: string }) {
  const envExample = `JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_EMAIL=you@your-org.com
JIRA_API_TOKEN=your-token-here`;
  return (
    <div className="jira-pop setup">
      <div className="jira-setup-title">Set up Jira links</div>
      <p className="jira-setup-text">
        Found <code>{detectedKey}</code> in this PR. Add Jira env vars to enable links and ticket previews.
      </p>
      <ol className="jira-setup-steps">
        <li>
          Create a <code>.env</code> file in the project root (next to <code>package.json</code>).
        </li>
        <li>
          For <strong>links only</strong>, set just the base URL:
          <pre className="jira-setup-pre">JIRA_BASE_URL=https://your-org.atlassian.net</pre>
        </li>
        <li>
          For <strong>full ticket details</strong> (title, status, description), also add:
          <pre className="jira-setup-pre">{envExample}</pre>
          <a
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noreferrer"
            className="jira-setup-link"
          >
            Create an Atlassian API token →
          </a>
        </li>
        <li>Restart the dev server (<code>npm run dev</code>) to pick up the new env.</li>
      </ol>
    </div>
  );
}

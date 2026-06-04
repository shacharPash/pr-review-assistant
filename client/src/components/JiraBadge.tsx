import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store.js';
import { JiraIcon } from './JiraIcon.js';

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
  const isConfigured = !!bundle.jira?.configured;
  const failures = bundle.jira?.failures ?? [];

  // No tickets to show. Three sub-cases:
  //   1) Server is configured + we tried & failed → fetch-error chip
  //   2) Server is NOT configured + PR text has a ticket-shaped key → "Set up" ghost
  //   3) Otherwise → render nothing (no key detected = nothing to surface)
  if (tickets.length === 0) {
    if (isConfigured && failures.length > 0) {
      const reasonLine = failures.map((f) => `${f.key}: ${f.reason}`).join('\n');
      return (
        <div className="jira-badge failed" title={`Jira fetch failed.\n${reasonLine}`}>
          <span className="jira-badge-btn ghost" style={{ cursor: 'default' }}>
            <JiraIcon />
            <span className="jira-badge-key">{failures[0].key}</span>
            <span className="jira-badge-cta" style={{ color: 'var(--removed, #d04545)' }}>
              fetch failed
            </span>
          </span>
        </div>
      );
    }

    if (!isConfigured) {
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

    // Configured + no keys detected in the PR → nothing to render.
    return null;
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

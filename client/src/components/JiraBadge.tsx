import { useState } from 'react';
import { useStore } from '../state/store.js';

export function JiraBadge() {
  const bundle = useStore((s) => s.bundle);
  const [open, setOpen] = useState(false);

  if (!bundle?.jira) return null;
  const { tickets } = bundle.jira;

  // Show the badge whenever we have any tickets (full details or just links).
  if (tickets.length === 0) return null;

  const first = tickets[0];
  return (
    <div className={`jira-badge ${open ? 'open' : ''}`} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="jira-badge-btn"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        title="Jira context"
      >
        <span className="jira-badge-icon">🪪</span>
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

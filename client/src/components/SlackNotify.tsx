import { useState } from 'react';
import { useStore } from '../state/store.js';

type TemplateId = 'approved' | 'commented' | 'changes';

const TEMPLATES: Record<TemplateId, { label: string; emoji: string; body: (ctx: Ctx) => string }> = {
  approved: {
    label: 'Approved',
    emoji: '✅',
    body: (c) => `Hey ${c.author} 👋 just reviewed *${c.title}* (#${c.number}) — looks good to me, approved! ${c.url}`,
  },
  commented: {
    label: 'Left comments',
    emoji: '💬',
    body: (c) => `Hey ${c.author} 👋 left some comments on *${c.title}* (#${c.number}) — nothing blocking, but a few things worth a look. ${c.url}`,
  },
  changes: {
    label: 'Requested changes',
    emoji: '↺',
    body: (c) => `Hey ${c.author} 👋 took a look at *${c.title}* (#${c.number}) and left a few things I'd want to address before merging. ${c.url}`,
  },
};

interface Ctx {
  author: string;
  number: number;
  title: string;
  url: string;
}

export function SlackNotify() {
  const bundle = useStore((s) => s.bundle);
  const [copied, setCopied] = useState<TemplateId | null>(null);
  const [picked, setPicked] = useState<TemplateId | null>(null);

  if (!bundle) return null;
  const ctx: Ctx = {
    author: '@' + bundle.meta.author,
    number: bundle.meta.number,
    title: bundle.meta.title,
    url: bundle.meta.url,
  };

  const pick = async (id: TemplateId) => {
    const text = TEMPLATES[id].body(ctx);
    setPicked(id);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      // Clipboard blocked — text is still visible in the preview.
    }
  };

  return (
    <div className="slack-notify">
      <div className="slack-head">
        Notify {ctx.author} on Slack
      </div>
      <div className="slack-options">
        {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => (
          <button
            key={id}
            className={`slack-option ${picked === id ? 'picked' : ''}`}
            onClick={() => pick(id)}
            title="Click to copy the message"
          >
            <span className="slack-emoji">{TEMPLATES[id].emoji}</span>
            <span>{TEMPLATES[id].label}</span>
            {copied === id && <span className="slack-copied">copied!</span>}
          </button>
        ))}
      </div>
      {picked && (
        <div className="slack-preview">
          <div className="slack-preview-label">Message (paste in Slack):</div>
          <div className="slack-preview-body">{TEMPLATES[picked].body(ctx)}</div>
          <a
            className="link-btn"
            href={`slack://open`}
            onClick={(e) => {
              // Best-effort: try the Slack deeplink, fall back to web.
              setTimeout(() => {
                window.open('https://slack.com', '_blank', 'noreferrer');
              }, 600);
              e.preventDefault();
              window.location.href = 'slack://open';
            }}
          >
            Open Slack →
          </a>
        </div>
      )}
    </div>
  );
}

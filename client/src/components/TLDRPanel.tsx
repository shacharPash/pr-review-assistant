import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store.js';
import { usePrefs } from '../state/preferences.js';
import { DiagramPanel } from './DiagramPanel.js';
import type { PersonaId } from '@shared/personas';

type Kind = 'core' | 'risk' | 'note';
interface Bullet { kind: Kind; text: string; }

const KIND_LABEL: Record<Kind, string> = { core: '★', risk: '!', note: '·' };
const KIND_TITLE: Record<Kind, string> = {
  core: 'Core change', risk: 'Watch out for', note: 'Context',
};

type TabId = 'brief' | PersonaId;

// Plain English first — it streams faster than Brief (which needs deeper
// model reasoning to name specific files/risks) so the user gets readable
// output sooner. Brief still pre-warms in the background.
const TABS: { id: TabId; emoji: string; label: string }[] = [
  { id: 'explain', emoji: '💬', label: 'Plain English' },
  { id: 'brief', emoji: '📌', label: 'Brief' },
  { id: 'checklist', emoji: '✅', label: 'Checklist' },
  { id: 'tweet', emoji: '🐦', label: 'Tweet' },
];

export function TLDRPanel() {
  const tldr = useStore((s) => s.tldr);
  const retry = useStore((s) => s.retryTLDR);
  const retryPersona = useStore((s) => s.retryPersona);
  const bundle = useStore((s) => s.bundle);
  const activeTab = useStore((s) => s.activeTab);
  const selectTab = useStore((s) => s.selectTab);
  const personaResults = useStore((s) => s.personaResults);
  const collapsed = usePrefs((s) => s.tldrCollapsed);
  const toggleTLDR = usePrefs((s) => s.toggleTLDR);

  // Warm up all tabs on first load so they're ready when the user clicks
  // between them. End on selectTab('explain') so Plain English is what
  // they see first — it streams faster than Brief because the model
  // doesn't need deep reasoning to write friendly prose.
  useEffect(() => {
    if (!bundle) return;
    if (!personaResults.checklist) selectTab('checklist');
    if (!personaResults.tweet) selectTab('tweet');
    if (!personaResults.explain) selectTab('explain');
    selectTab('explain');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle?.meta?.headSha]);

  if (!bundle) return null;
  if (tldr.status === 'idle') return null;

  if (collapsed) {
    return (
      <button className="tldr-collapsed-pill" onClick={toggleTLDR} title="Show summary">
        <span>📌 Show summary</span>
      </button>
    );
  }

  return (
    <div className="tldr">
      <div className="tldr-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={`tldr-tab ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => selectTab(t.id)}
          >
            <span className="tab-emoji">{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
        <button
          className="tldr-close"
          onClick={toggleTLDR}
          title="Hide summary (more room for files)"
          aria-label="Hide summary"
        >
          ✕
        </button>
      </div>

      {activeTab === 'brief' && <BriefTab tldr={tldr} retry={retry} />}
      {activeTab === 'explain' && (
        <PersonaPaneExplain
          result={personaResults.explain}
          retry={() => retryPersona('explain')}
        />
      )}
      {activeTab === 'checklist' && (
        <PersonaPaneChecklist
          result={personaResults.checklist}
          retry={() => retryPersona('checklist')}
        />
      )}
      {activeTab === 'tweet' && (
        <PersonaPaneTweet
          result={personaResults.tweet}
          retry={() => retryPersona('tweet')}
        />
      )}

      <DiagramPanel />
    </div>
  );
}

function BriefTab({
  tldr,
  retry,
}: {
  tldr: ReturnType<typeof useStore.getState>['tldr'];
  retry: () => void;
}) {
  const bullets = useMemo(
    () => (tldr.status === 'done' ? parseBullets(tldr.text) : []),
    [tldr.status, tldr.text],
  );

  if (tldr.status === 'error') {
    return (
      <div className="tldr-error">
        {tldr.error || "Couldn't generate review notes."}
        <button className="link-btn retry" onClick={retry}>Retry</button>
      </div>
    );
  }
  if (tldr.status === 'streaming') {
    if (!tldr.text) {
      return (
        <div className="tldr-skeleton" aria-label="Generating brief">
          <div className="skel-row" style={{ width: '88%' }} />
          <div className="skel-row" style={{ width: '74%' }} />
          <div className="skel-row" style={{ width: '92%' }} />
          <div className="skel-row" style={{ width: '64%' }} />
        </div>
      );
    }
    return (
      <div className="tldr-streaming-raw">
        {tldr.text}
        <span className="cursor" />
      </div>
    );
  }
  return (
    <div className="tldr-body">
      {bullets.map((b, i) => (
        <div key={i} className={`tldr-bullet ${b.kind}`} title={KIND_TITLE[b.kind]}>
          <div className="icon">{KIND_LABEL[b.kind]}</div>
          <div className="text" dangerouslySetInnerHTML={{ __html: renderInline(b.text) }} />
        </div>
      ))}
    </div>
  );
}

function PersonaPaneExplain({
  result,
  retry,
}: {
  result: ReturnType<typeof useStore.getState>['personaResults']['explain'];
  retry: () => void;
}) {
  if (!result) {
    return (
      <div className="persona-loading">
        <div className="emoji-big">💬</div>
        <div>Writing the plain-English version…</div>
      </div>
    );
  }
  if (result.status === 'error') {
    return (
      <div className="tldr-error">
        {result.error}
        <button className="link-btn retry" onClick={retry}>Retry</button>
      </div>
    );
  }
  // Render paragraphs separately so each gets its own block spacing.
  const paragraphs = result.text.split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <div className="persona-body explain">
      {paragraphs.map((p, i) => (
        <p
          key={i}
          className="explain-paragraph"
          dangerouslySetInnerHTML={{ __html: renderRich(p) }}
        />
      ))}
      {result.status === 'streaming' && <span className="cursor" />}
    </div>
  );
}

function PersonaPaneChecklist({
  result,
  retry,
}: {
  result: ReturnType<typeof useStore.getState>['personaResults']['checklist'];
  retry: () => void;
}) {
  // Local-only checkmark state; not persisted because it's a thinking tool, not a record.
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  if (!result) {
    return (
      <div className="persona-loading">
        <div className="emoji-big">✅</div>
        <div>Generating the verification checklist…</div>
      </div>
    );
  }
  if (result.status === 'error') {
    return (
      <div className="tldr-error">
        {result.error}
        <button className="link-btn retry" onClick={retry}>Retry</button>
      </div>
    );
  }

  const items = parseChecklistItems(result.text);

  return (
    <div className="persona-body checklist">
      {items.map((item, i) => (
        <label key={i} className={`check-item ${checked[i] ? 'done' : ''}`}>
          <input
            type="checkbox"
            checked={!!checked[i]}
            onChange={(e) => setChecked((c) => ({ ...c, [i]: e.target.checked }))}
          />
          <span
            className="check-text"
            dangerouslySetInnerHTML={{ __html: renderRich(item) }}
          />
        </label>
      ))}
      {result.status === 'streaming' && <span className="cursor" />}
    </div>
  );
}

function PersonaPaneTweet({
  result,
  retry,
}: {
  result: ReturnType<typeof useStore.getState>['personaResults']['tweet'];
  retry: () => void;
}) {
  if (!result) {
    return (
      <div className="persona-loading">
        <div className="emoji-big">🐦</div>
        <div>Crafting the one-liner…</div>
      </div>
    );
  }
  if (result.status === 'error') {
    return (
      <div className="tldr-error">
        {result.error}
        <button className="link-btn retry" onClick={retry}>Retry</button>
      </div>
    );
  }
  const text = result.text.trim();
  const len = text.length;
  return (
    <div className="persona-body tweet">
      <div
        className="tweet-text"
        dangerouslySetInnerHTML={{ __html: renderInline(text) }}
      />
      {result.status === 'streaming' && <span className="cursor" />}
      {result.status === 'done' && (
        <div className={`tweet-meta ${len > 280 ? 'over' : ''}`}>
          {len} / 280 characters
        </div>
      )}
    </div>
  );
}

function parseBullets(text: string): Bullet[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const result: Bullet[] = [];
  let current: string | null = null;
  const push = () => {
    if (!current) return;
    result.push({ kind: classify(current), text: current.trim() });
    current = null;
  };
  for (const line of lines) {
    if (/^[-*•]\s+/.test(line)) {
      push();
      current = line.replace(/^[-*•]\s+/, '');
    } else if (current) {
      current += ' ' + line;
    } else {
      current = (current ?? '') + ' ' + line;
    }
  }
  push();
  return result.length > 0 ? result : [{ kind: 'note', text: text.trim() }];
}

function classify(text: string): Kind {
  const lc = text.toLowerCase().slice(0, 80);
  if (/risk\b|risky|concern|watch out|silently|race|deadlock|leak|gotcha|edge case|missing test|no test/.test(lc)) return 'risk';
  if (/core (change|fix)|main change|fixes?|adds?\b|removes?\b|replaces?|introduces?|now (composes|computes|returns|skips|uses)|moves? from/.test(lc)) return 'core';
  return 'note';
}

function parseChecklistItems(text: string): string[] {
  const lines = text.split('\n');
  const out: string[] = [];
  let buf: string | null = null;
  const push = () => {
    if (buf?.trim()) out.push(buf.trim());
    buf = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    // Match "[ ] something" or "- [ ] something" or "1. [ ] something"
    const m = line.match(/^(?:[-*•]\s*)?(?:\d+\.\s*)?\[\s*[\sxX]?\s*\]\s*(.+)$/);
    if (m) {
      push();
      buf = m[1];
    } else if (buf && line) {
      buf += ' ' + line;
    }
  }
  push();
  return out;
}

/** Inline backticks → <code>. HTML-escaped. */
function renderInline(text: string): string {
  const escaped = escapeHTML(text);
  return escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** Inline backticks + **bold** + auto-link of bare http URLs. */
function renderRich(text: string): string {
  const escaped = escapeHTML(text);
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^"])\b(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>');
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

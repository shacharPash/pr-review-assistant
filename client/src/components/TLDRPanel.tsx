import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store.js';
import { usePrefs } from '../state/preferences.js';
import { DiagramPanel } from './DiagramPanel.js';
import { ReviewActivityPane } from './ReviewActivityPane.js';
import { JiraIcon } from './JiraIcon.js';
import type { PersonaId } from '@shared/personas';
import { checklistSource } from '@shared/jira';

type Kind = 'core' | 'risk' | 'note';
interface Bullet { kind: Kind; text: string; }

// Per-kind presentation for the Changes & Risks card stack.
const KIND_TAG: Record<Kind, string> = {
  core: 'Core change', risk: '⚠ Risk', note: 'Context',
};

type TabId = 'brief' | PersonaId | 'activity';

// Plain English first — it streams faster than Changes & Risks (which needs
// deeper model reasoning to name specific files/risks) so the user gets
// readable output sooner. The other tabs still pre-warm in the background.
const TABS: { id: TabId; emoji: string; label: string }[] = [
  { id: 'explain', emoji: '💬', label: 'Plain English' },
  { id: 'brief', emoji: '🎯', label: 'Changes & Risks' },
  { id: 'checklist', emoji: '✅', label: 'Checklist' },
  { id: 'activity', emoji: '🤖', label: 'Activity' },
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
      {activeTab === 'activity' && <ReviewActivityPane />}

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
    <div className="tldr-body cards">
      {bullets.map((b, i) => {
        const ref = extractRef(b.text);
        return (
          <div key={i} className={`insight ${b.kind}`}>
            <div className="insight-top">
              <span className="insight-tag">{KIND_TAG[b.kind]}</span>
              {ref && <span className="insight-ref">{ref}</span>}
            </div>
            <div
              className="insight-text"
              dangerouslySetInnerHTML={{ __html: renderRich(b.text) }}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pull a `file.ext:line` (or `file.ext:line-line`) reference out of a bullet so
 * it can be pinned as a chip in the card header — it's the payoff of this pane
 * (where to look), so it shouldn't stay buried in the prose. Returns the first
 * match; the text still renders in full below.
 */
function extractRef(text: string): string | null {
  const m = text.match(/\b([\w./-]+\.[A-Za-z]{1,5}:\d+(?:-\d+)?)\b/);
  return m ? m[1] : null;
}

function PersonaPaneExplain({
  result,
  retry,
}: {
  result: ReturnType<typeof useStore.getState>['personaResults']['explain'];
  retry: () => void;
}) {
  if (!result || (result.status === 'streaming' && !result.text)) {
    return (
      <div className="tldr-skeleton" aria-label="Writing plain-English summary">
        <div className="skel-row" style={{ width: '94%' }} />
        <div className="skel-row" style={{ width: '78%' }} />
        <div className="skel-row" style={{ width: '0', height: 6 }} />
        <div className="skel-row" style={{ width: '88%' }} />
        <div className="skel-row" style={{ width: '60%' }} />
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
  const jira = useStore((s) => s.bundle?.jira);
  const source = checklistSource(jira);

  if (!result || (result.status === 'streaming' && !result.text)) {
    return (
      <div className="tldr-skeleton" aria-label="Generating verification checklist">
        <div className="skel-row check" style={{ width: '92%' }} />
        <div className="skel-row check" style={{ width: '82%' }} />
        <div className="skel-row check" style={{ width: '88%' }} />
        <div className="skel-row check" style={{ width: '70%' }} />
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
      <ChecklistSource source={source} />
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

/**
 * Tells the reviewer where the checklist items came from: the linked Jira
 * ticket's acceptance criteria (when fully connected) or AI-generated from the
 * diff. Mirrors the server's prompt choice — both call `checklistSource`.
 */
function ChecklistSource({ source }: { source: ReturnType<typeof checklistSource> }) {
  if (source.mode === 'jira') {
    return (
      <div className="checklist-source jira">
        <JiraIcon size={13} className="" />
        <span>
          Acceptance criteria from <span className="key">{source.ticket.key}</span>
        </span>
        <a className="open" href={source.ticket.url} target="_blank" rel="noreferrer">
          open ticket →
        </a>
      </div>
    );
  }
  return (
    <div className="checklist-source ai">
      <span aria-hidden="true">✨</span>
      <span>AI-generated from the diff — verify before approving</span>
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

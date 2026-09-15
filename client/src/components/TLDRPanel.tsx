import { SafeInline } from '../lib/SafeMarkdown.js';
import { Fragment, useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { usePrefs } from '../state/preferences.js';
import { DiagramPanel } from './DiagramPanel.js';
import { ReviewActivityPane } from './ReviewActivityPane.js';
import { AIReviewPane } from './AIReviewPane.js';
import { AskPane } from './AskPane.js';
import { AIMark } from './AIMark.js';
import { JiraIcon } from './JiraIcon.js';
import { RailSectionHead } from './RailSectionHead.js';
import type { PersonaId } from '@shared/personas';
import { checklistSource } from '@shared/jira';

type TabId = 'ai-review' | 'ask' | PersonaId | 'activity';

// Plain English first — it streams faster than the AI Review (which needs deep
// model reasoning to find real issues) so the user gets readable output sooner.
// The two AI-powered tabs (AI Review + Ask) sit together and are marked as a
// pair (shared hex-node mark, gradient accent, hairline separators — see `ai`).
const TABS: { id: TabId; emoji: string; label: string; ai?: boolean }[] = [
  { id: 'explain', emoji: '💬', label: 'Plain English' },
  { id: 'ai-review', emoji: '🔎', label: 'AI Review', ai: true },
  { id: 'ask', emoji: '💭', label: 'Ask', ai: true },
  { id: 'checklist', emoji: '✅', label: 'Checklist' },
  { id: 'activity', emoji: '🤖', label: 'Activity' },
];

export function TLDRPanel() {
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

  if (collapsed) {
    return (
      <div className="tldr rail-section is-collapsed">
        <RailSectionHead title="💡 Insights" collapsed onToggle={toggleTLDR} />
      </div>
    );
  }

  return (
    <div className="tldr rail-section">
      <RailSectionHead title="💡 Insights" collapsed={false} onToggle={toggleTLDR} />
      <div className="tldr-tabs" role="tablist">
        {TABS.map((t, i) => {
          // Hairline separators bracket the AI pair from the utility tabs.
          const sepBefore = t.ai && !TABS[i - 1]?.ai;
          const sepAfter = t.ai && !TABS[i + 1]?.ai;
          return (
            <Fragment key={t.id}>
              {sepBefore && <span className="tab-sep" aria-hidden="true" />}
              <button
                role="tab"
                aria-selected={activeTab === t.id}
                className={`tldr-tab ${activeTab === t.id ? 'active' : ''} ${t.ai ? 'is-ai' : ''}`}
                onClick={() => selectTab(t.id)}
              >
                {t.ai ? (
                  <AIMark size={15} className="tab-ai-mark" />
                ) : (
                  <span className="tab-emoji">{t.emoji}</span>
                )}
                <span>{t.label}</span>
              </button>
              {sepAfter && <span className="tab-sep" aria-hidden="true" />}
            </Fragment>
          );
        })}
      </div>

      {activeTab === 'ai-review' && <AIReviewPane />}
      {activeTab === 'ask' && <AskPane />}
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
          children={<SafeInline text={p} />}
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
            children={<SafeInline text={item} />}
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


function escapeHTML(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

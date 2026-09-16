import { SafeMarkdown } from '../lib/SafeMarkdown.js';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@shared/aiChat';
import { useStore } from '../state/store.js';
import { AIMark } from './AIMark.js';

/**
 * "Ask" tab , a multi-turn chat about the current PR. Sits next to AI Review as
 * the second AI-powered tab. The model gets the full diff plus whichever file
 * is currently open (see store.askChat), so questions like "what does this do?"
 * resolve to the code on screen. Conversation is in-memory only and resets when
 * a new PR loads.
 */
export function AskPane() {
  const chat = useStore((s) => s.chat);
  const askChat = useStore((s) => s.askChat);
  const resetChat = useStore((s) => s.resetChat);
  const activeFilePath = useStore((s) => s.activeFilePath);
  const useFocus = useStore((s) => s.chatUseFocus);
  const toggleChatFocus = useStore((s) => s.toggleChatFocus);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const streaming = chat.status === 'streaming';
  const empty = chat.messages.length === 0;
  const focusName = activeFilePath ? shortPath(activeFilePath) : null;

  // Keep the newest message in view as it streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat.messages, chat.status]);

  // Auto-grow the composer up to a cap.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft]);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || streaming) return;
    setDraft('');
    askChat(q);
  };

  return (
    <div className="ask-pane">
      <div className="ask-scroll" ref={scrollRef}>
        {empty ? (
          <AskEmptyState
            focusName={useFocus ? focusName : null}
            disabled={streaming}
            onPick={(q) => send(q)}
          />
        ) : (
          chat.messages.map((m, i) => (
            <ChatBubble
              key={i}
              message={m}
              streaming={streaming && i === chat.messages.length - 1 && m.role === 'assistant'}
            />
          ))
        )}
        {chat.status === 'error' && (
          <div className="ask-error">{chat.error || 'The chat request failed.'}</div>
        )}
      </div>

      <div className="ask-composer">
        {focusName && (
          <button
            type="button"
            className={`ask-focus ${useFocus ? 'on' : 'off'}`}
            onClick={toggleChatFocus}
            aria-pressed={useFocus}
            title={
              useFocus
                ? `Answering with ${activeFilePath} in focus. Click to answer about the whole PR instead.`
                : `Answering about the whole PR. Click to focus the open file (${activeFilePath}).`
            }
          >
            <span className={`ask-focus-switch ${useFocus ? 'on' : ''}`} aria-hidden="true">
              <span className="ask-focus-knob" />
            </span>
            {useFocus ? (
              <span>answering with <code>{focusName}</code> in focus</span>
            ) : (
              <span>answering about the <strong>whole PR</strong></span>
            )}
          </button>
        )}
        <div className="ask-input-row">
          <textarea
            ref={taRef}
            className="ask-input"
            aria-label="Question about this PR"
            placeholder="Ask anything about this PR…"
            value={draft}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          <button
            className="ask-send"
            onClick={() => send(draft)}
            disabled={!draft.trim() || streaming}
            title="Send (Enter)"
            aria-label="Send question"
          >
            ↩
          </button>
        </div>
        {!empty && (
          <button
            className="link-btn small ask-clear"
            onClick={resetChat}
            disabled={streaming}
          >
            Clear chat
          </button>
        )}
      </div>
    </div>
  );
}

function AskEmptyState({
  focusName,
  disabled,
  onPick,
}: {
  focusName: string | null;
  disabled: boolean;
  onPick: (q: string) => void;
}) {
  const suggestions = [
    'What is the main change, and where?',
    "What's the riskiest part to review?",
    focusName ? `Explain ${focusName}` : 'Any edge cases not handled?',
  ];
  return (
    <div className="ask-empty">
      <AIMark size={40} className="ask-empty-mark" />
      <div className="ask-empty-title">Ask anything about this PR</div>
      <div className="ask-empty-sub">
        The AI has the full diff{focusName ? <> and <code>{focusName}</code> in focus</> : null}.
        {' '}Answers cite real files and lines.
      </div>
      <div className="ask-chips">
        {suggestions.map((s) => (
          <button key={s} className="ask-chip" disabled={disabled} onClick={() => onPick(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="chat-row user">
        <div className="chat-bubble user">{message.content}</div>
      </div>
    );
  }
  return (
    <div className="chat-row ai">
      <AIMark size={16} className="chat-ai-mark" />
      <div className="chat-bubble ai">
        {message.content ? (
          <div className="chat-md"><SafeMarkdown text={message.content} /></div>
        ) : (
          <span className="chat-dots" aria-label="Thinking">
            <span />
            <span />
            <span />
          </span>
        )}
        {streaming && message.content && <span className="cursor" />}
      </div>
    </div>
  );
}

function shortPath(path: string): string {
  const parts = path.split('/');
  return parts.length <= 2 ? path : `…/${parts.slice(-2).join('/')}`;
}

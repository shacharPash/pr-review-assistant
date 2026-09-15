/**
 * AI Chat: a lightweight, multi-turn Q&A over a single PR. Distinct from the
 * TL;DR (which onboards the reviewer) and the AI Review (a bug-bot pass) , this
 * just answers the reviewer's questions about the change, grounded in the full
 * diff plus whichever file they currently have open in the diff.
 *
 * Unlike the other AI features this streams over POST: the conversation grows
 * past what a querystring / EventSource can carry. The response body is framed
 * as NDJSON , one `AiChatEvent` per line.
 */

import type { TokenUsage } from './usage.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * What the reviewer currently has open in the diff, so a question like "what
 * does this do?" resolves to the code on screen without them naming the file.
 */
export interface ChatFocus {
  path: string;
  startLine?: number;
  endLine?: number;
}

export interface AiChatRequest {
  owner: string;
  repo: string;
  number: number;
  headSha: string;
  /** Full conversation so far, oldest first, ending with the new user turn. */
  messages: ChatMessage[];
  focus?: ChatFocus;
  /** 'fast' | 'smart' , mirrors the app's model picker (see claudeRunner). */
  mode?: string;
}

/** One NDJSON line on the /api/ai-chat/stream response body. */
export type AiChatEvent =
  | { type: 'chunk'; delta: string }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'done' }
  | { type: 'error'; message: string };

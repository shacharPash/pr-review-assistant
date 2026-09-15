import { launchClaude, type ClaudeLauncher } from './claudePolicy.js';
import type { PRBundle } from '../../shared/types.js';
import type { TokenUsage } from '../../shared/usage.js';

export type { TokenUsage };

const MAX_DIFF_CHARS = 200_000;

export interface RunOptions {
  /** Override the default reviewer-onboarding system prompt with a custom one. */
  systemPrompt?: string;
  /**
   * Claude model alias passed to `--model` ('sonnet', 'opus', 'haiku', or a
   * full id like 'claude-sonnet-4-6'). Defaults to the user's `claude` CLI
   * default — usually whatever they're authenticated with — which can be
   * Opus and therefore slow for short outputs. Short-form routes (headline,
   * plain-english, checklist) should override to 'sonnet' for ~3× faster
   * generation with no meaningful quality drop on those tasks.
   */
  model?: string;
}

/**
 * Routes self-declare which tier they belong to so the model picker can be
 * defined in one place. Heavy = routes where stronger reasoning genuinely
 * moves quality (TL;DR, diagram). Light = short outputs where Opus would
 * just burn tokens (headline, before-after, complexity, persona tabs).
 */
export type RouteTier = 'heavy' | 'light';
export type AIMode = 'fast' | 'smart';

/**
 * Resolve `?mode=fast|smart` to an actual Claude model based on the route's
 * tier. Smart upgrades heavy routes to Opus and leaves light routes on
 * Sonnet — never Opus for short outputs, regardless of mode. Unknown or
 * missing values fall back to 'smart' so the demo still works if the URL
 * is hand-crafted.
 */
export function pickModel(rawMode: unknown, tier: RouteTier): RunOptions['model'] {
  const mode: AIMode = rawMode === 'fast' ? 'fast' : 'smart';
  if (tier === 'light') return 'sonnet';
  return mode === 'smart' ? 'opus' : 'sonnet';
}

export interface RunnerEvents {
  onChunk: (delta: string) => void;
  onDone: (fullText: string) => void;
  onError: (msg: string) => void;
  /** Fired once per run, just before `onDone`, when the `result` event carries usage. */
  onUsage?: (usage: TokenUsage) => void;
}

export class ClaudeRunner {
  private cancel: (() => void) | null = null;
  private buffer = '';
  private lastText = '';
  private aborted = false;
  private started = false;
  private terminal = false;
  private sawResult = false;
  private resultFailed = false;
  private lastUsage: TokenUsage | null = null;

  constructor(private readonly events: RunnerEvents, private readonly launcher: ClaudeLauncher = launchClaude) {}

  start(bundle: PRBundle, opts: RunOptions = {}): void {
    this.startPrompt(opts.systemPrompt ? buildCustomPrompt(bundle, opts.systemPrompt) : buildPrompt(bundle), opts);
  }

  /** All AI paths, including comment helpers, use the same execution policy. */
  startPrompt(prompt: string, opts: RunOptions = {}): void {
    if (this.started || this.aborted) return;
    this.started = true;
    this.cancel = this.launcher(prompt, {
      onData: (chunk) => { if (!this.aborted) this.onStdout(chunk); },
      onClose: (error) => {
        if (this.aborted || this.terminal) return;
        this.terminal = true;
        if (this.buffer.trim()) this.handleLine(this.buffer);
        this.buffer = '';
        if (error) this.events.onError(error);
        else if (this.resultFailed) this.events.onError('Claude did not complete the request.');
        else if (!this.sawResult) this.events.onError('Claude returned no valid result.');
        else this.events.onDone(this.lastText);
      },
    }, opts.model);
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    this.cancel?.();
  }

  private onStdout(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      this.handleLine(line);
    }
  }

  private handleLine(line: string): void {
    let event: ClaudeEvent;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    if (!event || typeof event !== 'object') return;
    if (event.type === 'result') {
      this.sawResult = typeof event.result === 'string';
      this.resultFailed = event.is_error === true;
      if (this.resultFailed) return;
    }

    // Capture usage from assistant events regardless of text — it's the
    // authoritative cumulative count and the result event may omit it.
    if (event.type === 'assistant' && event.message?.usage) {
      const u = normalizeClaudeUsage(event.message.usage);
      if (u) this.lastUsage = u;
    }

    if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
      const text = extractText(event.message.content);
      if (text && text.length > this.lastText.length && text.startsWith(this.lastText)) {
        const delta = text.slice(this.lastText.length);
        this.lastText = text;
        this.events.onChunk(delta);
      } else if (text && text !== this.lastText) {
        // Non-monotonic update: replace by sending nothing extra; final text wins on done.
        this.lastText = text;
      }
    } else if (event.type === 'result' && typeof event.result === 'string') {
      // Authoritative final text — emit any tail not yet sent.
      const final = event.result;
      if (final.length > this.lastText.length && final.startsWith(this.lastText)) {
        const delta = final.slice(this.lastText.length);
        this.lastText = final;
        this.events.onChunk(delta);
      } else {
        this.lastText = final;
      }
      // Prefer the result event's own usage; fall back to the last usage seen
      // on an assistant event so the token badge still populates on CLI
      // versions whose result event omits the top-level usage block.
      const usage = normalizeClaudeUsage(event.usage) ?? this.lastUsage;
      if (usage && this.events.onUsage) {
        this.events.onUsage(usage);
      }
    }
  }
}

interface ClaudeContentBlock {
  type: string;
  text?: string;
}
interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/**
 * Normalize Claude's snake_case usage block into the camelCase shape the
 * client store consumes. Exported so non-streaming callers (aiComment)
 * can share the same parsing and avoid drift.
 */
export function normalizeClaudeUsage(raw: ClaudeUsage | undefined): TokenUsage | null {
  if (!raw) return null;
  return {
    input: raw.input_tokens ?? 0,
    output: raw.output_tokens ?? 0,
    cacheRead: raw.cache_read_input_tokens ?? 0,
    cacheCreation: raw.cache_creation_input_tokens ?? 0,
  };
}
interface ClaudeEvent {
  type: string;
  is_error?: boolean;
  message?: { content?: ClaudeContentBlock[]; usage?: ClaudeUsage };
  result?: string;
  usage?: ClaudeUsage;
}

function extractText(content: ClaudeContentBlock[]): string {
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
}

function buildCustomPrompt(bundle: PRBundle, systemPrompt: string): string {
  const ctx = buildContext(bundle);
  // Anchor the format rule at the END too. Large contexts (especially when
  // Jira ticket descriptions get inlined) push the system prompt far away
  // from where Claude generates, which empirically lets chain-of-thought
  // openers like "Let me write…" or "The sentence:" slip through. Restating
  // the rule right before generation makes it the last thing Claude sees.
  const trailingReminder = `\n\n---\nREMINDER: Output ONLY the format requested in the system prompt at the top of this message.
- No preamble of any kind ("Let me write…", "The summary:", "The sentence:", "The PR is…", "This is a clear PR…", etc.)
- No trailing meta ("That's N characters.", "Let me trim.")
- No second sentence unless the format explicitly asks for one
- Begin with the first word of the actual output`;
  return `${systemPrompt}\n\n${ctx}${trailingReminder}`;
}

function buildContext(bundle: PRBundle): string {
  const { meta, files, commitMessages } = bundle;

  const fileList = files
    .map((f) => `- ${f.path} (${f.status}, +${f.additions} -${f.deletions}${f.noise ? `, noise:${f.noise}` : ''})`)
    .join('\n');

  let diff = files
    .filter((f) => !f.noise && !f.binary)
    .map((f) => `### ${f.path}\n\`\`\`diff\n${f.rawPatch}\n\`\`\``)
    .join('\n\n');

  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS) + '\n\n... [truncated for length] ...';
  }

  const jiraSection = formatJiraContext(bundle);

  return `PR title: ${meta.title}
Author: ${meta.author}
State: ${meta.state}

PR description:
${meta.body || '(empty)'}
${jiraSection}
Commit messages:
${commitMessages.map((m) => `- ${m.split('\n')[0]}`).join('\n') || '(none)'}

Changed files:
${fileList}

Diff:
${diff}`;
}

/**
 * Build the Jira context section for Claude prompts.
 *
 * Includes ONLY the ticket key, type, status, and title — not the
 * description. The description (up to several KB of corporate Jira prose)
 * was historically inlined here, but it diluted strict prompt instructions
 * (e.g. the short personas' "no preamble" rules) and Claude would echo its
 * register verbatim ("The summary is the only output requested.", "Let me write…").
 * The checklist's Jira-AC mode is the deliberate exception: it injects the
 * ticket description via its own system prompt (see routes/explain.ts), not here.
 * Title + status is enough linkage; the user can read the full ticket via
 * the Jira badge popover.
 */
function formatJiraContext(bundle: PRBundle): string {
  const tickets = bundle.jira?.tickets ?? [];
  if (tickets.length === 0) return '';
  const blocks = tickets.map(
    (t) => `- [${t.key}] (${t.type}, ${t.status}) ${t.title}`,
  );
  return `\nLinked Jira ticket${tickets.length > 1 ? 's' : ''}:\n${blocks.join('\n')}\n`;
}

function buildPrompt(bundle: PRBundle): string {
  const { meta, files, commitMessages } = bundle;

  const fileList = files
    .map((f) => `- ${f.path} (${f.status}, +${f.additions} -${f.deletions}${f.noise ? `, noise:${f.noise}` : ''})`)
    .join('\n');

  let diff = files
    .filter((f) => !f.noise && !f.binary)
    .map((f) => `### ${f.path}\n\`\`\`diff\n${f.rawPatch}\n\`\`\``)
    .join('\n\n');

  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS) + '\n\n... [truncated for length] ...';
  }

  return `You are onboarding a human code reviewer to a pull request. Your job is
NOT to review the code yourself — only to point them at what matters so they
review faster and don't miss anything.

Write 2–4 short bullets, ONE per line. Start EACH line with one of these
tags (UPPERCASE, followed by a colon) so each can be classified exactly:

- "CHANGE:" — the single most important behavior change: what changed and
  where (file path AND function name or line range). Emit EXACTLY one.
- "RISK:" — the one thing the reviewer should scrutinize most. Name an actual
  line, function, or edge case (not "may introduce bugs"). Emit EXACTLY one.
- "CONTEXT:" — an optional non-obvious blast-radius point, a missing test, or
  a callsite worth checking. Emit 0–2, only if real.

Order: CHANGE first, then RISK, then any CONTEXT. No markdown headers, no
preamble, no leading "-"/"*" — just "TAG: text", one per line.

Be CONCRETE. Forbidden: generic phrasing like "improves the codebase",
"various fixes", "refactors for clarity" — if a bullet would also fit an
unrelated PR, rewrite it.

If the PR is a tiny dep bump or doc change, emit a single "CHANGE:" line and stop.

PR title: ${meta.title}
Author: ${meta.author}
State: ${meta.state}

PR description:
${meta.body || '(empty)'}
${formatJiraContext(bundle)}
Commit messages:
${commitMessages.map((m) => `- ${m.split('\n')[0]}`).join('\n') || '(none)'}

Changed files:
${fileList}

Diff:
${diff}
`;
}

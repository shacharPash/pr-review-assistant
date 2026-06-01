import { spawn } from 'node:child_process';
import type { PRBundle } from '../../shared/types.js';
import type { TokenUsage } from '../../shared/usage.js';

export type { TokenUsage };

const MAX_DIFF_CHARS = 200_000;
const TIMEOUT_MS = 90_000;

export interface RunOptions {
  /** Override the default reviewer-onboarding system prompt with a custom one. */
  systemPrompt?: string;
  /**
   * Claude model alias passed to `--model` ('sonnet', 'opus', 'haiku', or a
   * full id like 'claude-sonnet-4-6'). Defaults to the user's `claude` CLI
   * default — usually whatever they're authenticated with — which can be
   * Opus and therefore slow for short outputs. Short-form routes (headline,
   * tweet, plain-english) should override to 'sonnet' for ~3× faster
   * generation with no meaningful quality drop on those tasks.
   */
  model?: string;
}

/**
 * Validate a `?model=...` query value and return it if it's a known alias.
 * Returns undefined for anything else (including 'auto'), which signals to
 * the caller: "fall back to the route's per-feature default".
 */
export function validateModelParam(raw: unknown): RunOptions['model'] {
  if (typeof raw !== 'string') return undefined;
  return raw === 'sonnet' || raw === 'opus' || raw === 'haiku' ? raw : undefined;
}

export interface RunnerEvents {
  onChunk: (delta: string) => void;
  onDone: (fullText: string) => void;
  onError: (msg: string) => void;
  /** Fired once per run, just before `onDone`, when the `result` event carries usage. */
  onUsage?: (usage: TokenUsage) => void;
}

export class ClaudeRunner {
  private child: ReturnType<typeof spawn> | null = null;
  private buffer = '';
  private lastText = '';
  private aborted = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly events: RunnerEvents) {}

  start(bundle: PRBundle, opts: RunOptions = {}): void {
    const prompt = opts.systemPrompt
      ? buildCustomPrompt(bundle, opts.systemPrompt)
      : buildPrompt(bundle);
    const args = ['-p', '--output-format', 'stream-json', '--verbose'];
    if (opts.model) args.push('--model', opts.model);
    const proc = spawn('claude', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = proc;

    proc.on('error', (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT') {
        this.events.onError(
          'Claude Code CLI (`claude`) not found on PATH. Install from https://claude.ai/code.',
        );
      } else {
        this.events.onError(`claude failed to start: ${e.message}`);
      }
      this.cleanup();
    });

    proc.stdout!.setEncoding('utf-8');
    proc.stdout!.on('data', (chunk: string) => this.onStdout(chunk));

    let stderr = '';
    proc.stderr!.setEncoding('utf-8');
    proc.stderr!.on('data', (chunk: string) => {
      stderr += chunk;
    });

    proc.on('close', (code) => {
      if (this.aborted) return;
      if (this.timer) clearTimeout(this.timer);
      if (code === 0) {
        this.events.onDone(this.lastText);
      } else {
        const tail = stderr.trim().split('\n').slice(-5).join('\n');
        this.events.onError(`claude exited with code ${code}.${tail ? ` ${tail}` : ''}`);
      }
      this.cleanup();
    });

    this.timer = setTimeout(() => {
      this.events.onError(`Timed out after ${TIMEOUT_MS / 1000}s.`);
      this.abort();
    }, TIMEOUT_MS);

    proc.stdin!.end(prompt);
  }

  abort(): void {
    if (this.aborted) return;
    this.aborted = true;
    if (this.timer) clearTimeout(this.timer);
    this.child?.kill('SIGTERM');
    this.cleanup();
  }

  private cleanup(): void {
    this.child = null;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
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

    if (event.type === 'assistant' && event.message?.content) {
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
      const usage = event.usage;
      if (usage && this.events.onUsage) {
        this.events.onUsage({
          input: usage.input_tokens ?? 0,
          output: usage.output_tokens ?? 0,
          cacheRead: usage.cache_read_input_tokens ?? 0,
          cacheCreation: usage.cache_creation_input_tokens ?? 0,
        });
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
interface ClaudeEvent {
  type: string;
  message?: { content?: ClaudeContentBlock[] };
  result?: string;
  usage?: ClaudeUsage;
}

function extractText(content: ClaudeContentBlock[]): string {
  return content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
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
 * (e.g. the tweet's "no preamble" rule) and Claude would echo its register
 * verbatim ("The summary is the only output requested.", "Let me write…").
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

Write 2–4 short bullets in plain text (no markdown headers, no preamble).
Be CONCRETE. Forbidden:

- Generic phrases like "improves the codebase", "various fixes", "refactors
  for clarity". If your bullet would also fit on an unrelated PR, rewrite it.
- Vague risk like "may introduce bugs". Name an actual line, function, or
  edge case.

Required (exactly one of each, in this order):

1. The single most important behavior change — what changed and where (file
   path AND function name or line range).
2. The thing the reviewer should pay EXTRA attention to. Start the bullet
   with the word "Risk:" or "Watch out:" or "Concern:" so it's classifiable.
   Pick the most load-bearing risk; don't list five.
3. (Optional) One context bullet — a non-obvious blast-radius point, a
   missing test, or a callsite worth checking. Skip if there isn't a real one.

If the PR is a tiny dep bump or doc change, say so in one bullet and stop.

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

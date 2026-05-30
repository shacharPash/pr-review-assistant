import { Router, type Request, type Response } from 'express';
import { ClaudeRunner } from '../services/claudeRunner.js';
import { getBundle, getHeadline, setHeadline } from '../services/cache.js';

export const headlineRouter = Router();

const HEADLINE_PROMPT = `Output a one-sentence summary of this pull request (max ~140 characters).

ABSOLUTE OUTPUT RULES — read carefully:
- Output ONLY the sentence itself. No prefix, no suffix, no commentary.
- Do NOT say "Let me write...", "Here's...", "The PR is...", "Sure,", etc.
- Do NOT mention the character count, word count, or that you trimmed anything.
- Do NOT add any second sentence, even to clarify or expand.
- Do NOT use bullets, headers, code fences, or markdown.

CONTENT RULES:
- Lead with the user-visible behavior change or the bug being fixed.
- No function names, no file paths, no class names.
- If the PR is genuinely a dependency bump or trivial cleanup, say so plainly.

Example of a GOOD response:
Fixes Vercel marketplace resources stuck on "suspended" after an overdue invoice is paid, by pushing live status updates to Vercel.

Example of a BAD response (do not do this):
This is a clear, well-described PR. Let me write the summary. Fixes Vercel marketplace resources... That's 138 characters.`;

/** Strips Claude's chain-of-thought leaks ("Let me write...", "That's N characters") that occasionally slip past the prompt. */
function sanitizeHeadline(raw: string): string {
  let text = raw.trim();

  // Drop common preamble openers up to (but not including) the real first sentence.
  // Loop because Claude sometimes stacks two preambles ("OK. Let me write the summary. Fixes…").
  const preambleRe = /^(?:(?:sure[,!.]|okay?[,!.]|alright[,!.]|here(?:'s|s)\s+(?:the|a|my)\s+(?:summary|one[- ]sentence(?:r| summary)?|sentence|tweet|headline)[:.]?|(?:let me|i(?:'ll| will))\s+(?:write|draft|give|provide|put together)\s+(?:the|a|my)?\s*(?:summary|one[- ]sentence(?:r| summary)?|sentence|tweet|headline)[:.]?|this\s+(?:is\s+a|pr\s+(?:is|has))[^.]*\.|the\s+pr\s+(?:is|has|describes|covers)[^.]*\.|i'll\s+keep\s+it[^.]*\.|got it[,!.]?))\s*/i;
  for (let i = 0; i < 4 && preambleRe.test(text); i++) {
    text = text.replace(preambleRe, '').trimStart();
  }

  // Strip trailing meta about character count / trimming, including any "let me trim" follow-ups.
  text = text
    .replace(/\s*(?:[—-]+\s*)?that(?:'s|s)?\s+\d+\s+(?:char(?:acter)?s?|words?)[^.]*\.?\s*$/i, '')
    .replace(/\s*let me trim[^.]*\.?\s*$/i, '')
    .replace(/\s*\(\s*\d+\s+(?:char(?:acter)?s?|words?)\s*\)\s*$/i, '')
    .trim();

  // If Claude wrote two sentences, keep only the first (cap at the first sentence-ending period).
  // We treat ". " as a sentence boundary; we DO keep periods inside abbreviations because
  // we also require the next char to be a capital letter or end-of-string.
  const sentenceEnd = text.search(/\.\s+[A-Z]/);
  if (sentenceEnd > 0 && sentenceEnd < text.length - 2) {
    text = text.slice(0, sentenceEnd + 1);
  }

  return text.trim();
}

headlineRouter.get('/api/headline/stream', (req: Request, res: Response) => {
  const owner = String(req.query.owner ?? '');
  const repo = String(req.query.repo ?? '');
  const number = Number(req.query.number);
  const headSha = String(req.query.headSha ?? '');

  if (!owner || !repo || !number || !headSha) {
    return res.status(400).json({ error: 'Missing required query params.' });
  }

  const bundle = getBundle(owner, repo, number, headSha);
  if (!bundle) {
    return res.status(404).json({ error: 'PR bundle not in cache.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  let closed = false;
  res.on('error', () => { closed = true; });
  res.on('close', () => { closed = true; });
  const send = (event: string, data: string): void => {
    if (closed) return;
    try {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      closed = true;
    }
  };

  const cached = getHeadline(owner, repo, number, headSha);
  if (cached) {
    send('chunk', cached);
    send('done', '');
    res.end();
    return;
  }

  // We buffer the whole response instead of streaming chunks. The headline
  // is one short sentence, and Claude often opens with "Let me write..."
  // chain-of-thought that streams visibly before we can sanitize it.
  // Buffering lets us strip the leak before the user sees anything.
  const runner = new ClaudeRunner({
    onChunk: () => {
      /* swallow; we only deliver the sanitized full text on done */
    },
    onDone: (full) => {
      const clean = sanitizeHeadline(full);
      setHeadline(owner, repo, number, headSha, clean);
      send('chunk', clean);
      send('done', '');
      res.end();
    },
    onError: (msg) => {
      send('error', msg);
      res.end();
    },
  });

  req.on('close', () => runner.abort());
  runner.start(bundle, { systemPrompt: HEADLINE_PROMPT });
});

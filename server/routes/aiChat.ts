import { Router, type Request, type Response } from 'express';
import { ClaudeRunner, buildAiChatPrompt, pickModel } from '../services/claudeRunner.js';
import { getBundle } from '../services/cache.js';
import type { AiChatRequest, ChatMessage } from '../../shared/aiChat.js';

export const aiChatRouter = Router();

/**
 * Multi-turn PR chat. Mirrors the heavy AI routes (Opus on Smart, Sonnet on
 * Fast) but streams over POST as NDJSON: the growing conversation is too big
 * for a querystring, and EventSource can't POST. Not cached — every question
 * is unique. The diff still renders even if this fails; chat is additive.
 */
aiChatRouter.post('/api/ai-chat/stream', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Partial<AiChatRequest>;
  const owner = String(body.owner ?? '');
  const repo = String(body.repo ?? '');
  const number = Number(body.number);
  const headSha = String(body.headSha ?? '');

  if (!owner || !repo || !number || !headSha) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const messages: ChatMessage[] = (Array.isArray(body.messages) ? body.messages : [])
    .filter(
      (m): m is ChatMessage =>
        !!m &&
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        m.content.trim().length > 0,
    )
    .map((m) => ({ role: m.role, content: m.content }));

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Conversation must end with a user message.' });
  }

  const bundle = getBundle(owner, repo, number, headSha);
  if (!bundle) {
    return res.status(404).json({ error: 'PR bundle not in cache. Fetch /api/pr first.' });
  }

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  // Flush headers immediately so the client's fetch resolves and the stream is
  // established before the (potentially slow) first token — without this, Node
  // buffers headers until the first write and clients time out waiting.
  res.flushHeaders?.();

  let closed = false;
  res.on('error', () => { closed = true; });
  res.on('close', () => { closed = true; });
  const send = (event: unknown): void => {
    if (closed) return;
    try {
      res.write(`${JSON.stringify(event)}\n`);
    } catch {
      closed = true;
    }
  };

  const focus =
    body.focus && typeof body.focus.path === 'string' && body.focus.path
      ? body.focus
      : undefined;
  const prompt = buildAiChatPrompt(bundle, messages, focus);

  const runner = new ClaudeRunner({
    onChunk: (delta) => send({ type: 'chunk', delta }),
    onUsage: (usage) => send({ type: 'usage', usage }),
    onDone: () => {
      send({ type: 'done' });
      res.end();
    },
    onError: (message) => {
      send({ type: 'error', message });
      res.end();
    },
  });

  // Abort on RESPONSE close (client actually disconnected), not request close.
  // This is a POST: `req` fires 'close' as soon as express.json() finishes
  // reading the body — which is immediately — so aborting on `req` close would
  // kill the claude child the instant it spawns (the bug that made chat hang
  // with no output). `res` stays open until we end it or the client leaves.
  res.on('close', () => runner.abort());

  runner.startPrompt(prompt, { model: pickModel(body.mode) });
});

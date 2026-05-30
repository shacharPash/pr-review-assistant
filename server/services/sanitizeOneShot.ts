/**
 * Strip chain-of-thought leaks from Claude's one-shot outputs (headline, tweet).
 *
 * Despite explicit prompt rules, large contexts (e.g. Jira ticket descriptions
 * inlined into the prompt) push the system prompt far from the generation
 * point, and Claude occasionally opens with preamble like "Let me write the
 * summary.", "The sentence:", "This is a clear PR.", or trails with
 * "That's 251 characters." Streaming those leaks to the UI looks unprofessional;
 * we sanitize after buffering instead.
 *
 * Pure function — no side effects, easy to unit-test.
 */
export function sanitizeOneShot(raw: string): string {
  let text = raw.trim();

  // Strip code fences if Claude wrapped the response in markdown.
  text = text.replace(/^```[a-z]*\n?|\n?```\s*$/gi, '').trim();

  // Preamble openers we want to peel off, up to (but not including) the
  // first real sentence. Loop because Claude sometimes stacks them.
  const preambleAtoms = [
    // Filler openers
    String.raw`(?:sure|okay?|alright|got it)[,!.]?`,
    // "Here's the summary:" / "Here's my one-sentence summary."
    String.raw`here(?:'s|s)\s+(?:the|a|my)\s+(?:summary|one[- ]sentence(?:r| summary)?|sentence|tweet|headline)[:.]?`,
    // "Let me write the summary." / "I'll draft the headline." / "I'll keep it short."
    String.raw`(?:let me|i(?:'ll| will))\s+(?:write|draft|give|provide|put together|keep it|just write)[^.]*\.`,
    // "The summary:", "The sentence:", "The PR summary:", "The headline:", "The PR summary is:"
    String.raw`the\s+(?:pr\s+)?(?:summary|sentence|tweet|headline|one[- ]sentence(?:r| summary)?)(?:\s+is)?[:.]?`,
    // "This is a clear PR." / "The PR is well-described." (1-clause meta about the PR)
    String.raw`(?:this\s+is\s+a|the\s+pr\s+(?:is|has|describes|covers))[^.]*\.`,
    // "The PR is merged and the diff is already in front of me — this is a one-shot…"
    String.raw`the\s+pr\s+is\s+merged[^.]*\.`,
    // "This is a one-shot summarization with strict formatting rules…"
    String.raw`this\s+is\s+a\s+one[- ]shot[^.]*\.`,
    // "The summary is the only output requested." — Jira-description echo
    String.raw`the\s+summary\s+is\s+the\s+only\s+output[^.]*\.`,
  ];
  const preambleRe = new RegExp(`^(?:${preambleAtoms.join('|')})\\s*`, 'i');
  for (let i = 0; i < 6 && preambleRe.test(text); i++) {
    text = text.replace(preambleRe, '').trimStart();
  }

  // Strip trailing character-count meta, with or without an em-dash, and any
  // "let me trim" follow-ups Claude tacks on after a self-count.
  text = text
    .replace(/\s*(?:[—-]+\s*)?that(?:'s|s)?\s+\d+\s+(?:char(?:acter)?s?|words?)[^.]*\.?\s*$/i, '')
    .replace(/\s*[—-]+\s*let me trim[^.]*\.?\s*$/i, '')
    .replace(/\s*let me trim[^.]*\.?\s*$/i, '')
    .replace(/\s*\(\s*\d+\s+(?:char(?:acter)?s?|words?)\s*\)\s*$/i, '')
    .trim();

  return text;
}

/**
 * Sanitize specifically for single-sentence outputs (headline, tweet). On
 * top of the generic peeling, drop any tail beyond the first sentence so
 * Claude can't sneak a "Here's a tighter version: …" rewrite into the output.
 */
export function sanitizeSingleSentence(raw: string): string {
  let text = sanitizeOneShot(raw);
  const sentenceEnd = text.search(/\.\s+[A-Z]/);
  if (sentenceEnd > 0 && sentenceEnd < text.length - 2) {
    text = text.slice(0, sentenceEnd + 1);
  }
  return text.trim();
}

export type PersonaId = 'explain' | 'checklist';

export interface Persona {
  id: PersonaId;
  label: string;
  emoji: string;
  blurb: string;
  prompt: string;
}

export const PERSONAS: Persona[] = [
  {
    id: 'explain',
    label: 'Plain English',
    emoji: '💬',
    blurb: 'For someone who hasn’t seen this PR yet.',
    prompt: `Explain this pull request in friendly, accessible English. Target: a
teammate skim-reading on their phone.

STRICT format rules:
- EXACTLY 2 short paragraphs separated by ONE blank line. No more.
- Each paragraph is 1-2 sentences. Total response under ~80 words.
- Paragraph 1 = the problem and what changed (user-visible).
- Paragraph 2 = the most important risk or thing to verify.
- Use **bold** sparingly — only on the single key impact and the single key risk.
- Use \`inline code\` for any function/file name.
- Start each paragraph with ONE fitting emoji (🐛 bug, ⚙️ fix, ⚠️ risk, 🧪 tests, 🚀 deploy, 🔧 refactor, etc.). Never more than one per paragraph.

No headings, no bullets, no lists. Just two emoji-led sentences-or-two.`,
  },
  {
    id: 'checklist',
    label: 'Checklist',
    emoji: '✅',
    blurb: 'Quick punch list to verify before approving.',
    prompt: `Generate a short reviewer checklist for this pull request. These should be
ACTIONABLE items the reviewer can tick off before approving.

Format rules:
- 4-7 items total
- Each item on its own line, starting with "[ ] "  (literal — NOT a markdown checkbox)
- Each item must be a concrete VERIFICATION action ("Confirm that…", "Check whether…", "Verify the…")
- Use **bold** for the thing being verified
- Use \`inline code\` for any function/file name
- One short trailing reason after an em-dash when the item is non-obvious
- Avoid generic items like "Code is clean" or "Has tests". Each item must be specific to THIS PR.

If the PR is trivial (dep bump, doc), produce 1-2 items and stop.

Do NOT include any preamble, heading, or summary. Just the list.`,
  },
];

export function findPersona(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}

/**
 * Jira-aware checklist prompt. Used in place of the plain `checklist` persona
 * prompt when a linked ticket has a description we can mine. Instead of the AI
 * inventing things to verify from the diff, it turns the ticket's acceptance
 * criteria / Definition of Done into a checklist and flags any item the diff
 * appears NOT to satisfy — answering "does this PR do what the ticket asked?".
 *
 * Output format is identical to the `checklist` persona ("[ ] " lines) so the
 * client's `parseChecklistItems` parser handles both unchanged.
 */
export function buildChecklistAcPrompt(ticketKey: string, description: string): string {
  return `Generate a reviewer checklist for this pull request, grounded in the
acceptance criteria / Definition of Done of its linked Jira ticket ${ticketKey}.

The ticket says:
"""
${description.trim()}
"""

Turn the ticket's acceptance criteria / DoD into verification items the reviewer
can tick off to confirm the PR actually delivers what was asked.

Format rules:
- 4-7 items total, each on its own line starting with "[ ] " (literal — NOT a markdown checkbox)
- Each item is one acceptance criterion phrased as a check ("Confirm that…", "Verify the…")
- Use **bold** for the thing being verified; use \`inline code\` for any function/file name
- If the diff appears NOT to satisfy a criterion, append " — ⚠ not covered by this PR" to that item
- If a criterion can't be judged from the diff, append " — ⚠ verify manually"
- Ignore acceptance criteria that are clearly out of scope for a code review (e.g. design sign-off)

Do NOT include any preamble, heading, or summary. Just the list.`;
}

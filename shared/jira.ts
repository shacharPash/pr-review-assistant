export interface JiraTicket {
  key: string;
  title: string;
  status: string;
  type: string;
  description: string;
  url: string;
  assignee?: string;
  reporter?: string;
}

export interface JiraInfo {
  configured: boolean;
  baseUrl?: string;
  tickets: JiraTicket[];
  /** Keys we tried to fetch but couldn't (auth error, not found, etc.). */
  failures?: { key: string; reason: string }[];
}

/**
 * Decide where the Checklist tab's items come from.
 *
 * Jira mode requires FULL auth (`configured: true`, i.e. token present so
 * descriptions were fetched) AND a ticket that actually has a description to
 * mine acceptance criteria from. Link-only mode (`configured: false`, stub
 * tickets with empty descriptions) and the no-ticket case both fall back to
 * the AI-generated checklist — there's no ticket body to ground on.
 *
 * Used by both the client (to render the source note) and the server (to
 * pick the generation prompt) so the two never disagree.
 */
export function checklistSource(
  jira: JiraInfo | undefined,
): { mode: 'jira'; ticket: JiraTicket } | { mode: 'ai' } {
  if (jira?.configured) {
    const ticket = jira.tickets.find((t) => t.description?.trim());
    if (ticket) return { mode: 'jira', ticket };
  }
  return { mode: 'ai' };
}

/** Detect Jira keys like RED-123, ABC-9 in text. Returns unique keys. */
export function detectJiraKeys(...texts: (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\b([A-Z][A-Z0-9]+-\d+)\b/g;
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(re)) {
      const key = m[1];
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  // Suppress keys that are numeric prefixes of another detected key in the
  // same PR — e.g. if both `RED-196` and `RED-196023` were mentioned, drop
  // `RED-196`. The shorter key is almost always a false-positive sub-ID of
  // the longer one in PR-context, not a separate ticket the reviewer wanted
  // surfaced. Trade-off: if someone genuinely references both tickets, only
  // the longer wins — acceptable for the common case.
  return out.filter((k) => {
    return !out.some((other) => {
      if (other === k) return false;
      if (!other.startsWith(k)) return false;
      // Require the next char after the shorter key to be another digit, so
      // we don't accidentally treat `RED-1` as a prefix of `REDS-1` (it
      // wouldn't be anyway because the project prefixes differ, but defense
      // in depth) and to confirm this is a numeric extension of the same key.
      return /\d/.test(other.charAt(k.length));
    });
  });
}

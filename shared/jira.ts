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
  return out;
}

import type { JiraTicket } from '../../shared/jira.js';
import { detectJiraKeys } from '../../shared/jira.js';

/**
 * Optional Jira integration. Requires three env vars to be set:
 *   JIRA_BASE_URL       e.g. https://your-org.atlassian.net
 *   JIRA_EMAIL          your email used for basic auth
 *   JIRA_API_TOKEN      an Atlassian API token (id.atlassian.com/manage/api-tokens)
 *
 * If any are missing, isJiraConfigured() returns false and callers should skip.
 */

/** Full Jira integration (with auth) is on only when all three env vars exist. */
export function isJiraConfigured(): boolean {
  return Boolean(
    process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN,
  );
}

/** Link-only mode: any of these is enough to surface links without fetching. */
export function hasJiraLinkBase(): boolean {
  return Boolean(process.env.JIRA_BASE_URL);
}

export function jiraBaseUrl(): string | undefined {
  return process.env.JIRA_BASE_URL;
}

/** Strip trailing slashes from the configured base. */
function base(): string {
  return (process.env.JIRA_BASE_URL ?? '').replace(/\/+$/, '');
}

function authHeader(): string {
  const token = Buffer
    .from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`)
    .toString('base64');
  return `Basic ${token}`;
}

interface JiraIssueResponse {
  key: string;
  fields: {
    summary?: string;
    status?: { name?: string };
    issuetype?: { name?: string };
    description?: unknown;
    assignee?: { displayName?: string } | null;
    reporter?: { displayName?: string } | null;
  };
}

/** Atlassian Document Format → flattened plain text (best effort). */
function adfToPlainText(node: unknown): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToPlainText).join('');
  if (typeof node === 'object') {
    const n = node as { type?: string; text?: string; content?: unknown };
    if (n.type === 'text' && typeof n.text === 'string') return n.text;
    if (n.type === 'hardBreak') return '\n';
    if (n.type === 'paragraph') return adfToPlainText(n.content) + '\n\n';
    if (n.type === 'heading') return adfToPlainText(n.content) + '\n\n';
    if (n.type === 'bulletList' || n.type === 'orderedList') return adfToPlainText(n.content);
    if (n.type === 'listItem') return '- ' + adfToPlainText(n.content) + '\n';
    if (n.content) return adfToPlainText(n.content);
  }
  return '';
}

export async function fetchTicket(key: string): Promise<JiraTicket | null> {
  if (!isJiraConfigured()) return null;
  const url = `${base()}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,issuetype,description,assignee,reporter`;
  const res = await fetch(url, {
    headers: {
      Authorization: authHeader(),
      Accept: 'application/json',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Jira ${key}: HTTP ${res.status}`);
  }
  const data = (await res.json()) as JiraIssueResponse;
  return {
    key: data.key,
    title: data.fields.summary ?? '(no summary)',
    status: data.fields.status?.name ?? 'unknown',
    type: data.fields.issuetype?.name ?? 'Task',
    description: adfToPlainText(data.fields.description).trim(),
    url: `${base()}/browse/${data.key}`,
    assignee: data.fields.assignee?.displayName,
    reporter: data.fields.reporter?.displayName,
  };
}

/** Best-effort fetch of all keys; failures recorded but don't throw. */
export async function fetchTickets(keys: string[]): Promise<{
  tickets: JiraTicket[];
  failures: { key: string; reason: string }[];
}> {
  const tickets: JiraTicket[] = [];
  const failures: { key: string; reason: string }[] = [];
  await Promise.all(
    keys.map(async (key) => {
      try {
        const t = await fetchTicket(key);
        if (t) tickets.push(t);
        else failures.push({ key, reason: 'not found' });
      } catch (err) {
        failures.push({ key, reason: (err as Error).message });
      }
    }),
  );
  return { tickets, failures };
}

export { detectJiraKeys };

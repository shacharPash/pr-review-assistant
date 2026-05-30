import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { PRBundle, PRMeta } from '../../shared/types.js';
import { parseUnifiedDiff } from './diffParser.js';
import { annotateNoise } from './noiseRules.js';
import { reorderForReading } from './readingOrder.js';
import { detectJiraKeys, fetchTickets, hasJiraLinkBase, isJiraConfigured, jiraBaseUrl } from './jira.js';

const execFileAsync = promisify(execFile);

export class GHError extends Error {
  constructor(message: string, public readonly detail?: string) {
    super(message);
  }
}

interface ParsedRef {
  owner: string;
  repo: string;
  number: number;
}

const URL_RE = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;
const SHORT_RE = /^([^/\s]+)\/([^#\s]+)#(\d+)$/;

export function parsePRRef(input: string): ParsedRef {
  const trimmed = input.trim();
  const url = trimmed.match(URL_RE);
  if (url) {
    return { owner: url[1], repo: url[2].replace(/\.git$/, ''), number: Number(url[3]) };
  }
  const short = trimmed.match(SHORT_RE);
  if (short) {
    return { owner: short[1], repo: short[2], number: Number(short[3]) };
  }
  throw new GHError(
    'Could not parse PR reference. Use a GitHub URL or owner/repo#number.',
    `Received: ${input}`,
  );
}

async function runGH(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('gh', args, { maxBuffer: 50 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === 'ENOENT') {
      throw new GHError(
        'GitHub CLI (`gh`) not found on PATH. Install from https://cli.github.com and run `gh auth login`.',
      );
    }
    throw new GHError(`gh ${args.join(' ')} failed`, e.stderr ?? e.message);
  }
}

interface GHViewJSON {
  number: number;
  title: string;
  body: string;
  author: { login: string };
  headRefOid: string;
  baseRefOid: string;
  url: string;
  state: string;
  commits: {
    oid: string;
    messageHeadline: string;
    messageBody: string;
    committedDate?: string;
    authors?: { login?: string | null; name?: string | null }[];
  }[];
}

export interface PRRefWithSha extends ParsedRef {
  headSha: string;
}

export async function probeHeadSha(input: string): Promise<PRRefWithSha> {
  const ref = parsePRRef(input);
  const raw = await runGH([
    'pr', 'view', String(ref.number),
    '--repo', `${ref.owner}/${ref.repo}`,
    '--json', 'headRefOid',
  ]);
  const { headRefOid } = JSON.parse(raw) as { headRefOid: string };
  return { ...ref, headSha: headRefOid };
}

export async function fetchPR(input: string): Promise<PRBundle> {
  const ref = parsePRRef(input);
  const repoSlug = `${ref.owner}/${ref.repo}`;
  const viewFields =
    'number,title,body,author,headRefOid,baseRefOid,url,state,commits';
  // gh's --json commits gives an array with oid, messageHeadline, messageBody,
  // committedDate, and authors (each with login + name) — that's enough to
  // populate our PRCommit[].

  const [viewJSONRaw, diffRaw] = await Promise.all([
    runGH(['pr', 'view', String(ref.number), '--repo', repoSlug, '--json', viewFields]),
    runGH(['pr', 'diff', String(ref.number), '--repo', repoSlug]),
  ]);

  const view: GHViewJSON = JSON.parse(viewJSONRaw);

  const meta: PRMeta = {
    owner: ref.owner,
    repo: ref.repo,
    number: view.number,
    title: view.title,
    body: view.body ?? '',
    author: view.author?.login ?? 'unknown',
    headSha: view.headRefOid,
    baseSha: view.baseRefOid,
    url: view.url,
    state: normalizeState(view.state),
  };

  const files = reorderForReading(annotateNoise(parseUnifiedDiff(diffRaw)));
  const commitMessages = view.commits.map((c) =>
    c.messageBody ? `${c.messageHeadline}\n\n${c.messageBody}` : c.messageHeadline,
  );
  const commits = view.commits.map((c) => ({
    oid: c.oid,
    short: c.oid.slice(0, 7),
    message: c.messageHeadline,
    author: c.authors?.[0]?.login || c.authors?.[0]?.name || meta.author,
    authoredAt: c.committedDate ?? new Date().toISOString(),
  }));

  const jira = await collectJira(meta.title, meta.body ?? '', commitMessages);

  return { meta, files, commitMessages, commits, jira };
}

async function collectJira(
  title: string, body: string, commitMessages: string[],
): Promise<import('../../shared/jira.js').JiraInfo> {
  const keys = detectJiraKeys(title, body, ...commitMessages);
  const base = jiraBaseUrl();
  const fullyConfigured = isJiraConfigured();
  const linkBase = hasJiraLinkBase();

  // Nothing usable — no env at all.
  if (!linkBase) {
    return { configured: false, tickets: [], baseUrl: undefined };
  }

  // Link-only mode: emit lightweight ticket stubs so the UI can render links.
  if (!fullyConfigured) {
    const stubs = keys.map((key) => ({
      key,
      title: '',
      status: '',
      type: '',
      description: '',
      url: `${base!.replace(/\/+$/, '')}/browse/${key}`,
    }));
    return { configured: false, baseUrl: base, tickets: stubs };
  }

  if (keys.length === 0) {
    return { configured: true, baseUrl: base, tickets: [] };
  }
  const { tickets, failures } = await fetchTickets(keys);
  return { configured: true, baseUrl: base, tickets, failures };
}

function normalizeState(s: string): PRMeta['state'] {
  const lower = s.toLowerCase();
  if (lower === 'open' || lower === 'closed' || lower === 'merged') return lower;
  return 'open';
}

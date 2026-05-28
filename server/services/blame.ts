import { spawn } from 'node:child_process';
import type { BlameRange } from '../../shared/types.js';

interface GraphQLBlameResponse {
  data?: {
    repository?: {
      object?: {
        blame?: {
          ranges?: Array<{
            startingLine: number;
            endingLine: number;
            commit: {
              oid: string;
              authoredDate: string;
              messageHeadline: string;
              url: string;
              author?: {
                name?: string | null;
                user?: { login: string | null } | null;
              };
            };
          }>;
        };
      };
    };
  };
  errors?: Array<{ message: string }>;
}

const QUERY = `
query Blame($owner:String!,$repo:String!,$rev:String!,$path:String!) {
  repository(owner:$owner, name:$repo) {
    object(expression:$rev) {
      ... on Commit {
        blame(path:$path) {
          ranges {
            startingLine
            endingLine
            commit {
              oid
              authoredDate
              messageHeadline
              url
              author {
                name
                user { login }
              }
            }
          }
        }
      }
    }
  }
}
`.trim();

export async function fetchBlame(
  owner: string,
  repo: string,
  rev: string,
  path: string,
): Promise<BlameRange[]> {
  const stdout = await runGhGraphQL(QUERY, { owner, repo, rev, path });
  const parsed: GraphQLBlameResponse = JSON.parse(stdout);
  if (parsed.errors?.length) {
    throw new Error(parsed.errors.map((e) => e.message).join('; '));
  }
  const raw = parsed.data?.repository?.object?.blame?.ranges ?? [];
  return raw.map((r) => ({
    startingLine: r.startingLine,
    endingLine: r.endingLine,
    authorLogin: r.commit.author?.user?.login ?? null,
    authorName: r.commit.author?.name ?? null,
    authoredDate: r.commit.authoredDate,
    commitSha: r.commit.oid,
    commitMessageHeadline: r.commit.messageHeadline,
    commitUrl: r.commit.url,
  }));
}

function runGhGraphQL(query: string, variables: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['api', 'graphql', '-f', `query=${query}`];
    for (const [k, v] of Object.entries(variables)) {
      args.push('-f', `${k}=${v}`);
    }
    const proc = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (c: string) => { stdout += c; });
    proc.stderr.on('data', (c: string) => { stderr += c; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else {
        const e = new Error(`gh api graphql exited ${code}`) as Error & { stderr?: string };
        e.stderr = stderr;
        reject(e);
      }
    });
  });
}

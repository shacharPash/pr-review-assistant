import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Pure: gh args to post a threaded reply via REST in_reply_to. */
export function replyArgs(
  owner: string, repo: string, number: number, inReplyTo: string, body: string,
): string[] {
  return [
    'api', '-X', 'POST', `repos/${owner}/${repo}/pulls/${number}/comments`,
    '-f', `body=${body}`, '-F', `in_reply_to=${inReplyTo}`,
  ];
}

/** Pure: gh args to resolve/unresolve a review thread via GraphQL. */
export function resolveArgs(threadId: string, resolved: boolean): string[] {
  const mutation = resolved ? 'resolveReviewThread' : 'unresolveReviewThread';
  const query = `mutation($id:ID!){ ${mutation}(input:{threadId:$id}){ thread{ id isResolved } } }`;
  return ['api', 'graphql', '-f', `query=${query}`, '-F', `id=${threadId}`];
}

export async function postReply(
  owner: string, repo: string, number: number, inReplyTo: string, body: string,
): Promise<void> {
  await execFileAsync('gh', replyArgs(owner, repo, number, inReplyTo, body), {
    maxBuffer: 10 * 1024 * 1024, encoding: 'utf8',
  });
}

export async function setResolved(threadId: string, resolved: boolean): Promise<void> {
  await execFileAsync('gh', resolveArgs(threadId, resolved), {
    maxBuffer: 10 * 1024 * 1024, encoding: 'utf8',
  });
}

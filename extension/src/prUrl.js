// Pure helpers for the PR Review Assistant extension. No chrome.* / fetch here
// so this module is unit-testable with vitest.

const PR_RE = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;

/**
 * Parse a browser-tab URL into PR parts, or null if it is not a GitHub PR page.
 * Matches PR sub-pages too (e.g. /files, /commits, #hash).
 * @param {unknown} url
 * @returns {{ owner: string, repo: string, number: number } | null}
 */
export function parsePrUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(PR_RE);
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

/** Rebuild a clean canonical PR URL from parsed parts. */
export function canonicalPrUrl({ owner, repo, number }) {
  return `https://github.com/${owner}/${repo}/pull/${number}`;
}

/** Build the assistant target URL that auto-loads the PR via the app's ?pr= param. */
export function buildTargetUrl(prUrl, base = 'http://localhost:5173') {
  return `${base}/?pr=${encodeURIComponent(prUrl)}`;
}

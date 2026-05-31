/** Bot brands we recognize and style specially. Add more as we encounter them. */
export type BotBrand =
  | 'cursor'        // Cursor BugBot
  | 'claude'        // Claude Code reviewer
  | 'copilot'       // GitHub Copilot code review
  | 'augment'       // Augment Code
  | 'codex'         // OpenAI Codex
  | 'jit'           // Jit security scanner
  | 'sonarcloud'    // SonarCloud quality gate
  | 'devin'         // Devin AI
  | 'graphite'      // Graphite
  | 'bugbot-other'  // Generic bot we couldn't brand
  ;

export interface ReviewAuthor {
  login: string;
  /** GitHub author type. Bots are scoped/branded differently in the UI. */
  type: 'Bot' | 'User';
  avatarUrl: string;
  htmlUrl: string;
  /** Set when the author is a bot we recognize. null for unknown bots / humans. */
  brand: BotBrand | null;
}

/**
 * A line-anchored review comment posted by someone else on this PR.
 * Distinct from our local pending comments (which live in the store
 * but haven't been submitted yet).
 */
export interface InlineReviewComment {
  id: string;
  author: ReviewAuthor;
  body: string;
  path: string;
  /** Line number on the side. For multi-line comments, this is the end-line. */
  line: number;
  startLine?: number;
  side: 'LEFT' | 'RIGHT';
  createdAt: string;
  htmlUrl: string;
  /** Filled when this comment is part of a Review (not standalone). */
  reviewState?: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
}

/**
 * PR-level comments — either Reviews with a body (Approved/Changes Requested
 * summaries) or issue comments (bot PR-wide reports like SonarCloud quality
 * gates, Jit scans).
 */
export interface PRLevelComment {
  id: string;
  author: ReviewAuthor;
  body: string;
  createdAt: string;
  htmlUrl: string;
  reviewState?: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED';
  /** 'review' = review summary; 'issue-comment' = bot PR-wide comment. */
  source: 'review' | 'issue-comment';
}

export interface PRComments {
  inline: InlineReviewComment[];
  prLevel: PRLevelComment[];
}

/**
 * Identify which bot brand owns a given GitHub login. Returns null for
 * unrecognized bots or humans (callers can fall back to 'bugbot-other' for
 * unrecognized Bot-type accounts).
 */
export function brandOfLogin(login: string): BotBrand | null {
  const lc = login.toLowerCase();
  if (lc.startsWith('cursor')) return 'cursor';
  if (lc.startsWith('claude')) return 'claude';
  if (lc.startsWith('copilot') || lc.startsWith('github-copilot')) return 'copilot';
  if (lc.startsWith('augment')) return 'augment';
  if (lc.startsWith('codex')) return 'codex';
  if (lc.startsWith('jit')) return 'jit';
  if (lc.startsWith('sonarqube') || lc.startsWith('sonarcloud')) return 'sonarcloud';
  if (lc.startsWith('devin')) return 'devin';
  if (lc.startsWith('graphite')) return 'graphite';
  return null;
}

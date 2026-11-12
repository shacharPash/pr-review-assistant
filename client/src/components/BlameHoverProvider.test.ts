import { describe, expect, it } from 'vitest';
import { blameHoverContents } from './BlameHoverProvider.js';
import type { BlameRange } from '../../../shared/types.js';

const range = (overrides: Partial<BlameRange> = {}): BlameRange => ({
  startingLine: 1, endingLine: 2, authorLogin: null, authorName: 'Synthetic author',
  authoredDate: new Date().toISOString(), commitSha: 'abcdef1234567890', commitMessageHeadline: 'Synthetic change',
  commitUrl: 'https://github.com/synthetic/repo/commit/abcdef1234567890', ...overrides,
});

describe('blameHoverContents', () => {
  it('renders commit author names and headlines as literal text', () => {
    const contents = blameHoverContents(range({
      authorName: 'x** ![](https://attacker.example/p.png) **',
      commitMessageHeadline: '[open](command:workbench.action.terminal.new) <img src=x> | `code`',
    }));
    expect(contents.map((entry) => entry.value)).toEqual([
      String.raw`**x\*\* \!\[\]\(https\:\/\/attacker\.example\/p\.png\) \*\*** · today`,
      String.raw`\[open\]\(command\:workbench\.action\.terminal\.new\) \<img src\=x\> \| \`code\``,
      '[abcdef1 on GitHub](https://github.com/synthetic/repo/commit/abcdef1234567890)',
    ]);
    expect(contents.some((entry) => 'isTrusted' in entry)).toBe(false);
  });

  it('keeps logins readable and drops a commit link that is not a web URL', () => {
    const contents = blameHoverContents(range({ authorLogin: 'synthetic-user', commitUrl: 'javascript:alert(1)' }));
    expect(contents.map((entry) => entry.value)).toEqual([
      String.raw`**\@synthetic\-user** · today`,
      'Synthetic change',
    ]);
  });
});

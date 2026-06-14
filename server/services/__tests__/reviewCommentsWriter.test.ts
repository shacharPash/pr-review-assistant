import { describe, it, expect } from 'vitest';
import { replyArgs, resolveArgs, isValidInReplyTo, isValidThreadId } from '../reviewCommentsWriter.js';

describe('replyArgs', () => {
  it('builds gh REST args for a threaded reply', () => {
    expect(replyArgs('cli', 'cli', 13509, '101', 'thanks!')).toEqual([
      'api', '-X', 'POST', 'repos/cli/cli/pulls/13509/comments',
      '-f', 'body=thanks!', '-F', 'in_reply_to=101',
    ]);
  });
});

describe('resolveArgs', () => {
  it('uses resolveReviewThread when resolving', () => {
    const args = resolveArgs('THREAD_x', true);
    expect(args[0]).toBe('api');
    expect(args[1]).toBe('graphql');
    expect(args.join(' ')).toContain('resolveReviewThread');
    expect(args.join(' ')).toContain('id=THREAD_x');
  });
  it('uses unresolveReviewThread when unresolving', () => {
    expect(resolveArgs('THREAD_x', false).join(' ')).toContain('unresolveReviewThread');
  });
});

describe('input validation', () => {
  it('accepts numeric reply ids; rejects @file and junk', () => {
    expect(isValidInReplyTo('101')).toBe(true);
    expect(isValidInReplyTo('@/etc/passwd')).toBe(false);
    expect(isValidInReplyTo('1a')).toBe(false);
  });
  it('accepts graphql node ids; rejects @file and placeholders', () => {
    expect(isValidThreadId('PRRT_kwDOABC123-=')).toBe(true);
    expect(isValidThreadId('@/etc/passwd')).toBe(false);
    expect(isValidThreadId('{owner}')).toBe(false);
  });
});

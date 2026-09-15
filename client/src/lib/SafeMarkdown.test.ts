import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SafeInline, SafeMarkdown, safeHref } from './SafeMarkdown.js';

// Inspect the actual React element tree as well as serialized output: raw
// event-looking text is harmless, but an event prop or HTML sink is not.
function assertSafeNodes(node: unknown): void {
  if (Array.isArray(node)) { node.forEach(assertSafeNodes); return; }
  if (!node || typeof node !== 'object' || !('props' in node)) return;
  const element = node as { type: unknown; props: Record<string, unknown> };
  expect(element.props).not.toHaveProperty('dangerouslySetInnerHTML');
  expect(Object.keys(element.props).some((key) => /^on/i.test(key))).toBe(false);
  if (element.type === 'a') expect(safeHref(String(element.props.href))).toBeTruthy();
  if (typeof element.type === 'function') assertSafeNodes(element.type(element.props));
  else assertSafeNodes(element.props.children);
}

describe('safe review markdown', () => {
  it.each([
    'https://example.test/"onmouseover="alert(1)',
    "https://example.test/'onclick='alert(1)",
    '<img src=x onerror=alert(1)><script>alert(1)</script>',
    '[click](javascript:alert(1)) [data](data:text/html,payload)',
    '[escaped](java&#x73;cript:alert(1))',
    '**https://example.test/"onclick="x** _<svg/onload=alert(1)>_',
  ])('keeps hostile markup inert: %s', (text) => {
    for (const Component of [SafeInline, SafeMarkdown]) {
      assertSafeNodes(createElement(Component, { text }));
      const html = renderToStaticMarkup(createElement(Component, { text }));
      expect(html).not.toMatch(/<(?:script|img|svg)\b/);
      expect(html).not.toMatch(/<a[^>]+href="(?:javascript|data):/);
      expect(html).not.toMatch(/<a[^>]+\s(?:onmouseover|onclick)=/);
    }
  });

  it('preserves basic formatting and links without parsing code contents', () => {
    const html = renderToStaticMarkup(createElement(SafeMarkdown, { text: '## Heading\n\n**bold** and _italic_\n[guide](https://example.test/a?x=1&y=2)\n\n- first\n- second\n\n```ts\nconst x = "<script>"; **literal** https://example.test/\n```\n\n`**literal** https://example.test/`' }));
    expect(html).toContain('<h4 class="rc-h">Heading</h4>');
    expect(html).toContain('<strong>bold</strong> and <em>italic</em>');
    expect(html).toContain('<ul><li>first</li><li>second</li></ul>');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('<code data-lang="ts">const x = &quot;&lt;script&gt;&quot;; **literal** https://example.test/</code>');
    expect(html).toContain('<code>**literal** https://example.test/</code>');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', '//example.test', 'https:\\example.test', 'https://example.test/"x', 'https://example.test/\n'])('rejects unsafe destination %s', (value) => {
    expect(safeHref(value)).toBeUndefined();
  });
});

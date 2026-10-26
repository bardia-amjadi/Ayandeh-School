import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders headings, lists, tables, code', () => {
    const h = renderMarkdown('# T\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n```js\nlet a=1\n```');
    expect(h).toContain('<h1>T</h1>'); expect(h).toContain('<li>a</li>'); expect(h).toContain('<table>'); expect(h).toContain('<code class="language-js">');
  });
  it('strips script tags and event handlers', () => {
    const h = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href="https://a.com" onclick="x()">k</a>');
    expect(h).not.toMatch(/<script/i); expect(h).not.toMatch(/onerror|onclick/i);
  });
  it('blocks javascript:/data: links and non-https images', () => {
    const h = renderMarkdown('[x](javascript:alert(1)) [y](data:text/html;base64,AAAA) ![i](http://a.com/i.png) ![j](javascript:alert(1))');
    expect(h).not.toMatch(/javascript:/i); expect(h).not.toMatch(/data:/i); expect(h).not.toContain('src="http://');
  });
  it('forces safe rel/target on links', () => {
    expect(renderMarkdown('[a](https://a.com)')).toContain('rel="noopener noreferrer nofollow"');
  });
  it('drops iframes/styles/svg', () => {
    const h = renderMarkdown('<iframe src="https://evil.com"></iframe><style>*{}</style><svg onload=alert(1)></svg>');
    expect(h).not.toMatch(/<iframe|<style|<svg/i);
  });
});

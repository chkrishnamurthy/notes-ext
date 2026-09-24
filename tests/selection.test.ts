import { afterEach, describe, expect, it } from 'vitest';
import { serializeSelection } from '../src/lib/selection';

const BASE = 'https://example.com/articles/one';

/** Put `html` on the page and select all of the element matching `selector`. */
function select(html: string, selector = '#target'): Selection {
  document.body.innerHTML = html;
  const range = document.createRange();
  range.selectNodeContents(document.querySelector(selector)!);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

describe('serializeSelection', () => {
  it('keeps emphasis and links', () => {
    const result = serializeSelection(
      select('<div id="target"><p>Read <strong>this</strong> and <a href="https://a.example/x">that</a>.</p></div>'),
      BASE,
      100_000,
    );
    expect(result?.html).toContain('<strong>this</strong>');
    expect(result?.html).toContain('href="https://a.example/x"');
    expect(result?.text).toBe('Read this and that.');
  });

  it('resolves relative links against the page, rather than dropping them', () => {
    const result = serializeSelection(
      select('<p id="target">see <a href="../two">the next one</a></p>'),
      BASE,
      100_000,
    );
    expect(result?.html).toContain('href="https://example.com/two"');
  });

  it('keeps lists as lists', () => {
    const result = serializeSelection(
      select('<div id="target"><ul><li>first</li><li>second</li></ul></div>'),
      BASE,
      100_000,
    );
    expect(result?.html).toMatch(/<ul><li>first<\/li><li>second<\/li><\/ul>/);
    expect(result?.text).toBe('first\nsecond');
  });

  it('keeps a code selection as a code block, whitespace and all', () => {
    const code = 'if (x) {\n    return y;\n}';
    const result = serializeSelection(
      select(`<pre><code id="target">${code}</code></pre>`),
      BASE,
      100_000,
    );
    expect(result?.html).toBe(`<pre><code>${code}</code></pre>`);
    expect(result?.text).toBe(code);
  });

  it('wraps an inline-only selection in a paragraph', () => {
    const result = serializeSelection(select('<p><span id="target">just <em>words</em></span></p>'), BASE, 100_000);
    expect(result?.html).toBe('<p>just <em>words</em></p>');
  });

  it('strips anything outside the allowlist before it leaves the page', () => {
    const result = serializeSelection(
      select(
        '<div id="target"><p onclick="steal()">hi<script>steal()</script>' +
          '<img src="x" onerror="steal()"><a href="javascript:steal()">bad</a></p></div>',
      ),
      BASE,
      100_000,
    );
    expect(result?.html).not.toMatch(/script|onclick|onerror|javascript:|<img/i);
    expect(result?.text).toContain('hi');
  });

  it('returns null for nothing selected, so plain text is used', () => {
    document.body.innerHTML = '<p>nothing selected</p>';
    window.getSelection()!.removeAllRanges();
    expect(serializeSelection(window.getSelection(), BASE, 100_000)).toBeNull();
  });

  it('returns null for a selection over the length limit', () => {
    expect(serializeSelection(select('<p id="target">far too long</p>'), BASE, 5)).toBeNull();
  });

  it('returns null when the markup dwarfs the text', () => {
    const spans = Array.from({ length: 200 }, () => '<span class="w"><b><i>a</i></b></span>').join('');
    const html = `<p id="target">${spans}</p>`;
    // Sanitized this is still mostly <b><i> tags around single letters.
    expect(serializeSelection(select(html), BASE, 100_000)).toBeNull();
  });
});

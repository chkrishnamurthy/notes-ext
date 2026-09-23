import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  htmlToText,
  isEmptyHtml,
  sanitizeHtml,
  stripTagsFallback,
  textToCodeBlock,
  textToHtml,
} from '../src/lib/richtext';

describe('sanitizer', () => {
  it('keeps the formatting the editor produces', () => {
    const html =
      '<h1>Title</h1><p><strong>bold</strong> <em>italic</em> <s>struck</s> <code>x</code></p>' +
      '<ul><li><p>one</p></li></ul><ol><li><p>two</p></li></ol>' +
      '<blockquote><p>quoted</p></blockquote><pre><code>code()</code></pre>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('removes a script tag entirely', () => {
    expect(sanitizeHtml('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>');
  });

  it('strips event handler attributes', () => {
    expect(sanitizeHtml('<p onclick="alert(1)">hi</p>')).toBe('<p>hi</p>');
  });

  it('strips inline styles and classes', () => {
    expect(sanitizeHtml('<p style="position:fixed" class="x" id="y">hi</p>')).toBe('<p>hi</p>');
  });

  it('drops an image rather than letting it call out', () => {
    expect(sanitizeHtml('<p>a<img src="https://tracker.example/x.gif">b</p>')).toBe('<p>ab</p>');
  });

  it('drops iframes, objects and embeds', () => {
    expect(sanitizeHtml('<iframe src="https://evil.example"></iframe>')).toBe('');
    expect(sanitizeHtml('<object data="x"></object>')).toBe('');
  });

  it('unwraps an unknown tag but keeps its text', () => {
    // Losing the text would be silent data loss; keeping the tag would not be safe.
    expect(sanitizeHtml('<p><marquee>still here</marquee></p>')).toBe('<p>still here</p>');
  });

  it('removes a javascript: link but keeps the words', () => {
    // eslint-disable-next-line no-script-url
    expect(sanitizeHtml('<p><a href="javascript:alert(1)">click</a></p>')).toBe('<p>click</p>');
  });

  it('removes a data: URL link', () => {
    expect(sanitizeHtml('<p><a href="data:text/html,<script>1</script>">x</a></p>')).toBe('<p>x</p>');
  });

  it('keeps an http link and makes it safe to click', () => {
    const out = sanitizeHtml('<p><a href="https://example.com/a">x</a></p>');
    expect(out).toContain('href="https://example.com/a"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it('keeps a mailto link', () => {
    expect(sanitizeHtml('<p><a href="mailto:a@b.com">mail</a></p>')).toContain('mailto:a@b.com');
  });

  it('survives malformed input without throwing', () => {
    expect(() => sanitizeHtml('<p><b>unclosed')).not.toThrow();
    expect(() => sanitizeHtml('<<<>>>')).not.toThrow();
    expect(sanitizeHtml('')).toBe('');
  });

  it('forces a checklist box to be display only', () => {
    const out = sanitizeHtml(
      '<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked></label><div><p>done</p></div></li></ul>',
    );
    expect(out).toContain('disabled');
    expect(out).toContain('data-checked="true"');
  });

  it('is idempotent', () => {
    const once = sanitizeHtml('<p onclick="x"><b>a</b><script>1</script></p>');
    expect(sanitizeHtml(once)).toBe(once);
  });
});

describe('plain-text projection', () => {
  it('separates paragraphs with a blank line', () => {
    // A blank line, not one newline: that is what the author typed, and it is
    // what makes text -> HTML -> text a faithful round trip.
    expect(htmlToText('<p>one</p><p>two</p>')).toBe('one\n\ntwo');
  });

  it('does not double-space a list', () => {
    expect(htmlToText('<ul><li><p>a</p></li><li><p>b</p></li><li><p>c</p></li></ul>'))
      .toBe('a\nb\nc');
  });

  it('turns list items into lines', () => {
    expect(htmlToText('<ul><li><p>a</p></li><li><p>b</p></li></ul>')).toBe('a\nb');
  });

  it('honours a hard break', () => {
    expect(htmlToText('<p>a<br>b</p>')).toBe('a\nb');
  });

  it('keeps code-block whitespace exactly', () => {
    const snippet = 'function f() {\n    return 1;\n}';
    expect(htmlToText(textToCodeBlock(snippet))).toBe(snippet);
  });

  it('marks checklist state in text', () => {
    const out = htmlToText(
      '<ul data-type="taskList"><li data-checked="true"><label><input type="checkbox" checked></label><div><p>done</p></div></li></ul>',
    );
    expect(out).toContain('[x]');
    expect(out).toContain('done');
  });

  it('does not leak tag names into the text', () => {
    expect(htmlToText('<p><strong>bold</strong> text</p>')).toBe('bold text');
  });
});

describe('plain text to HTML', () => {
  it('escapes markup so pasted text is never interpreted', () => {
    expect(textToHtml('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
  });

  it('splits paragraphs on blank lines and keeps single breaks', () => {
    expect(textToHtml('a\nb\n\nc')).toBe('<p>a<br>b</p><p>c</p>');
  });

  it('round-trips through the text projection', () => {
    const text = 'first line\nsecond line\n\nnew paragraph';
    expect(htmlToText(textToHtml(text))).toBe(text);
  });

  it('escapes a code block without changing its whitespace', () => {
    const snippet = 'if (a < b && c > d) {\n\treturn "x";\n}';
    expect(htmlToText(textToCodeBlock(snippet))).toBe(snippet);
  });

  it('escapes the characters that matter', () => {
    expect(escapeHtml('<&>"')).toBe('&lt;&amp;&gt;&quot;');
  });
});

describe('emptiness', () => {
  it('treats an empty paragraph as empty', () => {
    expect(isEmptyHtml('<p></p>')).toBe(true);
    expect(isEmptyHtml('')).toBe(true);
  });

  it('treats any text as not empty', () => {
    expect(isEmptyHtml('<p>a</p>')).toBe(false);
  });
});

describe('DOM-free fallback', () => {
  it('extracts text without a DOM', () => {
    expect(stripTagsFallback('<p>one</p><p>two</p>')).toBe('one\ntwo');
  });

  it('never leaves script contents behind', () => {
    expect(stripTagsFallback('<p>a</p><script>alert(1)</script>')).toBe('a');
  });

  it('decodes the entities it produced', () => {
    expect(stripTagsFallback('<p>&lt;b&gt; &amp; more</p>')).toBe('<b> & more');
  });
});

import { describe, expect, it } from 'vitest';
import { htmlToMarkdown, markdownFilename, noteToMarkdown, notesToMarkdown } from '../src/lib/markdown';
import { buildNote } from '../src/lib/notes';
import type { Note } from '../src/lib/schema';

const note = (overrides: Partial<Note> & { html: string }): Note => ({
  ...buildNote({ html: overrides.html, text: 'x' }, new Date(2026, 8, 23, 10).getTime()),
  ...overrides,
});

describe('htmlToMarkdown', () => {
  it('converts headings, emphasis, strike and inline code', () => {
    expect(
      htmlToMarkdown(
        '<h1>Title</h1><h3>Small</h3><p><strong>bold</strong> <em>it</em> <s>gone</s> <code>x()</code></p>',
      ),
    ).toBe('# Title\n\n### Small\n\n**bold** *it* ~~gone~~ `x()`');
  });

  it('keeps spaces outside emphasis markers', () => {
    expect(htmlToMarkdown('<p>a<strong> b </strong>c</p>')).toBe('a **b** c');
  });

  it('writes links, and bare URLs as autolinks', () => {
    expect(
      htmlToMarkdown(
        '<p><a href="https://a.example/x_(y)">the docs</a> and <a href="https://b.example/">https://b.example/</a></p>',
      ),
    ).toBe('[the docs](https://a.example/x_%28y%29) and <https://b.example/>');
  });

  it('keeps lists tight, numbers ordered lists and nests', () => {
    expect(
      htmlToMarkdown(
        '<ul><li><p>one</p><ul><li><p>inner</p></li></ul></li><li><p>two</p></li></ul>' +
          '<ol><li><p>first</p></li><li><p>second</p></li></ol>',
      ),
    ).toBe('- one\n  - inner\n- two\n\n1. first\n2. second');
  });

  it('turns a TipTap checklist into task list items', () => {
    const html =
      '<ul data-type="taskList">' +
      '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>done</p></div></li>' +
      '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>todo</p></div></li>' +
      '</ul>';
    expect(htmlToMarkdown(html)).toBe('- [x] done\n- [ ] todo');
  });

  it('fences code blocks without touching their whitespace', () => {
    const code = '  indented\n\n\n\tand a tab';
    expect(htmlToMarkdown(`<pre><code>${code}</code></pre>`)).toBe(`\`\`\`\n${code}\n\`\`\``);
  });

  it('uses a longer fence when the code itself contains backticks', () => {
    expect(htmlToMarkdown('<pre><code>```js\nx\n```</code></pre>')).toBe(
      '````\n```js\nx\n```\n````',
    );
    expect(htmlToMarkdown('<p><code>a`b</code></p>')).toBe('``a`b``');
  });

  it('quotes every line of a blockquote', () => {
    expect(htmlToMarkdown('<blockquote><p>one</p><p>two</p></blockquote>')).toBe(
      '> one\n>\n> two',
    );
  });

  it('writes line breaks and rules', () => {
    expect(htmlToMarkdown('<p>a<br>b</p><hr><p>c</p>')).toBe('a  \nb\n\n---\n\nc');
  });

  it('escapes text that would otherwise become formatting', () => {
    expect(htmlToMarkdown('<p>2 * 3 and snake_case [x]</p>')).toBe(
      '2 \\* 3 and snake\\_case \\[x\\]',
    );
    expect(htmlToMarkdown('<p># not a heading</p><p>- not a list</p><p>1. nor this</p>')).toBe(
      '\\# not a heading\n\n\\- not a list\n\n1\\. nor this',
    );
  });

  it('drops underline to plain text, and handles empty input', () => {
    expect(htmlToMarkdown('<p><u>under</u></p>')).toBe('under');
    expect(htmlToMarkdown('')).toBe('');
  });
});

describe('Markdown export', () => {
  it('writes a context line with pin, date, tag and source above each body', () => {
    const md = noteToMarkdown(
      note({
        html: '<p>body</p>',
        pinned: true,
        tag: 'reading list',
        sourceUrl: 'https://example.edu/a',
        sourceTitle: 'A_Page',
      }),
    );
    expect(md).toBe('**Pinned** · 2026-09-23 · #reading-list · [A\\_Page](https://example.edu/a)\n\nbody');
  });

  it('exports active notes only, pinned first, separated by rules', () => {
    const now = new Date(2026, 8, 24, 12).getTime();
    const md = notesToMarkdown(
      [
        note({ html: '<p>older</p>', updatedAt: 1 }),
        note({ html: '<p>pinned</p>', pinned: true, updatedAt: 0 }),
        note({ html: '<p>trashed</p>', deletedAt: 5 }),
      ],
      now,
    );
    expect(md).toContain('2 notes, exported 2026-09-24.');
    expect(md).not.toContain('trashed');
    expect(md.indexOf('pinned')).toBeLessThan(md.indexOf('older'));
    expect(md.split('\n\n---\n\n')).toHaveLength(3);
  });

  it('names the file by local date', () => {
    expect(markdownFilename(new Date(2026, 0, 5, 23).getTime())).toBe('for-now-notes-2026-01-05.md');
  });
});

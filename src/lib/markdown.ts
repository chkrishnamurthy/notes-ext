/**
 * Markdown out: the readable export beside the JSON backup.
 *
 * The JSON backup is for restoring; this is for leaving — into Obsidian, a
 * document, an email. It converts only what the sanitizer allows, so every
 * tag it can meet is one the editor produces.
 *
 * One-way on purpose. Nothing here is ever read back in, so it favours output
 * a person would have typed over a lossless round trip: underline has no
 * Markdown form and becomes plain text, and a checklist becomes `- [ ]`.
 */

import { plural, t } from './i18n';
import { isActive, sortNotes } from './notes';
import type { Note } from './schema';

/** Characters that would otherwise start emphasis, code, links or HTML. */
const INLINE_SPECIALS = /[\\`*_[\]<]/g;

function escapeInline(text: string): string {
  return text.replace(INLINE_SPECIALS, (c) => `\\${c}`);
}

/**
 * Text at the start of a line that Markdown would read as a block marker —
 * `# `, `> `, `- `, `1. `, or a `---` rule — is escaped so a sentence that
 * happens to begin that way stays a sentence.
 */
function escapeLineStarts(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (/^\s*([-=_])(\s*\1){2,}\s*$/.test(line)) return `\\${line}`;
      return line.replace(/^(\s*)(#{1,6}|>|[-+])(?=\s|$)/, '$1\\$2').replace(/^(\s*\d+)([.)])(?=\s|$)/, '$1\\$2');
    })
    .join('\n');
}

/** A backtick run one longer than any inside `text`, so the text cannot close it. */
function fenceFor(text: string, min: number): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return '`'.repeat(Math.max(min, longest + 1));
}

/** Keeps a link destination a single token: no raw spaces or closing parens. */
const encodeHref = (href: string): string =>
  href.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');

/**
 * Wrap `inner` in a delimiter, keeping surrounding spaces outside it:
 * `** bold **` is not bold in Markdown, `**bold**` is.
 */
function wrap(inner: string, mark: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  if (!match || !match[2]) return inner;
  return `${match[1]}${mark}${match[2]}${mark}${match[3]}`;
}

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeInline(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const inner = () => [...el.childNodes].map(inline).join('');

  switch (el.tagName) {
    case 'BR':
      return '  \n';
    case 'STRONG':
    case 'B':
      return wrap(inner(), '**');
    case 'EM':
    case 'I':
      return wrap(inner(), '*');
    case 'S':
    case 'STRIKE':
    case 'DEL':
      return wrap(inner(), '~~');
    case 'CODE': {
      const text = el.textContent ?? '';
      if (!text) return '';
      const fence = fenceFor(text, 1);
      const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
      return `${fence}${pad}${text}${pad}${fence}`;
    }
    case 'A': {
      const href = el.getAttribute('href') ?? '';
      const label = inner();
      if (!href) return label;
      if (!label || el.textContent === href) return `<${encodeHref(href)}>`;
      return `[${label}](${encodeHref(href)})`;
    }
    case 'INPUT':
      return '';
    default:
      return inner();
  }
}

const BLOCK_TAGS = new Set([
  'P', 'DIV', 'H1', 'H2', 'H3', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'HR', 'LI',
]);

/** Indent every line after the first, for content that continues a list item. */
const hang = (text: string, indent: string): string =>
  text.replace(/\n(?!\n|$)/g, `\n${indent}`);

function list(el: Element): string {
  const ordered = el.tagName === 'OL';
  const tasks = el.getAttribute('data-type') === 'taskList';
  const items = [...el.children].filter((child) => child.tagName === 'LI');

  return items
    .map((li, index) => {
      let marker = ordered ? `${index + 1}. ` : '- ';
      if (tasks || li.getAttribute('data-type') === 'taskItem') {
        const checked =
          li.getAttribute('data-checked') === 'true' ||
          li.querySelector(':scope > label > input[checked]') !== null;
        marker += checked ? '[x] ' : '[ ] ';
      }
      // A checklist item's box lives in a <label>; its text is everything else.
      const content = [...li.childNodes].filter(
        (child) => !(child instanceof Element && child.tagName === 'LABEL'),
      );
      // Items stay tight: TipTap wraps each one's text in a <p>, which would
      // otherwise put a blank line between every item.
      const body = blocks(content).join('\n');
      const indent = ' '.repeat(ordered ? marker.length : 2);
      return `${marker}${hang(body, indent)}`;
    })
    .join('\n');
}

function block(el: Element): string {
  switch (el.tagName) {
    case 'H1':
    case 'H2':
    case 'H3': {
      const text = inline(el).replace(/\s*\n\s*/g, ' ').trim();
      return text ? `${'#'.repeat(Number(el.tagName[1]))} ${text}` : '';
    }
    case 'PRE': {
      // A code block's whitespace is its content, so it is never escaped or trimmed.
      const text = (el.textContent ?? '').replace(/\n$/, '');
      const fence = fenceFor(text, 3);
      return `${fence}\n${text}\n${fence}`;
    }
    case 'BLOCKQUOTE':
      return blocks([...el.childNodes])
        .join('\n\n')
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'UL':
    case 'OL':
      return list(el);
    case 'HR':
      return '---';
    case 'DIV':
    case 'LI':
      return blocks([...el.childNodes]).join('\n\n');
    default:
      return escapeLineStarts(inline(el).trim());
  }
}

/**
 * Render a run of sibling nodes as Markdown blocks. Loose inline content
 * between blocks — text directly inside a list item, say — becomes a
 * paragraph of its own.
 */
function blocks(nodes: Node[]): string[] {
  const out: string[] = [];
  let run = '';
  const flush = () => {
    const text = escapeLineStarts(run.trim());
    if (text) out.push(text);
    run = '';
  };
  for (const node of nodes) {
    if (node instanceof Element && BLOCK_TAGS.has(node.tagName)) {
      flush();
      const rendered = block(node);
      if (rendered) out.push(rendered);
    } else {
      run += inline(node);
    }
  }
  flush();
  return out;
}

/** Convert a sanitized note body to Markdown. */
export function htmlToMarkdown(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return '';
  const doc = document.implementation.createHTMLDocument('markdown');
  doc.body.innerHTML = html;
  // No blank-line collapsing afterwards: inside a code block, blank lines
  // are content.
  return blocks([...doc.body.childNodes]).join('\n\n');
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** `2026-09-23`, in the user's own time zone — the day they would recognise. */
function localDate(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The line of context above a note: pinned, when, its tag, and where it came
 * from. Plain enough to read, and still a working link in any renderer.
 */
function noteHeader(note: Note): string {
  const parts: string[] = [];
  if (note.pinned) parts.push(`**${t('mdPinned')}**`);
  parts.push(localDate(note.createdAt));
  if (note.tag) parts.push(`#${note.tag.replace(/\s+/g, '-')}`);
  const link = note.targetUrl ?? note.sourceUrl;
  if (link) {
    const label = escapeInline(note.sourceTitle ?? link);
    parts.push(`[${label}](${encodeHref(link)})`);
  } else if (note.sourceTitle) {
    parts.push(escapeInline(note.sourceTitle));
  }
  return parts.join(' · ');
}

/** One note as Markdown: its context line, then its body. */
export function noteToMarkdown(note: Note): string {
  return `${noteHeader(note)}\n\n${htmlToMarkdown(note.html)}`;
}

/**
 * Every active note as one Markdown document, pinned first and newest next —
 * the order the panel shows. Trash is left out: this is the readable copy of
 * what is in use, and the JSON backup is the complete one.
 */
export function notesToMarkdown(notes: Note[], now = Date.now()): string {
  const active = sortNotes(notes.filter(isActive));
  const exported = plural(active.length, 'mdExportedOne', 'mdExportedOther', localDate(now));
  const head = `# ${t('extName')}\n\n${exported}`;
  return [head, ...active.map(noteToMarkdown)].join('\n\n---\n\n') + '\n';
}

/** `for-now-notes-2026-09-23.md` */
export function markdownFilename(now = Date.now()): string {
  return `for-now-notes-${localDate(now)}.md`;
}

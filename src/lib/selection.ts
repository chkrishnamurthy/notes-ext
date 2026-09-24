/**
 * Turning what the user highlighted on a page into a rich note body.
 *
 * Chrome's context-menu payload carries only the selection's plain text, which
 * flattens links, emphasis, lists and code. This reads the selection itself,
 * inside the page, and keeps what the editor can represent.
 *
 * It runs in the content script's isolated world, so the page's own scripts
 * cannot interfere with it — but the page's *content* is still untrusted, so
 * the result goes through the same allowlist sanitizer as an import before it
 * leaves the page. Nothing outside that allowlist ever reaches storage.
 */

import { escapeHtml, htmlToText, sanitizeHtml } from './richtext';

export interface CapturedSelection {
  html: string;
  text: string;
}

/**
 * A captured body this much larger than its text is mostly markup — a page
 * wrapping every word in spans, say — and not worth the quota. The plain text
 * is used instead.
 */
const MAX_MARKUP_RATIO = 8;

/** Blocks the editor understands. Anything else inline gets wrapped in a <p>. */
const BLOCK_TAGS = new Set(['P', 'PRE', 'H1', 'H2', 'H3', 'UL', 'OL', 'BLOCKQUOTE', 'HR', 'DIV']);

/**
 * Serialize the current selection, or return null when there is nothing worth
 * keeping as rich text — in which case the caller falls back to plain text.
 *
 * @param baseUri The page's base URL, which relative links resolve against.
 * @param maxTextLength Captures longer than this fall back to the plain-text
 *   path, which truncates.
 */
export function serializeSelection(
  selection: Selection | null,
  baseUri: string,
  maxTextLength: number,
): CapturedSelection | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

  // A detached document: nothing cloned into it runs script or loads anything.
  const doc = document.implementation.createHTMLDocument('capture');
  const holder = doc.createElement('div');
  for (let i = 0; i < selection.rangeCount; i += 1) {
    holder.append(doc.importNode(selection.getRangeAt(i).cloneContents(), true));
  }

  // The sanitizer only keeps absolute links, and a page's own links are
  // usually relative. Resolve them against the page they came from.
  for (const anchor of holder.querySelectorAll('a[href]')) {
    try {
      anchor.setAttribute('href', new URL(anchor.getAttribute('href') ?? '', baseUri).href);
    } catch {
      anchor.removeAttribute('href');
    }
  }

  let html: string;
  if (insideCodeBlock(selection)) {
    // A selection inside a code block clones as bare text, losing the block —
    // and with it the whitespace that is the content.
    html = `<pre><code>${escapeHtml(holder.textContent ?? '')}</code></pre>`;
  } else {
    html = sanitizeHtml(holder.innerHTML);
    if (!hasBlock(html)) html = `<p>${html}</p>`;
  }

  const text = htmlToText(html);
  if (!text.trim() || text.length > maxTextLength) return null;
  if (html.length > Math.max(text.length, 1) * MAX_MARKUP_RATIO) return null;
  return { html, text };
}

function insideCodeBlock(selection: Selection): boolean {
  const node = selection.getRangeAt(0).commonAncestorContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return Boolean(element?.closest('pre'));
}

function hasBlock(html: string): boolean {
  const doc = document.implementation.createHTMLDocument('blocks');
  doc.body.innerHTML = html;
  return [...doc.body.children].some((child) => BLOCK_TAGS.has(child.tagName));
}

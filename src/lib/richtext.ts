/**
 * Rich text: the allowlist sanitizer and the plain-text projection.
 *
 * Note bodies are HTML now. The editor produces that HTML, but an imported
 * backup is untrusted input, so every body is put through `sanitizeHtml`
 * before it is stored and again before it is rendered. Nothing outside the
 * allowlist survives — no scripts, no event handlers, no styles, no iframes.
 */

/** Tags the editor can produce, and nothing else. */
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'S', 'STRIKE', 'DEL', 'U',
  'CODE', 'PRE', 'H1', 'H2', 'H3',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'A',
  'LABEL', 'INPUT', 'SPAN', 'DIV',
]);

/** Per-tag attribute allowlist. Everything else is stripped. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href', 'target', 'rel']),
  UL: new Set(['data-type']),
  LI: new Set(['data-checked', 'data-type']),
  INPUT: new Set(['type', 'checked', 'disabled']),
  PRE: new Set([]),
  CODE: new Set([]),
};

/**
 * Tags removed together with their contents.
 *
 * Everything else that is not allowed gets unwrapped, which keeps its text.
 * For these, the text *is* the payload — unwrapping `<script>alert(1)</script>`
 * would leave `alert(1)` sitting in the note as visible text — so they go
 * entirely.
 */
const DROP_WITH_CONTENTS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED',
  'APPLET', 'FRAME', 'FRAMESET', 'HEAD', 'LINK', 'META', 'BASE', 'TITLE',
  'TEXTAREA', 'FORM', 'SVG', 'MATH', 'CANVAS', 'AUDIO', 'VIDEO', 'SOURCE',
]);

const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:'];

function safeHref(value: string): string | null {
  try {
    const url = new URL(value, 'https://invalid.example');
    if (!SAFE_PROTOCOLS.includes(url.protocol)) return null;
    // Reject anything that only resolved because of the base URL above.
    if (!/^(https?:|mailto:)/i.test(value.trim())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Strip everything not on the allowlist, in place, depth-first.
 *
 * Disallowed elements are unwrapped rather than deleted, so text inside an
 * unknown tag is kept as text instead of silently vanishing.
 */
function scrub(node: Element): void {
  if (DROP_WITH_CONTENTS.has(node.tagName)) {
    node.remove();
    return;
  }

  for (const child of [...node.children]) scrub(child);

  if (!ALLOWED_TAGS.has(node.tagName)) {
    node.replaceWith(...node.childNodes);
    return;
  }

  const allowed = ALLOWED_ATTRS[node.tagName] ?? new Set<string>();
  for (const attr of [...node.attributes]) {
    if (!allowed.has(attr.name)) {
      node.removeAttribute(attr.name);
      continue;
    }
    if (node.tagName === 'A' && attr.name === 'href') {
      const href = safeHref(attr.value);
      if (href === null) node.removeAttribute('href');
      else node.setAttribute('href', href);
    }
  }

  if (node.tagName === 'A') {
    if (!node.getAttribute('href')) {
      node.replaceWith(...node.childNodes);
      return;
    }
    // A saved link opens in a new tab and cannot reach back into the panel.
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer nofollow');
  }

  if (node.tagName === 'INPUT') {
    // Checklist boxes are display only; the note itself is the source of truth.
    node.setAttribute('type', 'checkbox');
    node.setAttribute('disabled', 'true');
  }
}

/** Sanitize a note body. Safe to call on anything, including junk. */
export function sanitizeHtml(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return '';
  // A detached document: parsing here never runs script and never loads
  // anything, even for tags that would otherwise fetch.
  const doc = document.implementation.createHTMLDocument('sanitize');
  doc.body.innerHTML = html;
  for (const child of [...doc.body.children]) scrub(child);
  return doc.body.innerHTML;
}

/**
 * The plain-text projection of a body, used for search, snippets, copying and
 * the list view. Block elements become line breaks so text does not run
 * together across paragraphs and list items.
 */
export function htmlToText(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return '';
  const doc = document.implementation.createHTMLDocument('text');
  doc.body.innerHTML = html;

  /**
   * `inListItem` stops a list item's inner paragraph from adding a blank line
   * of its own: TipTap wraps every `<li>` body in a `<p>`, so without this a
   * three-item list would come out double-spaced.
   */
  const walk = (node: Node, inListItem: boolean): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as Element;
    if (DROP_WITH_CONTENTS.has(el.tagName)) return '';
    if (el.tagName === 'BR') return '\n';
    if (el.tagName === 'HR') return '\n';
    if (el.tagName === 'INPUT') {
      return el.hasAttribute('checked') ? '[x] ' : '[ ] ';
    }

    const nested = inListItem || el.tagName === 'LI';
    const inner = [...el.childNodes].map((child) => walk(child, nested)).join('');

    // A code block's whitespace is its content, so `inner` is never touched.
    if (el.tagName === 'PRE') return `${inner}\n\n`;

    const paragraph = PARAGRAPH_TAGS.has(el.tagName) && !inListItem;
    if (paragraph) return `${inner.replace(/\n+$/, '')}\n\n`;
    if (LINE_TAGS.has(el.tagName) || PARAGRAPH_TAGS.has(el.tagName)) {
      return `${inner.replace(/\n+$/, '')}\n`;
    }
    return inner;
  };

  return walk(doc.body, false).replace(/\n{3,}/g, '\n\n').trim();
}

/** Blocks that read as their own paragraph, separated by a blank line. */
const PARAGRAPH_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE']);

/** Blocks that are just a new line: list items and generic containers. */
const LINE_TAGS = new Set(['LI', 'DIV', 'UL', 'OL']);

/** True when a body has no text and no content-bearing elements. */
export function isEmptyHtml(html: string): boolean {
  if (htmlToText(html).length > 0) return false;
  const doc = document.implementation.createHTMLDocument('empty');
  doc.body.innerHTML = html ?? '';
  return doc.body.querySelector('hr, img, input') === null;
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"]/g, (c) => ESCAPES[c] ?? c);

/**
 * Turn plain text into the HTML an equivalent note would have had. Used when
 * migrating notes written before rich text, and when text is pasted in.
 */
export function textToHtml(text: string): string {
  if (!text) return '';
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** The same, for text whose whitespace is the point. */
export function textToCodeBlock(text: string): string {
  return `<pre><code>${escapeHtml(text)}</code></pre>`;
}

/**
 * A DOM-free plain-text fallback.
 *
 * The service worker has no DOM, so a record read there cannot be projected
 * with `htmlToText`. This is only ever used to repair a stored note that is
 * missing its `text` field; the panel rewrites it properly on next edit.
 */
export function stripTagsFallback(html: string): string {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/(p|div|h[1-3]|li|blockquote|ul|ol|pre)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Turning a context-menu click into a note.
 *
 * This lives apart from the service worker so the rules — what becomes the
 * body, which URL is the target and which is the source, what counts as
 * nothing to save — can be tested without a browser.
 */

import type { NoteDraftInput } from './notes';

export const MENU_SELECTION = 'for-now-save-selection';
export const MENU_LINK = 'for-now-save-link';
export const MENU_PAGE = 'for-now-save-page';

/** Keeps a runaway selection from eating the 10 MB local quota in one go. */
export const MAX_CAPTURE_LENGTH = 100_000;

/** The subset of the click payload that matters, so tests need no Chrome types. */
export interface CaptureClick {
  menuItemId: string | number;
  selectionText?: string;
  linkUrl?: string;
  pageUrl?: string;
}

export interface CaptureTab {
  url?: string;
  title?: string;
}

/**
 * Build the note a menu click should produce, or null when there is nothing
 * worth saving.
 *
 * `pageUrl` comes from the context-menu API itself; `title` comes from the
 * activeTab grant the click creates. Either can be missing on a restricted
 * page, and a note is still produced without them.
 */
export function captureFrom(click: CaptureClick, tab?: CaptureTab): NoteDraftInput | null {
  const sourceUrl = click.pageUrl ?? tab?.url;
  const sourceTitle = tab?.title;

  if (click.menuItemId === MENU_SELECTION) {
    const text = (click.selectionText ?? '').slice(0, MAX_CAPTURE_LENGTH);
    if (!text.trim()) return null;
    return { text, kind: 'selection', sourceUrl, sourceTitle };
  }

  if (click.menuItemId === MENU_LINK) {
    const targetUrl = click.linkUrl;
    if (!targetUrl) return null;
    // The link's URL is what must survive, so it is the body. The link text,
    // when Chrome supplies it, goes above as the human-readable label.
    const label = (click.selectionText ?? '').trim();
    return {
      text: label ? `${label}\n${targetUrl}` : targetUrl,
      kind: 'link',
      targetUrl,
      sourceUrl,
      sourceTitle,
    };
  }

  if (click.menuItemId === MENU_PAGE) {
    if (!sourceUrl) return null;
    return {
      text: sourceTitle ? `${sourceTitle}\n${sourceUrl}` : sourceUrl,
      kind: 'page',
      sourceUrl,
      sourceTitle,
    };
  }

  return null;
}

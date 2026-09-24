/**
 * Keeping keyboard focus inside the overlay while it is open.
 *
 * The panel floats over the page like a window, so Tab should cycle through
 * the panel rather than wander into the page behind it — where the user
 * cannot see what has focus. Escape closes it, and clicking the page moves
 * focus there, so nobody is trapped: they just do not get lost.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Everything in `root` that Tab can currently reach, in tab order. */
export function focusables(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.closest('[hidden], [inert], [aria-hidden="true"]') && el.getClientRects().length > 0,
  );
}

/**
 * Where Tab should go instead of where the browser would send it, or null to
 * let the browser move focus as usual.
 *
 * Only the two ends need handling: Tab off the last element wraps to the
 * first, Shift+Tab off the first wraps to the last. Focus outside the list
 * (on the document itself, say) is brought back in at the matching end.
 */
export function wrapTarget(
  items: HTMLElement[],
  active: Element | null,
  backwards: boolean,
): HTMLElement | null {
  if (items.length === 0) return null;
  const first = items[0];
  const last = items[items.length - 1];
  const inside = active instanceof HTMLElement && items.includes(active);
  if (backwards) return !inside || active === first ? last : null;
  return !inside || active === last ? first : null;
}

/** Install the wrap on a document. Returns a function that removes it. */
export function trapFocus(doc: Document): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // Handled by the editor already — Tab indents a list item, for one.
    const target = wrapTarget(focusables(doc), doc.activeElement, event.shiftKey);
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
  // Bubble phase, so the editor sees Tab first and can claim it.
  doc.defaultView?.addEventListener('keydown', onKeyDown);
  return () => doc.defaultView?.removeEventListener('keydown', onKeyDown);
}

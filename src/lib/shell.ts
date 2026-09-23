/**
 * Pinning a host element against the page it is sitting in.
 *
 * The shadow root protects everything *inside* it, but the host element itself
 * lives in the page's own DOM, where the page's CSS applies to it. Two things
 * follow from that, and both were found by a test rather than by reading:
 *
 *  1. `all: initial` in an inline style is not enough. An author rule carrying
 *     `!important` beats a normal inline declaration, so a page with
 *     `* { transform: rotate(7deg) !important }` tilts the panel, and one with
 *     `* { opacity: 0.1 !important }` all but erases it. Inline `!important` is
 *     the only declaration an author rule cannot outrank, so every property
 *     here is set that way.
 *
 *  2. Inherited properties cross the shadow boundary. `text-transform`,
 *     `letter-spacing`, `visibility` and friends are inherited from the host,
 *     so a page can reach into the shadow tree through them. They are reset
 *     here, on the outside, where the page's rules are actually being fought.
 *
 * What this cannot do is escape an ancestor: an element with a transform
 * becomes the containing block for fixed-position descendants, so a page that
 * transforms `<html>` would drag a fixed shell around with it. That is what
 * `enterTopLayer` is for.
 */

/**
 * Everything a page could set on the shell that would move it, hide it, warp
 * it, or leak into the shadow tree through inheritance.
 */
const SHELL_RESET: Record<string, string> = {
  // Box
  display: 'block',
  'box-sizing': 'border-box',
  float: 'none',
  clear: 'none',
  margin: '0',
  padding: '0',
  border: '0',
  'min-width': '0',
  'min-height': '0',
  'max-width': 'none',
  'max-height': 'none',

  // Anything that would move, resize or warp it
  transform: 'none',
  translate: 'none',
  rotate: 'none',
  scale: 'none',
  perspective: 'none',
  zoom: '1',

  // Anything that would hide it or wash it out
  opacity: '1',
  visibility: 'visible',
  filter: 'none',
  'backdrop-filter': 'none',
  'mix-blend-mode': 'normal',
  'clip-path': 'none',
  mask: 'none',
  'content-visibility': 'visible',

  // The shell paints nothing itself; the shadow tree does all of it
  background: 'none',
  'box-shadow': 'none',
  outline: 'none',
  'border-radius': '0',

  // Inherited, so these would otherwise reach inside the shadow root
  color: 'initial',
  'font-family': 'initial',
  'font-size': '16px',
  'font-weight': 'initial',
  'font-style': 'normal',
  'font-variant': 'normal',
  'line-height': 'normal',
  'letter-spacing': 'normal',
  'word-spacing': 'normal',
  'text-transform': 'none',
  'text-indent': '0',
  'text-shadow': 'none',
  'text-align': 'left',
  'white-space': 'normal',
  'word-break': 'normal',
  direction: 'ltr',
  'writing-mode': 'horizontal-tb',
  cursor: 'auto',
  '-webkit-text-stroke': '0',
};

/** Set one property so that no page rule can outrank it. */
export function pin(element: HTMLElement, property: string, value: string): void {
  element.style.setProperty(property, value, 'important');
}

/**
 * Apply the full reset, then the caller's own layout on top. Both go on as
 * `!important`, so the finished element is immune to the page's stylesheet.
 */
export function pinShell(element: HTMLElement, layout: Record<string, string>): void {
  for (const [property, value] of Object.entries(SHELL_RESET)) {
    pin(element, property, value);
  }
  for (const [property, value] of Object.entries(layout)) {
    pin(element, property, value);
  }
}

/**
 * Put the element in the browser's top layer.
 *
 * This is what makes the shell genuinely unreachable. A top-layer element is
 * positioned against the viewport rather than against its ancestors, so a page
 * that transforms `<html>` can no longer drag it off-screen — and it cannot be
 * out-stacked, because the top layer is above every z-index on the page.
 *
 * Returns whether it worked. A huge z-index is the fallback, which is what the
 * shell had before and which is still correct on any page that is not fighting
 * us; the caller sets it either way.
 */
export function enterTopLayer(element: HTMLElement): boolean {
  try {
    element.setAttribute('popover', 'manual');
    (element as HTMLElement & { showPopover(): void }).showPopover();
    return true;
  } catch {
    // Not supported, already open, or the element is not connected yet.
    element.removeAttribute('popover');
    return false;
  }
}

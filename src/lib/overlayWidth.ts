/**
 * The width of the in-page overlay window, which the user can drag to resize.
 *
 * Kept under its own storage key rather than in `Settings`: it is a remembered
 * window size, not a preference anyone sets deliberately, so it has no place
 * in the options page or in a backup of the notes.
 */

export const OVERLAY_WIDTH_KEY = 'overlayWidth';

/** The width a first open gets, and what a double-click on the edge resets to. */
export const DEFAULT_OVERLAY_WIDTH = 600;

/** Below this the toolbar wraps and the note list stops being readable. */
export const MIN_OVERLAY_WIDTH = 600;

/**
 * An upper bound on what is stored. The frame is also capped by CSS at the
 * viewport less its margins, so a width saved on a wide monitor still fits on
 * a narrow one without being overwritten.
 */
export const MAX_OVERLAY_WIDTH = 1200;

/** Step for the arrow keys on the resize handle; Shift moves further. */
export const OVERLAY_WIDTH_STEP = 16;

export function clampOverlayWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_OVERLAY_WIDTH;
  return Math.round(Math.min(MAX_OVERLAY_WIDTH, Math.max(MIN_OVERLAY_WIDTH, width)));
}

/** Read a stored width, falling back to the default for anything unusable. */
export function parseOverlayWidth(value: unknown): number {
  return typeof value === 'number' ? clampOverlayWidth(value) : DEFAULT_OVERLAY_WIDTH;
}

/**
 * Where the bottom-right corner is.
 *
 * Two separate pieces of code have to agree on this one point: the quick-open
 * button draws itself there, and the genie funnels into it. When they drift
 * apart the illusion breaks — the panel appears to shrink into empty space
 * beside the button rather than into the button itself — and nothing in either
 * file would look wrong on its own. So the numbers live here, and a test
 * asserts the two still meet.
 */

import type { Point } from './genie';

/** Diameter of the quick-open button, in px. */
export const LAUNCHER_SIZE = 34;

/** Gap between the button and the two viewport edges it sits against, in px. */
export const LAUNCHER_INSET = 16;

/** Distance from the panel to the viewport edges, in px. */
export const FRAME_INSET = 20;

/**
 * The centre of the quick-open button, which is also the point the genie
 * collapses into. Taken from the viewport rather than from the element, so it
 * is the same whether or not the button is actually on the page.
 */
export function cornerPoint(viewportWidth: number, viewportHeight: number): Point {
  const offset = LAUNCHER_INSET + LAUNCHER_SIZE / 2;
  return { x: viewportWidth - offset, y: viewportHeight - offset };
}

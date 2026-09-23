/** Applies the stored theme preference to whichever root the panel lives in. */

import type { ThemePreference } from './schema';

/**
 * In the side panel the target is the page's own `<html>`. In the overlay it
 * is the shadow host element — writing to `document.documentElement` there
 * would change the theme of somebody else's web page.
 */
export function applyTheme(
  preference: ThemePreference,
  target: HTMLElement = document.documentElement,
): void {
  if (preference === 'system') target.removeAttribute('data-theme');
  else target.setAttribute('data-theme', preference);
}

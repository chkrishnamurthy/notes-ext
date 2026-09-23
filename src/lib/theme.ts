/** Applies the stored theme preference to the document element. */

import type { ThemePreference } from './schema';

export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', preference);
}

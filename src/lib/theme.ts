/**
 * Applies the user's appearance settings to whichever root the panel lives in.
 *
 * Three independent choices resolve to one set of colour tokens:
 *
 *  - the mode (`system`, `light`, `dark`) decides *when* the panel is dark;
 *  - a light palette and a dark palette decide what each mode looks like;
 *  - an optional accent colour replaces the palette's own, adjusted per mode
 *    so it stays readable.
 *
 * The tokens are written as custom properties on the target, so every
 * component keeps reading the same `--fn-*` names it always has. Typography
 * rides along the same way.
 *
 * In the side panel and options page the target is the page's own `<html>`.
 * In the overlay it is the shadow host element — writing to
 * `document.documentElement` there would change somebody else's web page.
 */

import { deriveAccent } from './color';
import { getPalette, type ThemeTokens } from './palettes';
import { parseSettings, type EditorFont, type Settings, type TextSize } from './schema';

export type Appearance = Pick<
  Settings,
  'theme' | 'lightPalette' | 'darkPalette' | 'accent' | 'editorFont' | 'textSize'
>;

export type Mode = 'light' | 'dark';

export const EDITOR_FONTS: Record<EditorFont, { label: string; stack: string }> = {
  sans: {
    label: 'Sans',
    stack:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  serif: {
    label: 'Serif',
    stack: 'Charter, "Iowan Old Style", "Palatino Linotype", Georgia, Cambria, serif',
  },
  mono: {
    label: 'Mono',
    stack:
      'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },
};

export const TEXT_SIZES: Record<TextSize, { label: string; px: number }> = {
  small: { label: 'Small', px: 15 },
  medium: { label: 'Medium', px: 17 },
  large: { label: 'Large', px: 19 },
};

/** Where extension pages remember the last appearance, for a correct first paint. */
const CACHE_KEY = 'for-now:appearance';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia(DARK_QUERY).matches;
  } catch {
    return false;
  }
}

export function resolveMode(preference: Appearance['theme'], systemDark = systemPrefersDark()): Mode {
  if (preference === 'light' || preference === 'dark') return preference;
  return systemDark ? 'dark' : 'light';
}

export interface ResolvedTheme {
  tokens: ThemeTokens;
  /** True when a custom accent had to be lightened or darkened to be readable. */
  accentAdjusted: boolean;
}

export function resolveTokens(appearance: Appearance, mode: Mode): ResolvedTheme {
  const palette = getPalette(mode === 'dark' ? appearance.darkPalette : appearance.lightPalette);
  const tokens: ThemeTokens = { ...palette[mode] };
  if (!appearance.accent) return { tokens, accentAdjusted: false };

  const derived = deriveAccent(appearance.accent, tokens.paper, mode === 'dark', tokens.bg);
  tokens.accent = derived.accent;
  tokens['on-accent'] = derived.onAccent;
  return { tokens, accentAdjusted: derived.adjusted };
}

/** The custom properties for one resolved theme, ready to set on an element. */
export function themeVariables(appearance: Appearance, mode: Mode): Record<string, string> {
  const { tokens } = resolveTokens(appearance, mode);
  const vars: Record<string, string> = {};
  for (const [name, value] of Object.entries(tokens)) vars[`--fn-${name}`] = value;
  vars['--fn-text'] = `${TEXT_SIZES[appearance.textSize].px}px`;
  vars['--fn-note-font'] = EDITOR_FONTS[appearance.editorFont].stack;
  return vars;
}

/** Live `system` listeners, one per target, so re-applying never stacks them. */
const systemListeners = new WeakMap<HTMLElement, () => void>();

export function applyTheme(
  appearance: Appearance,
  target: HTMLElement = document.documentElement,
): void {
  systemListeners.get(target)?.();
  systemListeners.delete(target);

  paint(appearance, target);

  if (appearance.theme === 'system') {
    try {
      const query = window.matchMedia(DARK_QUERY);
      const onChange = () => paint(appearance, target);
      query.addEventListener('change', onChange);
      systemListeners.set(target, () => query.removeEventListener('change', onChange));
    } catch {
      // No matchMedia (tests, very old engines): the first paint stands.
    }
  }

  remember(appearance, target);
}

function paint(appearance: Appearance, target: HTMLElement): void {
  const mode = resolveMode(appearance.theme);
  // `data-theme` still records an explicit choice, so the stylesheet's own
  // fallback palette agrees with the tokens below while they are loading.
  if (appearance.theme === 'system') target.removeAttribute('data-theme');
  else target.setAttribute('data-theme', appearance.theme);
  target.setAttribute('data-mode', mode);

  // `important`, because in the overlay the target is an element in a web
  // page's own DOM, where only an inline !important outranks the page's CSS.
  for (const [name, value] of Object.entries(themeVariables(appearance, mode))) {
    target.style.setProperty(name, value, 'important');
  }
  target.style.setProperty('color-scheme', mode, 'important');
}

/**
 * Only extension pages keep the cache. A content script shares the web page's
 * `localStorage`, and the page has no business learning this is installed.
 */
function isExtensionDocument(target: HTMLElement): boolean {
  return (
    typeof location !== 'undefined' &&
    location.protocol === 'chrome-extension:' &&
    target === document.documentElement
  );
}

function remember(appearance: Appearance, target: HTMLElement): void {
  if (!isExtensionDocument(target)) return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(appearance));
  } catch {
    // Only the first paint of the next open is affected.
  }
}

/**
 * Paint the last-known appearance synchronously, before React renders, so an
 * extension page does not flash the default palette while settings load.
 * The real settings are applied as soon as they arrive.
 */
export function applyCachedTheme(): void {
  if (!isExtensionDocument(document.documentElement)) return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    applyTheme(parseSettings(JSON.parse(raw)));
  } catch {
    // A missing or corrupt cache just means the stylesheet's default shows.
  }
}

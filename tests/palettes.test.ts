import { describe, expect, it } from 'vitest';

import { MIN_TEXT_CONTRAST, contrast } from '../src/lib/color';
import { PALETTES, type ThemeTokens } from '../src/lib/palettes';

/**
 * Every pairing in every palette that carries text, held to WCAG AA. A new
 * palette is checked the moment it is added to the registry.
 */
const TEXT_PAIRS: [keyof ThemeTokens, keyof ThemeTokens, string][] = [
  ['ink', 'paper', 'body text'],
  ['ink', 'bg', 'text on the list background'],
  ['muted', 'paper', 'secondary text'],
  ['muted', 'soft', 'secondary text on chips'],
  ['muted', 'bg', 'secondary text in the list'],
  ['accent', 'paper', 'links and the active tab'],
  ['accent', 'soft', 'the active filter chip'],
  ['on-accent', 'accent', 'the Add note label'],
  ['ink', 'mark', 'search highlights'],
  ['warning', 'warning-bg', 'warnings'],
];

describe('palettes', () => {
  it('have unique ids and both modes', () => {
    const ids = PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const palette of PALETTES) {
      expect(Object.keys(palette.light).sort()).toEqual(Object.keys(palette.dark).sort());
    }
  });

  for (const palette of PALETTES) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${palette.name} ${mode} keeps every text pairing readable`, () => {
        const t = palette[mode];
        for (const [fg, bg, what] of TEXT_PAIRS) {
          const ratio = contrast(t[fg], t[bg]);
          expect(ratio, `${what}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
            MIN_TEXT_CONTRAST,
          );
        }
      });
    }
  }
});

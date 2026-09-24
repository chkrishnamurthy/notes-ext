import { describe, expect, it } from 'vitest';

import { MIN_TEXT_CONTRAST, contrast, deriveAccent, isHexColor } from '../src/lib/color';
import { PALETTES } from '../src/lib/palettes';

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });
});

describe('isHexColor', () => {
  it('accepts only six-digit hex', () => {
    expect(isHexColor('#2563eb')).toBe(true);
    expect(isHexColor('#2563EB')).toBe(true);
    expect(isHexColor('#fff')).toBe(false);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('url(x)')).toBe(false);
    expect(isHexColor(42)).toBe(false);
  });
});

describe('deriveAccent', () => {
  it('keeps a colour that already reads', () => {
    const result = deriveAccent('#315e49', '#ffffff', false);
    expect(result.accent).toBe('#315e49');
    expect(result.adjusted).toBe(false);
  });

  it('darkens a pale pick for light mode and lightens a deep one for dark', () => {
    const light = deriveAccent('#ffe45c', '#ffffff', false);
    expect(light.adjusted).toBe(true);
    expect(contrast(light.accent, '#ffffff')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);

    const dark = deriveAccent('#1e1b4b', '#222825', true, '#1c201e');
    expect(dark.adjusted).toBe(true);
    expect(contrast(dark.accent, '#222825')).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it('changes lightness only as much as it has to', () => {
    // Just short of passing on white: the result should stay close to it.
    const result = deriveAccent('#3b82f6', '#ffffff', false);
    const ratio = contrast(result.accent, '#ffffff');
    expect(ratio).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
    expect(ratio).toBeLessThan(5.2);
  });

  it('makes any colour readable on every palette, with a readable label', () => {
    // A coarse sweep of the whole cube, including greys, neons and near-blacks.
    const steps = ['00', '33', '66', '99', 'cc', 'ff'];
    for (const r of steps) {
      for (const g of steps) {
        for (const b of steps) {
          const picked = `#${r}${g}${b}`;
          for (const palette of PALETTES) {
            for (const mode of ['light', 'dark'] as const) {
              const t = palette[mode];
              const { accent, onAccent } = deriveAccent(picked, t.paper, mode === 'dark', t.bg);
              expect(contrast(accent, t.paper), `${picked} on ${palette.id} ${mode}`).toBeGreaterThanOrEqual(
                MIN_TEXT_CONTRAST,
              );
              expect(contrast(onAccent, accent), `label on ${picked}`).toBeGreaterThanOrEqual(
                MIN_TEXT_CONTRAST,
              );
            }
          }
        }
      }
    }
  });
});

/**
 * Colour maths for the theme system: WCAG contrast, and deriving a readable
 * accent from any colour the user picks.
 *
 * The accent is adjusted in OKLCH rather than in RGB or HSL. OKLCH lightness
 * tracks what the eye sees, so walking it up or down changes how light the
 * colour looks while keeping its hue — a picked red stays red, instead of
 * drifting toward pink or brown the way an HSL adjustment would.
 */

export type Rgb = [number, number, number];

const HEX = /^#([0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

export function hexToRgb(hex: string): Rgb {
  const n = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as Rgb;
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0'))
    .join('')}`;
}

// ---------------------------------------------------------------------------
// WCAG 2 contrast
// ---------------------------------------------------------------------------

const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (c: number): number =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ---------------------------------------------------------------------------
// OKLCH (Björn Ottosson's OKLab, in polar form)
// ---------------------------------------------------------------------------

interface Oklch {
  l: number;
  c: number;
  h: number;
}

function rgbToOklch(rgb: Rgb): Oklch {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

/** Linear sRGB, which may fall outside 0–1 when the colour is out of gamut. */
function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/**
 * Back to a displayable hex. A lightness change can push a saturated colour
 * out of the sRGB gamut; chroma is reduced until it fits, which keeps the hue
 * and lightness and gives up only a little saturation.
 */
function oklchToHex(colour: Oklch): string {
  let c = colour.c;
  for (let i = 0; i < 24; i += 1) {
    const lin = oklchToLinear({ ...colour, c });
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) {
      return rgbToHex(lin.map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as Rgb);
    }
    c *= 0.85;
  }
  return rgbToHex(
    oklchToLinear({ ...colour, c: 0 }).map((v) => fromLinear(Math.min(1, Math.max(0, v)))) as Rgb,
  );
}

// ---------------------------------------------------------------------------
// Accent derivation
// ---------------------------------------------------------------------------

/** WCAG AA for normal text: links and the Add button's label must reach it. */
export const MIN_TEXT_CONTRAST = 4.5;

export interface DerivedAccent {
  accent: string;
  /** Text drawn on top of the accent, e.g. the Add note button's label. */
  onAccent: string;
  /** True when the picked colour had to be lightened or darkened. */
  adjusted: boolean;
}

/**
 * Turn any colour into an accent that reads on `paper`.
 *
 * On a light paper the colour is darkened until it clears 4.5:1; on a dark
 * one it is lightened. A colour that already passes is used exactly as
 * picked. The label colour on top is whichever of the two candidates
 * contrasts more — white, or the palette's own dark ink for dark mode.
 */
export function deriveAccent(
  picked: string,
  paper: string,
  dark: boolean,
  darkLabel = '#111111',
): DerivedAccent {
  let accent = picked.toLowerCase();

  if (contrast(accent, paper) < MIN_TEXT_CONTRAST) {
    const start = rgbToOklch(hexToRgb(accent));
    // Binary search on lightness for the value closest to the original that
    // still passes: as little change as it takes, and no more.
    let lo = dark ? start.l : 0;
    let hi = dark ? 1 : start.l;
    let best = oklchToHex({ ...start, l: dark ? 0.98 : 0.2 });
    for (let i = 0; i < 20; i += 1) {
      const mid = (lo + hi) / 2;
      const candidate = oklchToHex({ ...start, l: mid });
      const passes = contrast(candidate, paper) >= MIN_TEXT_CONTRAST;
      if (passes) best = candidate;
      if (dark) {
        if (passes) hi = mid;
        else lo = mid;
      } else if (passes) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    accent = best;
  }

  const label = contrast('#ffffff', accent) >= contrast(darkLabel, accent) ? '#ffffff' : darkLabel;
  return { accent, onAccent: label, adjusted: accent !== picked.toLowerCase() };
}

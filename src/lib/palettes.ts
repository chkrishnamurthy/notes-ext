/**
 * The colour palettes a user can choose from.
 *
 * Each palette is tuned twice, once for light mode and once for dark, so any
 * palette can be picked for either slot. Every pairing that carries text is
 * held to WCAG AA (4.5:1) by `tests/palettes.test.ts`; add a palette here and
 * the test checks it automatically.
 *
 * The keys are the same colour tokens the stylesheet has always used, so the
 * components never know which palette is active. `styles.css` keeps Sage's
 * values as the fallback that paints before any settings have loaded.
 */

export interface ThemeTokens {
  bg: string;
  paper: string;
  ink: string;
  muted: string;
  line: string;
  soft: string;
  accent: string;
  'on-accent': string;
  warning: string;
  'warning-bg': string;
  mark: string;
  shadow: string;
}

export type PaletteId = 'sage' | 'paper' | 'slate' | 'heather' | 'ochre' | 'graphite';

export interface Palette {
  id: PaletteId;
  name: string;
  description: string;
  light: ThemeTokens;
  dark: ThemeTokens;
}

// Warnings keep one hue everywhere: a warning should look like a warning
// whatever the palette, not like part of the decoration.
const LIGHT_WARNING = { warning: '#7b3e19', 'warning-bg': '#fff2e6' };
const DARK_WARNING = { warning: '#ffca9f', 'warning-bg': '#402d21' };
const LIGHT_SHADOW = 'rgba(36, 54, 43, 0.07)';
const DARK_SHADOW = 'rgba(0, 0, 0, 0.35)';

export const PALETTES: readonly Palette[] = [
  {
    id: 'sage',
    name: 'Sage',
    description: 'Calm green on warm white.',
    light: {
      bg: '#fbfaf7', paper: '#ffffff', ink: '#202d27', muted: '#5f6b62', line: '#dce1da',
      soft: '#edf1eb', accent: '#315e49', 'on-accent': '#ffffff', mark: '#e7edc8',
      ...LIGHT_WARNING, shadow: LIGHT_SHADOW,
    },
    dark: {
      bg: '#1c201e', paper: '#222825', ink: '#eff4ef', muted: '#b2bdb5', line: '#414c44',
      soft: '#303a33', accent: '#a7d1b5', 'on-accent': '#14291c', mark: '#4a5032',
      ...DARK_WARNING, shadow: DARK_SHADOW,
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    description: 'Warm off-white stock, fountain-pen blue.',
    light: {
      bg: '#f6f3ec', paper: '#fffdf8', ink: '#27241e', muted: '#6b655a', line: '#e3ddd0',
      soft: '#f1ece1', accent: '#2d4b86', 'on-accent': '#ffffff', mark: '#f5e4a3',
      ...LIGHT_WARNING, shadow: LIGHT_SHADOW,
    },
    dark: {
      bg: '#1c1a17', paper: '#24221e', ink: '#f3efe6', muted: '#bab3a5', line: '#46413a',
      soft: '#34302a', accent: '#a7bdf0', 'on-accent': '#14203a', mark: '#5b4d20',
      ...DARK_WARNING, shadow: DARK_SHADOW,
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    description: 'Cool greys and a clear blue.',
    light: {
      bg: '#f5f7fa', paper: '#ffffff', ink: '#1d2532', muted: '#5a6879', line: '#d8dfe8',
      soft: '#edf1f6', accent: '#2356c0', 'on-accent': '#ffffff', mark: '#dbe6ff',
      ...LIGHT_WARNING, shadow: LIGHT_SHADOW,
    },
    dark: {
      bg: '#14191f', paper: '#1a2029', ink: '#e7edf5', muted: '#9fb0c3', line: '#333f4d',
      soft: '#252f3b', accent: '#8db4ff', 'on-accent': '#0b1a33', mark: '#2c3e62',
      ...DARK_WARNING, shadow: DARK_SHADOW,
    },
  },
  {
    id: 'heather',
    name: 'Heather',
    description: 'Muted mauve, soft but high contrast.',
    light: {
      bg: '#f9f6f8', paper: '#ffffff', ink: '#2b2230', muted: '#6e6173', line: '#e5dbe5',
      soft: '#f2ebf1', accent: '#74386b', 'on-accent': '#ffffff', mark: '#f3dcea',
      ...LIGHT_WARNING, shadow: LIGHT_SHADOW,
    },
    dark: {
      bg: '#1d181f', paper: '#251f27', ink: '#f3ebf2', muted: '#c0afc0', line: '#4a3e4b',
      soft: '#372d38', accent: '#e0a8d5', 'on-accent': '#2d1128', mark: '#553a4f',
      ...DARK_WARNING, shadow: DARK_SHADOW,
    },
  },
  {
    id: 'ochre',
    name: 'Ochre',
    description: 'Parchment and amber, for long evenings.',
    light: {
      bg: '#faf7f0', paper: '#fffefa', ink: '#2a2418', muted: '#6c6350', line: '#e6dfcd',
      soft: '#f3eddc', accent: '#80520a', 'on-accent': '#ffffff', mark: '#f6e2a6',
      ...LIGHT_WARNING, shadow: LIGHT_SHADOW,
    },
    dark: {
      bg: '#1d1a14', paper: '#25211a', ink: '#f5efe2', muted: '#bfb49b', line: '#4a4332',
      soft: '#373023', accent: '#efc36a', 'on-accent': '#2b1d00', mark: '#5c4a1c',
      ...DARK_WARNING, shadow: DARK_SHADOW,
    },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    description: 'High contrast, pure black and white.',
    light: {
      bg: '#ffffff', paper: '#ffffff', ink: '#000000', muted: '#3b3b3b', line: '#767676',
      soft: '#eeeeee', accent: '#0a54cc', 'on-accent': '#ffffff', mark: '#ffe45c',
      ...LIGHT_WARNING, shadow: LIGHT_SHADOW,
    },
    dark: {
      bg: '#000000', paper: '#0a0a0a', ink: '#ffffff', muted: '#d2d2d2', line: '#8c8c8c',
      soft: '#1f1f1f', accent: '#a3c8ff', 'on-accent': '#000000', mark: '#5e4c00',
      ...DARK_WARNING, shadow: DARK_SHADOW,
    },
  },
];

export const PALETTE_IDS: readonly PaletteId[] = PALETTES.map((p) => p.id);

export const DEFAULT_PALETTE: PaletteId = 'sage';

export function isPaletteId(value: unknown): value is PaletteId {
  return typeof value === 'string' && (PALETTE_IDS as readonly string[]).includes(value);
}

export function getPalette(id: PaletteId): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** Accent presets offered next to the free colour picker. */
export const ACCENT_PRESETS: readonly { name: string; value: string }[] = [
  { name: 'Blue', value: '#2563eb' },
  { name: 'Teal', value: '#0f766e' },
  { name: 'Green', value: '#15803d' },
  { name: 'Amber', value: '#b45309' },
  { name: 'Red', value: '#b91c1c' },
  { name: 'Violet', value: '#6d28d9' },
  { name: 'Pink', value: '#be185d' },
];

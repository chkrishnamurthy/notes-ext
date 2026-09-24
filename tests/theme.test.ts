import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPalette } from '../src/lib/palettes';
import { DEFAULT_SETTINGS, parseSettings } from '../src/lib/schema';
import { applyTheme, resolveMode, resolveTokens, themeVariables } from '../src/lib/theme';

describe('appearance settings', () => {
  it('default to following the system with Sage', () => {
    const settings = parseSettings(undefined);
    expect(settings.theme).toBe('system');
    expect(settings.lightPalette).toBe('sage');
    expect(settings.darkPalette).toBe('sage');
    expect(settings.accent).toBeNull();
    expect(settings.editorFont).toBe('sans');
    expect(settings.textSize).toBe('large');
  });

  it('keep settings written before palettes existed', () => {
    const settings = parseSettings({ theme: 'dark', trashRetentionDays: 14 });
    expect(settings.theme).toBe('dark');
    expect(settings.darkPalette).toBe('sage');
    expect(settings.trashRetentionDays).toBe(14);
  });

  it('fall back on anything unknown or unsafe', () => {
    const settings = parseSettings({
      lightPalette: 'neon',
      darkPalette: 42,
      accent: 'red; background: url(x)',
      editorFont: 'comic',
      textSize: 'huge',
    });
    expect(settings.lightPalette).toBe('sage');
    expect(settings.darkPalette).toBe('sage');
    expect(settings.accent).toBeNull();
    expect(settings.editorFont).toBe('sans');
    expect(settings.textSize).toBe('large');
  });

  it('keep valid choices, lower-casing the accent', () => {
    const settings = parseSettings({
      theme: 'light',
      lightPalette: 'paper',
      darkPalette: 'graphite',
      accent: '#2563EB',
      editorFont: 'serif',
      textSize: 'large',
    });
    expect(settings).toMatchObject({
      lightPalette: 'paper',
      darkPalette: 'graphite',
      accent: '#2563eb',
      editorFont: 'serif',
      textSize: 'large',
    });
  });
});

describe('resolving a theme', () => {
  it('picks the mode from the preference, or the system when asked to', () => {
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
  });

  it('uses a separate palette for each mode', () => {
    const appearance = { ...DEFAULT_SETTINGS, lightPalette: 'paper', darkPalette: 'slate' } as const;
    expect(resolveTokens(appearance, 'light').tokens.paper).toBe(getPalette('paper').light.paper);
    expect(resolveTokens(appearance, 'dark').tokens.paper).toBe(getPalette('slate').dark.paper);
  });

  it('replaces only the accent and its label when an accent is set', () => {
    const base = resolveTokens(DEFAULT_SETTINGS, 'light').tokens;
    const custom = resolveTokens({ ...DEFAULT_SETTINGS, accent: '#b91c1c' }, 'light').tokens;
    expect(custom.accent).toBe('#b91c1c');
    expect({ ...custom, accent: base.accent, 'on-accent': base['on-accent'] }).toEqual(base);
  });

  it('carries typography as variables', () => {
    const vars = themeVariables({ ...DEFAULT_SETTINGS, textSize: 'large', editorFont: 'mono' }, 'light');
    expect(vars['--fn-text']).toBe('19px');
    expect(vars['--fn-note-font']).toContain('monospace');
    expect(vars['--fn-paper']).toBe('#ffffff');
  });
});

describe('applyTheme', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes the tokens onto the target, not anywhere else', () => {
    const target = document.createElement('div');
    applyTheme({ ...DEFAULT_SETTINGS, theme: 'dark', darkPalette: 'graphite' }, target);
    expect(target.getAttribute('data-theme')).toBe('dark');
    expect(target.getAttribute('data-mode')).toBe('dark');
    expect(target.style.getPropertyValue('--fn-paper')).toBe('#0a0a0a');
    expect(target.style.getPropertyPriority('--fn-paper')).toBe('important');
    expect(document.documentElement.style.getPropertyValue('--fn-paper')).toBe('');
  });

  it('follows the system live, and stops when the mode is pinned', () => {
    let dark = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return dark;
      },
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
    }));

    const target = document.createElement('div');
    applyTheme({ ...DEFAULT_SETTINGS, theme: 'system', darkPalette: 'slate' }, target);
    expect(target.getAttribute('data-mode')).toBe('light');

    dark = true;
    listeners.forEach((fn) => fn());
    expect(target.getAttribute('data-mode')).toBe('dark');
    expect(target.style.getPropertyValue('--fn-paper')).toBe(getPalette('slate').dark.paper);

    applyTheme({ ...DEFAULT_SETTINGS, theme: 'light' }, target);
    expect(listeners.size).toBe(0);
  });
});

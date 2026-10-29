import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '../src/lib/schema';

describe('first-run tips setting', () => {
  it('starts unseen', () => {
    expect(DEFAULT_SETTINGS.welcomeSeen).toBe(false);
    expect(parseSettings(undefined).welcomeSeen).toBe(false);
  });

  it('is remembered once dismissed', () => {
    expect(parseSettings({ welcomeSeen: true }).welcomeSeen).toBe(true);
  });

  it('treats anything but an explicit true as unseen', () => {
    for (const value of ['true', 1, null, {}]) {
      expect(parseSettings({ welcomeSeen: value }).welcomeSeen).toBe(false);
    }
  });

  it('leaves settings saved before it existed unchanged', () => {
    const settings = parseSettings({ theme: 'dark', trashRetentionDays: 14 });
    expect(settings.theme).toBe('dark');
    expect(settings.trashRetentionDays).toBe(14);
    expect(settings.welcomeSeen).toBe(false);
  });
});

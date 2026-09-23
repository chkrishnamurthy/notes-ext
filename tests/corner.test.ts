import { describe, expect, it } from 'vitest';

import {
  FRAME_INSET,
  LAUNCHER_INSET,
  LAUNCHER_SIZE,
  cornerPoint,
} from '../src/lib/corner';
import { DEFAULT_GENIE, sliceTransforms } from '../src/lib/genie';
import { DEFAULT_SETTINGS, parseSettings } from '../src/lib/schema';

const VIEWPORT = { width: 1100, height: 780 };

describe('cornerPoint', () => {
  it('lands on the centre of the quick-open button', () => {
    const point = cornerPoint(VIEWPORT.width, VIEWPORT.height);
    // The button is inset from both edges, so its centre is half a diameter
    // further in again.
    expect(point.x).toBe(VIEWPORT.width - LAUNCHER_INSET - LAUNCHER_SIZE / 2);
    expect(point.y).toBe(VIEWPORT.height - LAUNCHER_INSET - LAUNCHER_SIZE / 2);
  });

  it('stays inside the viewport', () => {
    const point = cornerPoint(VIEWPORT.width, VIEWPORT.height);
    expect(point.x).toBeLessThan(VIEWPORT.width);
    expect(point.y).toBeLessThan(VIEWPORT.height);
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeGreaterThan(0);
  });

  it('keeps the button clear of the panel it opens', () => {
    // The panel's bottom edge must not sit on top of the button, or the
    // button would be unreachable the moment the panel is closed over it.
    expect(LAUNCHER_INSET).toBeLessThan(FRAME_INSET + LAUNCHER_SIZE);
  });
});

describe('the genie aims at the button', () => {
  /** The panel, as `.fn-frame` lays it out against the same viewport. */
  const frame = {
    width: 410,
    height: VIEWPORT.height - FRAME_INSET * 2,
    left: VIEWPORT.width - FRAME_INSET - 410,
    top: FRAME_INSET,
  };

  it('collapses every slice onto the button centre', () => {
    const target = cornerPoint(VIEWPORT.width, VIEWPORT.height);
    const plans = sliceTransforms(frame, target, DEFAULT_GENIE);

    for (const plan of plans) {
      const centreX = frame.left + frame.width / 2;
      const centreY = frame.top + plan.top + plan.height / 2;
      const last = plan.keyframes[2];
      expect(centreX + last.dx).toBeCloseTo(target.x, 5);
      expect(centreY + last.dy).toBeCloseTo(target.y, 5);
    }
  });

  it('does not leave the slices short of the button', () => {
    // A regression guard for the two files drifting apart: if the corner and
    // the genie ever disagree, the panel shrinks into empty space beside the
    // button and neither file looks wrong on its own.
    const target = cornerPoint(VIEWPORT.width, VIEWPORT.height);
    const buttonLeft = VIEWPORT.width - LAUNCHER_INSET - LAUNCHER_SIZE;
    const buttonTop = VIEWPORT.height - LAUNCHER_INSET - LAUNCHER_SIZE;
    expect(target.x).toBeGreaterThanOrEqual(buttonLeft);
    expect(target.y).toBeGreaterThanOrEqual(buttonTop);
  });
});

describe('the quick-open setting', () => {
  it('is off unless it was explicitly turned on', () => {
    expect(DEFAULT_SETTINGS.showLauncher).toBe(false);
    expect(parseSettings({}).showLauncher).toBe(false);
    expect(parseSettings(null).showLauncher).toBe(false);
  });

  it('never reads a corrupt value as on', () => {
    // Anything that is not the boolean `true` means off. A record damaged in
    // storage must not be the reason a button appears on every page.
    for (const value of ['true', 1, 'yes', {}, [], 'on']) {
      expect(parseSettings({ showLauncher: value }).showLauncher).toBe(false);
    }
  });

  it('survives a round trip when it is on', () => {
    expect(parseSettings({ showLauncher: true }).showLauncher).toBe(true);
  });
});

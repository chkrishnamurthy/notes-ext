import { describe, expect, it } from 'vitest';

import {
  DEFAULT_OVERLAY_WIDTH,
  MAX_OVERLAY_WIDTH,
  MIN_OVERLAY_WIDTH,
  clampOverlayWidth,
  parseOverlayWidth,
} from '../src/lib/overlayWidth';

describe('overlay width', () => {
  it('keeps a width inside the allowed range', () => {
    expect(clampOverlayWidth(720)).toBe(720);
    expect(clampOverlayWidth(100)).toBe(MIN_OVERLAY_WIDTH);
    expect(clampOverlayWidth(5000)).toBe(MAX_OVERLAY_WIDTH);
    expect(clampOverlayWidth(700.6)).toBe(701);
  });

  it('falls back to the default for anything unusable', () => {
    expect(parseOverlayWidth(undefined)).toBe(DEFAULT_OVERLAY_WIDTH);
    expect(parseOverlayWidth('600')).toBe(DEFAULT_OVERLAY_WIDTH);
    expect(parseOverlayWidth(Number.NaN)).toBe(DEFAULT_OVERLAY_WIDTH);
    expect(parseOverlayWidth(840)).toBe(840);
  });
});

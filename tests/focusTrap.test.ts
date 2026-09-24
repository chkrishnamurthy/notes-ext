import { describe, expect, it } from 'vitest';
import { wrapTarget } from '../src/lib/focusTrap';

const buttons = (n: number) => Array.from({ length: n }, () => document.createElement('button'));

describe('wrapTarget', () => {
  it('wraps Tab from the last element to the first', () => {
    const items = buttons(3);
    expect(wrapTarget(items, items[2], false)).toBe(items[0]);
  });

  it('wraps Shift+Tab from the first element to the last', () => {
    const items = buttons(3);
    expect(wrapTarget(items, items[0], true)).toBe(items[2]);
  });

  it('leaves Tab alone in the middle', () => {
    const items = buttons(3);
    expect(wrapTarget(items, items[1], false)).toBeNull();
    expect(wrapTarget(items, items[1], true)).toBeNull();
  });

  it('brings focus back in from outside the panel', () => {
    const items = buttons(3);
    expect(wrapTarget(items, document.body, false)).toBe(items[0]);
    expect(wrapTarget(items, document.body, true)).toBe(items[2]);
  });

  it('does nothing with nothing to focus', () => {
    expect(wrapTarget([], document.body, false)).toBeNull();
  });
});

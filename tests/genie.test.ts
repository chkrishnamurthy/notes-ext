import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GENIE,
  buildSlices,
  genieDuration,
  sliceTransforms,
  type Rect,
} from '../src/lib/genie';

const RECT: Rect = { left: 600, top: 100, width: 400, height: 640 };
const TARGET = { x: 1080, y: 740 };

describe('slice geometry', () => {
  const plans = sliceTransforms(RECT, TARGET);

  it('covers the panel exactly, with no gap and no overlap', () => {
    expect(plans).toHaveLength(DEFAULT_GENIE.slices);
    expect(plans[0].top).toBe(0);
    const last = plans[plans.length - 1];
    expect(last.top + last.height).toBeCloseTo(RECT.height, 5);
    for (let i = 1; i < plans.length; i += 1) {
      expect(plans[i].top).toBeCloseTo(plans[i - 1].top + plans[i - 1].height, 5);
    }
  });

  it('starts every slice at rest', () => {
    for (const plan of plans) {
      expect(plan.keyframes[0]).toEqual({ dx: 0, dy: 0, sx: 1, sy: 1, opacity: 1 });
    }
  });

  it('lands every slice on the target point', () => {
    for (const [index, plan] of plans.entries()) {
      const centreX = RECT.left + RECT.width / 2;
      const centreY = RECT.top + plan.top + plan.height / 2;
      const end = plan.keyframes[2];
      expect(centreX + end.dx).toBeCloseTo(TARGET.x, 5);
      expect(centreY + end.dy).toBeCloseTo(TARGET.y, 5);
      expect(index).toBeGreaterThanOrEqual(0);
    }
  });

  it('releases the slice nearest the target first', () => {
    // The bottom slice leaves immediately and the top one waits longest.
    // That ordering is the entire illusion; reversing it looks wrong.
    const first = plans[0].delay;
    const last = plans[plans.length - 1].delay;
    expect(last).toBeLessThan(first);
    // Effectively immediate. Not exactly zero, because a slice's position is
    // measured at its centre rather than its edge.
    expect(last).toBeLessThan(2);
    expect(first).toBeLessThanOrEqual(DEFAULT_GENIE.stagger);
    // The top slice must still be waiting when the bottom one has arrived,
    // or there is no tail to curve.
    expect(first).toBeGreaterThan(DEFAULT_GENIE.duration * 0.5);
  });

  it('staggers monotonically, so no slice overtakes the one below it', () => {
    for (let i = 1; i < plans.length; i += 1) {
      expect(plans[i].delay).toBeLessThanOrEqual(plans[i - 1].delay);
    }
  });

  it('bends rather than travelling in a straight line', () => {
    // A straight path would put the mid keyframe on the line between rest and
    // target. The bend pulls it back horizontally, which forms the neck.
    const plan = plans[0];
    const end = plan.keyframes[2];
    const bend = plan.keyframes[1];
    const straightDx = end.dx * (bend.dy / end.dy);
    expect(Math.abs(bend.dx)).toBeLessThan(Math.abs(straightDx));
  });

  it('pinches to a sliver but never to zero', () => {
    // Scaling to exactly 0 makes Chrome drop the layer and the tail vanishes
    // a frame early.
    for (const plan of plans) {
      expect(plan.keyframes[2].sx).toBeGreaterThan(0);
      expect(plan.keyframes[2].sy).toBeGreaterThan(0);
      expect(plan.keyframes[2].sx).toBeLessThan(0.1);
    }
  });

  it('respects a custom slice count', () => {
    expect(sliceTransforms(RECT, TARGET, { ...DEFAULT_GENIE, slices: 8 })).toHaveLength(8);
  });

  it('never produces fewer than two slices', () => {
    expect(sliceTransforms(RECT, TARGET, { ...DEFAULT_GENIE, slices: 0 })).toHaveLength(2);
  });

  it('reports the full wall time including the stagger', () => {
    expect(genieDuration()).toBe(DEFAULT_GENIE.duration + DEFAULT_GENIE.stagger);
  });
});

describe('slice elements', () => {
  const plans = sliceTransforms(RECT, TARGET);

  function source(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'fn-frame';
    el.style.visibility = 'hidden';
    el.innerHTML = '<p>a note</p>';
    return el;
  }

  it('builds one element per slice', () => {
    expect(buildSlices(source(), RECT, plans)).toHaveLength(plans.length);
  });

  it('positions each slice over its own band of the panel', () => {
    const elements = buildSlices(source(), RECT, plans);
    expect(elements[0].style.top).toBe(`${RECT.top}px`);
    expect(elements[1].style.top).toBe(`${RECT.top + plans[1].top}px`);
    expect(elements[0].style.left).toBe(`${RECT.left}px`);
  });

  it('overlaps neighbours so no seam shows between slices', () => {
    const elements = buildSlices(source(), RECT, plans);
    expect(parseFloat(elements[0].style.height)).toBeCloseTo(plans[0].height + 2, 5);
  });

  it('offsets the clone so the right band shows through', () => {
    const elements = buildSlices(source(), RECT, plans);
    const clone = elements[3].firstElementChild as HTMLElement;
    expect(clone.style.top).toBe(`${-plans[3].top}px`);
    expect(clone.style.height).toBe(`${RECT.height}px`);
  });

  it('never copies the source’s hidden state onto the clones', () => {
    // The frame is hidden while the open animation is being prepared. Copying
    // that would give a stack of invisible slices and no animation at all.
    const elements = buildSlices(source(), RECT, plans);
    for (const element of elements) {
      const clone = element.firstElementChild as HTMLElement;
      expect(clone.style.visibility).toBe('visible');
    }
  });

  it('marks the clones as decorative', () => {
    const elements = buildSlices(source(), RECT, plans);
    for (const element of elements) {
      expect(element.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    }
  });
});

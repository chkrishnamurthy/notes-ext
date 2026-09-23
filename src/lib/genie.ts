/**
 * The genie effect.
 *
 * The browser has no primitive for warping live pixels, so this reproduces the
 * macOS minimise animation the way the effect actually reads to the eye: the
 * panel is cloned into a stack of horizontal slices, and each slice is pulled
 * toward the target point on its own delay. The bottom slices arrive first and
 * the upper ones trail behind, which is what forms the curved neck. A bend
 * keyframe stops the tail from travelling in a straight line.
 *
 * Only `transform` and `opacity` are animated, so the whole thing stays on the
 * compositor. The geometry is pure and lives in `sliceTransforms`, which is
 * unit-tested; the DOM work around it is deliberately thin.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GenieOptions {
  /** How many horizontal slices. More is smoother and more expensive. */
  slices: number;
  /** Total time for one slice to travel, excluding its stagger. */
  duration: number;
  /** Extra time between the first slice starting and the last. */
  stagger: number;
  /**
   * How far the mid-flight control point pulls back toward the panel, as a
   * fraction of the horizontal distance. This is what bends the neck; 0 gives
   * a straight funnel.
   */
  bend: number;
  /** Width a slice collapses to at the target, as a fraction of its own. */
  pinch: number;
}

export const DEFAULT_GENIE: GenieOptions = {
  // Enough slices that the staggered steps read as a curve rather than as
  // stairs. Below roughly 24 the banding is visible at this panel height.
  slices: 32,
  duration: 260,
  stagger: 210,
  bend: 0.45,
  pinch: 0.04,
};

export interface SliceKeyframe {
  /** Horizontal offset from the slice's resting position, in px. */
  dx: number;
  /** Vertical offset from the slice's resting position, in px. */
  dy: number;
  /** Horizontal scale, 1 being full width. */
  sx: number;
  /** Vertical scale, which squeezes slices together as they funnel in. */
  sy: number;
  opacity: number;
}

export interface SlicePlan {
  /** Top edge of this slice within the panel, in px. */
  top: number;
  /** Height of this slice, in px. */
  height: number;
  /** Delay before this slice starts moving, in ms. */
  delay: number;
  /** Resting → bend → collapsed. */
  keyframes: [SliceKeyframe, SliceKeyframe, SliceKeyframe];
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Work out where every slice travels.
 *
 * `t` runs 0 at the top of the panel to 1 at the bottom. The slice nearest the
 * target leaves first, so its delay is smallest — that ordering is the whole
 * illusion. Reversing the delays is what makes the open animation look like
 * the close run backwards rather than a separate effect.
 */
export function sliceTransforms(
  rect: Rect,
  target: Point,
  options: GenieOptions = DEFAULT_GENIE,
): SlicePlan[] {
  const count = Math.max(2, Math.floor(options.slices));
  const sliceHeight = rect.height / count;
  const plans: SlicePlan[] = [];

  for (let index = 0; index < count; index += 1) {
    const top = index * sliceHeight;
    // Centre of the slice, which is the point that travels to the target.
    const centreX = rect.left + rect.width / 2;
    const centreY = rect.top + top + sliceHeight / 2;
    const t = clamp01((index + 0.5) / count);

    const dxEnd = target.x - centreX;
    const dyEnd = target.y - centreY;

    // The bend point sits most of the way along vertically but only part of
    // the way horizontally, so the tail sweeps out instead of cutting across.
    const bendProgress = 0.55;
    const dxBend = dxEnd * bendProgress * (1 - options.bend);
    const dyBend = dyEnd * bendProgress;

    // Slices further from the target are squeezed less at the bend, which
    // keeps the neck narrow at the bottom and wide at the top.
    const pinchBend = 1 - (1 - options.pinch) * bendProgress * (0.4 + 0.6 * t);

    plans.push({
      top,
      height: sliceHeight,
      // Bottom slice (t = 1) leaves immediately; the top one waits longest.
      // Eased rather than linear, so the tail bunches up near the target the
      // way liquid does instead of paying out at a constant rate.
      delay: Math.pow(1 - t, 1.35) * options.stagger,
      keyframes: [
        { dx: 0, dy: 0, sx: 1, sy: 1, opacity: 1 },
        { dx: dxBend, dy: dyBend, sx: pinchBend, sy: 1, opacity: 1 },
        // A sliver rather than zero: scaling to exactly 0 makes Chrome drop
        // the layer early and the tail vanishes a frame too soon.
        { dx: dxEnd, dy: dyEnd, sx: options.pinch, sy: 0.12, opacity: 0.25 },
      ],
    });
  }

  return plans;
}

/** The total wall time of the whole effect, for scheduling the cleanup. */
export function genieDuration(options: GenieOptions = DEFAULT_GENIE): number {
  return options.duration + options.stagger;
}

const toTransform = (frame: SliceKeyframe): string =>
  `translate(${frame.dx.toFixed(2)}px, ${frame.dy.toFixed(2)}px) scale(${frame.sx.toFixed(4)}, ${frame.sy.toFixed(4)})`;

export type GenieDirection = 'in' | 'out';

/**
 * Build the slice elements for one run of the effect.
 *
 * `source` is cloned once per slice. The clones are inert — no listeners, no
 * React — so this costs a single burst of DOM work rather than a re-render,
 * and nothing in the live tree is disturbed.
 */
export function buildSlices(
  source: HTMLElement,
  rect: Rect,
  plans: SlicePlan[],
): HTMLElement[] {
  return plans.map((plan) => {
    const holder = document.createElement('div');
    holder.style.cssText = [
      'position:absolute',
      `left:${rect.left}px`,
      `top:${rect.top + plan.top}px`,
      `width:${rect.width}px`,
      // Taller than the band, so neighbouring slices overlap instead of
      // leaving a seam of the page showing through between them as the
      // stagger pulls them apart.
      `height:${plan.height + 2}px`,
      'overflow:hidden',
      'will-change:transform,opacity',
      'pointer-events:none',
      'backface-visibility:hidden',
      // Bottom centre, so a slice narrows toward its own middle while it falls.
      'transform-origin:50% 100%',
    ].join(';');

    const clone = source.cloneNode(true) as HTMLElement;
    clone.style.position = 'absolute';
    clone.style.left = '0';
    // Shift the clone up so this band of it shows through the holder.
    clone.style.top = `${-plan.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.margin = '0';
    clone.style.visibility = 'visible';
    clone.style.opacity = '1';
    clone.setAttribute('aria-hidden', 'true');

    holder.append(clone);
    return holder;
  });
}

/**
 * Run the effect and resolve when the last slice lands.
 *
 * Direction `out` funnels into the target; `in` plays the same geometry in
 * reverse so opening and closing are recognisably the same motion.
 */
export function animateSlices(
  elements: HTMLElement[],
  plans: SlicePlan[],
  direction: GenieDirection,
  options: GenieOptions = DEFAULT_GENIE,
): Promise<void> {
  const animations = elements.map((element, index) => {
    const plan = plans[index];
    const frames = plan.keyframes.map((frame) => ({
      transform: toTransform(frame),
      opacity: String(frame.opacity),
    }));

    // Opening is the closing path played backwards, and the slice that lands
    // last on the way out is the first to arrive on the way in.
    const keyframes = direction === 'out' ? frames : [...frames].reverse();
    const delay =
      direction === 'out'
        ? plan.delay
        : options.stagger - plan.delay;

    return element.animate(keyframes, {
      duration: options.duration,
      delay,
      // Out accelerates away; in settles gently.
      easing: direction === 'out' ? 'cubic-bezier(.4,0,.9,.4)' : 'cubic-bezier(.16,1,.3,1)',
      fill: 'both',
    });
  });

  return Promise.all(animations.map((animation) => animation.finished))
    .then(() => undefined)
    // A cancelled animation rejects; that is a normal interruption, not an error.
    .catch(() => undefined);
}

/** True when the viewer has asked for less motion. */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

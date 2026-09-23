/**
 * The overlay shell: the notes panel injected into a web page.
 *
 * Three problems have to be solved before the panel can live on someone
 * else's page, and each one is handled here rather than in the UI:
 *
 *  1. **Isolation.** The panel is mounted inside a shadow root, so the host
 *     page's CSS cannot reach in and ours cannot leak out. The stylesheet is
 *     inlined into this bundle rather than fetched, which keeps the strict
 *     content security policy intact.
 *  2. **Stacking.** Host pages use large z-indexes freely, so the container
 *     sits in the top layer where it cannot be out-stacked at all.
 *  3. **Motion.** Opening and closing play the genie effect, from and into
 *     the bottom-right corner.
 */

import { createRoot, type Root } from 'react-dom/client';
import { StrictMode } from 'react';

import { App } from '../sidepanel/App';
import { cornerPoint } from '../lib/corner';
import { overlayHost } from '../lib/host';
import { enterTopLayer, pin, pinShell } from '../lib/shell';
import {
  DEFAULT_GENIE,
  animateSlices,
  buildSlices,
  prefersReducedMotion,
  sliceTransforms,
  type Point,
} from '../lib/genie';

// Inlined at build time: a content script cannot fetch its own stylesheet
// under `connect-src 'none'`, and a <link> would be blocked by many hosts.
import panelCss from '../styles.css?inline';
import overlayCss from './overlay.css?inline';

const HOST_ID = 'for-now-overlay-host';

interface OverlayState {
  host: HTMLElement;
  shadow: ShadowRoot;
  frame: HTMLElement;
  root: Root;
  open: boolean;
  busy: boolean;
}

let state: OverlayState | null = null;

/**
 * The point the panel funnels into: the centre of the quick-open button, so
 * the panel reads as coming out of the thing that was clicked. The same point
 * is used when the button is switched off, where it is simply the corner.
 */
function targetPoint(): Point {
  // `clientWidth`/`clientHeight` rather than `innerWidth`/`innerHeight`: the
  // inner sizes include the scrollbars, and a fixed element is laid out inside
  // them. On a page with a horizontal scrollbar the two differ by about 15px,
  // which is enough for the panel to visibly miss the button it came out of.
  const root = document.documentElement;
  return cornerPoint(
    root.clientWidth || window.innerWidth,
    root.clientHeight || window.innerHeight,
  );
}

/**
 * Tell the quick-open button to get out of the way. It is a separate content
 * script in the same isolated world, so a window event reaches it directly.
 */
function announce(open: boolean): void {
  window.dispatchEvent(new CustomEvent('for-now:overlay', { detail: { open } }));
}

function create(): OverlayState {
  const host = document.createElement('div');
  host.id = HOST_ID;
  // The host lives in the page's DOM, so the page's CSS applies to it. Every
  // declaration goes on as `!important`, which is the only thing an author
  // rule cannot outrank.
  pinShell(host, {
    position: 'fixed',
    inset: '0',
    'z-index': '2147483647',
    'pointer-events': 'none',
  });

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `${panelCss}\n${overlayCss}`;
  shadow.append(style);

  const stage = document.createElement('div');
  stage.className = 'fn-stage';

  const frame = document.createElement('div');
  frame.className = 'fn-frame';
  frame.setAttribute('role', 'dialog');
  frame.setAttribute('aria-modal', 'false');
  frame.setAttribute('aria-label', 'For Now notes');

  const mount = document.createElement('div');
  mount.className = 'fn-mount';
  frame.append(mount);
  stage.append(frame);
  shadow.append(stage);
  document.documentElement.append(host);
  // The top layer is what makes the claim above actually true: it is measured
  // against the viewport, so a page that transforms `<html>` cannot drag the
  // panel off-screen, and no z-index on the page can get above it.
  enterTopLayer(host);

  const root = createRoot(mount);
  root.render(
    <StrictMode>
      <App host={overlayHost(() => void close(), host)} />
    </StrictMode>,
  );

  return { host, shadow, frame, root, open: false, busy: false };
}

/**
 * Play the genie between the frame's resting place and the corner.
 *
 * The live frame is hidden for the duration and a stack of clones does the
 * travelling, so React never re-renders mid-flight and the editor keeps its
 * state and selection.
 */
async function genie(current: OverlayState, direction: 'in' | 'out'): Promise<void> {
  const rect = current.frame.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  if (prefersReducedMotion()) {
    current.frame.style.transition = 'opacity 120ms linear';
    current.frame.style.opacity = direction === 'in' ? '1' : '0';
    await new Promise((resolve) => setTimeout(resolve, 130));
    return;
  }

  const plans = sliceTransforms(
    { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    targetPoint(),
    DEFAULT_GENIE,
  );

  const stage = current.shadow.querySelector('.fn-stage') as HTMLElement;

  // Clone from a visible frame. On the way in the frame is still hidden at
  // this point, and `cloneNode` would copy that inline style onto every slice
  // — giving eighteen invisible clones and no animation at all.
  const hidden = current.frame.style.visibility === 'hidden';
  if (hidden) current.frame.style.visibility = 'visible';
  const slices = buildSlices(current.frame, rect, plans);
  if (hidden) current.frame.style.visibility = 'hidden';
  const layer = document.createElement('div');
  layer.className = 'fn-genie-layer';
  layer.append(...slices);
  stage.append(layer);

  // Hand the pixels over to the clones before the real frame disappears.
  current.frame.style.visibility = 'hidden';

  await animateSlices(slices, plans, direction, DEFAULT_GENIE);

  layer.remove();
  current.frame.style.visibility = direction === 'in' ? 'visible' : 'hidden';
}

export async function open(): Promise<void> {
  if (!state) state = create();
  const current = state;
  if (current.busy || current.open) return;
  current.busy = true;

  pin(current.host, 'pointer-events', 'auto');
  current.frame.style.visibility = 'hidden';
  // Before the animation, not after: the button sits exactly where the genie
  // starts, and would otherwise show through the first few frames.
  announce(true);
  // One frame for React to paint, so the clones copy a laid-out panel rather
  // than an empty box.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  await genie(current, 'in');
  current.frame.style.visibility = 'visible';
  current.open = true;
  current.busy = false;

  // Focus the editor the way opening an app puts you in its window.
  const editable = current.shadow.querySelector('.fn-prose') as HTMLElement | null;
  editable?.focus();
}

export async function close(): Promise<void> {
  const current = state;
  if (!current || current.busy || !current.open) return;
  current.busy = true;

  await genie(current, 'out');
  pin(current.host, 'pointer-events', 'none');
  current.open = false;
  current.busy = false;
  // After, so the button fades back in as the tail arrives rather than
  // sitting under the animation the whole way down.
  announce(false);
}

export async function toggle(): Promise<void> {
  if (state?.open) await close();
  else await open();
}

/** Remove the overlay entirely. Used when the page is going away. */
export function destroy(): void {
  if (!state) return;
  const { root, host } = state;
  state = null;
  announce(false);
  // Unmount asynchronously: React refuses to unmount during its own render.
  setTimeout(() => {
    root.unmount();
    host.remove();
  }, 0);
}

// Clicking outside closes, the way clicking away from a panel would.
document.addEventListener(
  'pointerdown',
  (event) => {
    if (!state?.open || state.busy) return;
    const path = event.composedPath();
    if (!path.includes(state.frame)) void close();
  },
  true,
);

window.addEventListener('pagehide', destroy);

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message?.type === 'toggle-overlay') void toggle();
  return undefined;
});

// Injection is the open gesture: the worker injects on the first click and
// sends `toggle-overlay` on every click after that.
void open();

/**
 * The overlay shell: the notes panel, floated over a web page.
 *
 * The panel itself is not in here. It runs in an iframe of `overlay.html`, an
 * extension page, and this script only provides the window it sits in. That
 * split is the security boundary: anything rendered into the page's own DOM —
 * even inside a shadow root — can be read by the page's scripts, its keystrokes
 * bubble to the page's listeners, and its buttons can be clicked by
 * `element.click()`. A cross-origin frame is the one thing a page cannot see
 * into, so the notes never exist anywhere the page can reach.
 *
 * What this script does handle:
 *
 *  1. **Isolation of the shell.** The frame sits in a *closed* shadow root, so
 *     the page cannot find the iframe or learn its URL, and the page's CSS
 *     cannot reach the chrome around it.
 *  2. **Stacking.** Host pages use large z-indexes freely, so the container
 *     sits in the top layer where it cannot be out-stacked at all.
 *  3. **Size.** The left edge is a drag handle; the width the user picks is
 *     kept in storage and used on every later open, in every tab.
 *  4. **Motion.** Opening and closing play the genie effect, from and into the
 *     bottom-right corner. The slices are cut from an empty panel rather than
 *     the real one — cloning the iframe would load the app once per slice, and
 *     cloning its contents is exactly what the frame exists to prevent.
 */

import { cornerPoint } from '../lib/corner';
import { OVERLAY_CLOSE, OVERLAY_OPENED } from '../lib/host';
import {
  DEFAULT_OVERLAY_WIDTH,
  MAX_OVERLAY_WIDTH,
  MIN_OVERLAY_WIDTH,
  OVERLAY_WIDTH_KEY,
  OVERLAY_WIDTH_STEP,
  clampOverlayWidth,
  parseOverlayWidth,
} from '../lib/overlayWidth';
import { SETTINGS_KEY, parseSettings } from '../lib/schema';
import { enterTopLayer, pin, pinShell } from '../lib/shell';
import { applyTheme } from '../lib/theme';
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
// The panel stylesheet is here for its colour tokens, which the frame's
// border, background and the genie's slices are painted with.
import panelCss from '../styles.css?inline';
import overlayCss from './overlay.css?inline';

const HOST_ID = 'for-now-overlay-host';

/** How long a first open waits for the frame to load before animating anyway. */
const FRAME_LOAD_TIMEOUT_MS = 1500;

interface OverlayState {
  host: HTMLElement;
  shadow: ShadowRoot;
  frame: HTMLElement;
  iframe: HTMLIFrameElement;
  handle: HTMLElement;
  /** The width the user chose, before the viewport cap is applied. */
  width: number;
  /** Resolves once the iframe has loaded, or the wait has timed out. */
  loaded: Promise<void>;
  /** Where focus was on the page before the panel took it. */
  returnFocus: Element | null;
  open: boolean;
  busy: boolean;
}

let state: OverlayState | null = null;

/**
 * The address of the framed panel.
 *
 * `overlay.html` is web-accessible with `use_dynamic_url`, so it answers only
 * on an id that changes every browser session. A page therefore cannot load
 * the panel into a frame of its own to clickjack it, or probe for it to learn
 * the extension is installed.
 */
function frameUrl(): string {
  const dynamicId = (chrome.runtime as typeof chrome.runtime & { dynamicId?: string })
    .dynamicId;
  return dynamicId
    ? `chrome-extension://${dynamicId}/overlay.html`
    : chrome.runtime.getURL('overlay.html');
}

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

/**
 * The frame's border and background follow the appearance settings. The panel
 * inside applies them to its own document; this applies them to the shell
 * around it, so the frame and the genie's slices match the palette.
 */
async function syncTheme(host: HTMLElement): Promise<void> {
  try {
    const record = await chrome.storage.local.get(SETTINGS_KEY);
    applyTheme(parseSettings(record[SETTINGS_KEY]), host);
  } catch {
    // The system theme is a fine fallback for a border colour.
  }
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

  // Closed, so `host.shadowRoot` is null to the page: it cannot find the
  // iframe, and so cannot read the dynamic URL the panel is served from.
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `${panelCss}\n${overlayCss}`;
  shadow.append(style);

  const stage = document.createElement('div');
  stage.className = 'fn-stage';

  const frame = document.createElement('div');
  frame.className = 'fn-frame';

  const iframe = document.createElement('iframe');
  iframe.className = 'fn-iframe';
  iframe.title = 'For Now notes';
  // Copy uses the async clipboard API, which a cross-origin frame only gets
  // when its embedder delegates it.
  iframe.allow = 'clipboard-write';
  const frameLoaded = new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => resolve(), { once: true });
    setTimeout(resolve, FRAME_LOAD_TIMEOUT_MS);
  });
  iframe.src = frameUrl();

  // The left edge, since the window is anchored to the right. It sits inside
  // the frame so that grabbing it counts as a click inside the panel.
  const handle = document.createElement('div');
  handle.className = 'fn-resize';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'vertical');
  handle.setAttribute('aria-label', 'Resize notes panel');
  handle.setAttribute('aria-valuemin', String(MIN_OVERLAY_WIDTH));
  handle.setAttribute('aria-valuemax', String(MAX_OVERLAY_WIDTH));
  handle.title = 'Drag to resize. Double-click to reset.';

  frame.append(iframe, handle);
  stage.append(frame);
  shadow.append(stage);
  document.documentElement.append(host);
  // The top layer is what makes the claim above actually true: it is measured
  // against the viewport, so a page that transforms `<html>` cannot drag the
  // panel off-screen, and no z-index on the page can get above it.
  enterTopLayer(host);

  void syncTheme(host);

  const created: OverlayState = {
    host,
    shadow,
    frame,
    iframe,
    handle,
    width: DEFAULT_OVERLAY_WIDTH,
    // The saved width has to be in place before the genie measures the frame,
    // or the panel would fly in at one size and jump to another.
    loaded: Promise.all([frameLoaded, loadWidth(frame)]).then((results) => {
      created.width = results[1];
    }),
    returnFocus: null,
    open: false,
    busy: false,
  };
  applyWidth(created, DEFAULT_OVERLAY_WIDTH);
  wireResize(created);
  return created;
}

async function loadWidth(frame: HTMLElement): Promise<number> {
  try {
    const record = await chrome.storage.local.get(OVERLAY_WIDTH_KEY);
    const width = parseOverlayWidth(record[OVERLAY_WIDTH_KEY]);
    setFrameWidth(frame, width);
    return width;
  } catch {
    return DEFAULT_OVERLAY_WIDTH;
  }
}

/**
 * The stored width is what the user asked for; the viewport cap is applied on
 * top by CSS, so a narrow window shrinks the panel without forgetting the
 * width to go back to.
 */
function setFrameWidth(frame: HTMLElement, width: number): void {
  frame.style.width = `min(${width}px, calc(100% - 40px))`;
}

function applyWidth(current: OverlayState, width: number): void {
  current.width = clampOverlayWidth(width);
  setFrameWidth(current.frame, current.width);
  current.handle.setAttribute('aria-valuenow', String(current.width));
}

function saveWidth(width: number): void {
  chrome.storage.local.set({ [OVERLAY_WIDTH_KEY]: width }).catch(() => {
    // Losing a window size is not worth telling anyone about.
  });
}

function wireResize(current: OverlayState): void {
  const { handle, frame, iframe } = current;
  let startX = 0;
  let startWidth = 0;
  let dragging = false;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    dragging = true;
    startX = event.clientX;
    // The rendered width, which may be less than the stored one on a narrow
    // viewport; dragging should start from what is on screen.
    startWidth = frame.getBoundingClientRect().width;
    handle.setPointerCapture(event.pointerId);
    // The iframe would otherwise swallow moves that pass over it.
    iframe.style.pointerEvents = 'none';
    frame.classList.add('fn-resizing');
  });

  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    // Anchored on the right, so moving left makes it wider.
    const maxOnScreen = (document.documentElement.clientWidth || window.innerWidth) - 40;
    applyWidth(current, Math.min(startWidth + (startX - event.clientX), maxOnScreen));
  });

  const end = (event: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    iframe.style.pointerEvents = '';
    frame.classList.remove('fn-resizing');
    saveWidth(current.width);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);

  handle.addEventListener('dblclick', () => {
    applyWidth(current, DEFAULT_OVERLAY_WIDTH);
    saveWidth(current.width);
  });

  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? OVERLAY_WIDTH_STEP * 4 : OVERLAY_WIDTH_STEP;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = current.width + step;
    else if (event.key === 'ArrowRight') next = current.width - step;
    else if (event.key === 'Home') next = DEFAULT_OVERLAY_WIDTH;
    if (next === null) return;
    event.preventDefault();
    applyWidth(current, next);
    saveWidth(current.width);
  });
}

/**
 * Play the genie between the frame's resting place and the corner.
 *
 * The live frame is hidden for the duration and a stack of empty panels does
 * the travelling, so the app inside never re-renders mid-flight and the editor
 * keeps its state and selection.
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

  // A shallow copy: the frame's own box — border, background, corners and
  // shadow — without the iframe inside it.
  const ghost = current.frame.cloneNode(false) as HTMLElement;
  ghost.classList.add('fn-ghost');
  const slices = buildSlices(ghost, rect, plans);
  const layer = document.createElement('div');
  layer.className = 'fn-genie-layer';
  layer.append(...slices);
  stage.append(layer);

  // Hand the pixels over to the slices before the real frame disappears.
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
  current.returnFocus = document.activeElement;

  pin(current.host, 'pointer-events', 'auto');
  current.frame.style.visibility = 'hidden';
  // Before the animation, not after: the button sits exactly where the genie
  // starts, and would otherwise show through the first few frames.
  announce(true);
  // On the first open the panel is still loading; landing the genie on a blank
  // frame would look broken, so give it a moment to arrive.
  await current.loaded;

  await genie(current, 'in');
  current.frame.style.visibility = 'visible';
  current.open = true;
  current.busy = false;

  current.iframe.focus();
  // The frame is *addressed* by the dynamic id, but the document inside runs on
  // the extension's real origin, which is what `targetOrigin` is matched to.
  current.iframe.contentWindow?.postMessage(
    { type: OVERLAY_OPENED },
    new URL(chrome.runtime.getURL('')).origin,
  );
}

export async function close(): Promise<void> {
  const current = state;
  if (!current || current.busy || !current.open) return;
  current.busy = true;

  await genie(current, 'out');
  pin(current.host, 'pointer-events', 'none');
  current.open = false;
  current.busy = false;
  restoreFocus(current);
  // After, so the button fades back in as the tail arrives rather than
  // sitting under the animation the whole way down.
  announce(false);
}

/**
 * Give the keyboard back to the page. Without this the hidden frame would keep
 * focus, and the next keys the user typed — meant for the page — would go into
 * a panel they can no longer see.
 */
function restoreFocus(current: OverlayState): void {
  const previous = current.returnFocus;
  current.returnFocus = null;
  window.focus();
  if (previous instanceof HTMLElement && previous.isConnected && previous !== current.host) {
    previous.focus({ preventScroll: true });
  } else {
    (document.activeElement as HTMLElement | null)?.blur?.();
  }
}

export async function toggle(): Promise<void> {
  if (state?.open) await close();
  else await open();
}

/** Remove the overlay entirely. Used when the page is going away. */
export function destroy(): void {
  if (!state) return;
  const { host } = state;
  state = null;
  announce(false);
  host.remove();
}

// Clicking outside closes, the way clicking away from a panel would. Clicks
// inside the iframe never reach this document at all. Clicks on the shell are
// retargeted to the host by the closed shadow root, as are clicks on the empty
// stage around the panel, so position is what tells the two apart.
document.addEventListener(
  'pointerdown',
  (event) => {
    if (!state?.open || state.busy) return;
    const r = state.frame.getBoundingClientRect();
    const inside =
      event.clientX >= r.left &&
      event.clientX <= r.right &&
      event.clientY >= r.top &&
      event.clientY <= r.bottom;
    if (!inside) void close();
  },
  true,
);

// The panel asks to close (its close button, or Escape) by posting to this
// window. The page's own scripts can post here too, so only a message whose
// source is the panel's own frame is believed.
window.addEventListener('message', (event) => {
  if (!state || event.source !== state.iframe.contentWindow) return;
  if ((event.data as { type?: unknown } | null)?.type === OVERLAY_CLOSE) void close();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !state) return;
  if (SETTINGS_KEY in changes) void syncTheme(state.host);
  // A resize in another tab carries over, so every tab's panel is the size the
  // user last chose.
  if (OVERLAY_WIDTH_KEY in changes) {
    const width = parseOverlayWidth(changes[OVERLAY_WIDTH_KEY].newValue);
    if (width !== state.width) applyWidth(state, width);
  }
});

window.addEventListener('pagehide', destroy);

chrome.runtime.onMessage.addListener((message: { type?: string }) => {
  if (message?.type === 'toggle-overlay') void toggle();
  if (message?.type === 'open-overlay') void open();
  return undefined;
});

// Injection is the open gesture: the worker injects on the first click and
// sends `toggle-overlay` on every click after that.
void open();

/**
 * The quick-open button.
 *
 * The toolbar icon is the real way in, but people do not find it: a pinned
 * extension icon is a small grey square among other small grey squares, and an
 * unpinned one is behind a puzzle-piece menu. So this puts a button on the page
 * itself, at the corner the panel genies out of.
 *
 * It is deliberately its own tiny script rather than part of the panel bundle.
 * This one runs on every page the user has allowed, so it carries no framework,
 * no stylesheet and no imports beyond two numbers — the panel's several hundred
 * kilobytes are still only fetched when someone actually opens it.
 *
 * It is registered at runtime and only after the user turns it on in Settings
 * and grants site access, which is why the extension still installs asking for
 * no host permissions at all.
 */

import { LAUNCHER_INSET, LAUNCHER_SIZE } from '../lib/corner';
import { enterTopLayer, pin, pinShell } from '../lib/shell';

const HOST_ID = 'for-now-launcher-host';

/** Sits one below the overlay, so the panel always covers the button. */
const Z_INDEX = 2147483646;

const ICON_SIZE = Math.round(LAUNCHER_SIZE * 0.52);

const CSS = `
  :host { all: initial; }

  button {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 999px;
    background-color: #ffffff;
    /* Resting low so it reads as part of the furniture, not as an ad. */
    opacity: 0.62;
    cursor: pointer;
    transition: opacity 140ms ease, transform 140ms ease, box-shadow 140ms ease;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.12),
      0 6px 16px -4px rgba(0, 0, 0, 0.22);
    -webkit-appearance: none;
    appearance: none;
  }

  button:hover,
  button:focus-visible {
    opacity: 1;
    transform: scale(1.08);
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.14),
      0 10px 22px -4px rgba(0, 0, 0, 0.3);
  }

  button:focus-visible {
    outline: 2px solid #4f46e5;
    outline-offset: 2px;
  }

  button:active { transform: scale(0.94); }

  img {
    width: ${ICON_SIZE}px;
    height: ${ICON_SIZE}px;
    display: block;
    pointer-events: none;
  }

  @media (prefers-color-scheme: dark) {
    button {
      border-color: rgba(255, 255, 255, 0.16);
      background-color: #1f1f23;
    }
  }

  /* Someone who has asked for less motion still gets the hover feedback,
     just without the movement. */
  @media (prefers-reduced-motion: reduce) {
    button { transition: opacity 140ms ease; }
    button:hover, button:focus-visible, button:active { transform: none; }
  }
`;

function mount(): void {
  // Registered with `allFrames: false`, but an ad iframe that re-runs the
  // script would otherwise stack a button per frame.
  if (window.top !== window) return;
  if (!document.body) return;
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  pinShell(host, {
    position: 'fixed',
    right: `${LAUNCHER_INSET}px`,
    bottom: `${LAUNCHER_INSET}px`,
    width: `${LAUNCHER_SIZE}px`,
    height: `${LAUNCHER_SIZE}px`,
    'z-index': String(Z_INDEX),
    'pointer-events': 'auto',
    transition: 'opacity 160ms ease',
  });

  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = CSS;

  const button = document.createElement('button');
  button.type = 'button';
  button.title = 'For Now — open notes (Alt+Shift+N)';
  button.setAttribute('aria-label', 'Open For Now notes');

  const icon = document.createElement('img');
  icon.alt = '';
  icon.src = chrome.runtime.getURL('icons/icon-32.png');
  button.append(icon);

  shadow.append(style, button);
  document.documentElement.append(host);
  // After appending: an element has to be connected before it can be shown.
  enterTopLayer(host);

  button.addEventListener('click', () => {
    try {
      void chrome.runtime.sendMessage({ type: 'launcher-click' }).catch(() => undefined);
    } catch {
      // The extension was reloaded or removed while this page stayed open, so
      // the button can no longer do anything. Take it off the page rather than
      // leaving a control that silently does nothing when clicked.
      host.remove();
    }
  });

  // The panel covers this corner, so the button steps out of the way while the
  // panel is up. The overlay runs in the same isolated world, so a plain
  // window event is enough — no round trip through the worker.
  window.addEventListener('for-now:overlay', (event) => {
    const open = (event as CustomEvent<{ open?: boolean }>).detail?.open === true;
    // Through `pin`, so a page that forces `opacity` cannot pin the button
    // visible over the panel — or invisible when it should be back.
    pin(host, 'opacity', open ? '0' : '1');
    pin(host, 'pointer-events', open ? 'none' : 'auto');
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}

/**
 * The notes panel as the toolbar popup.
 *
 * Chrome forbids extensions from drawing on its own pages — New Tab, Settings,
 * the Web Store and the rest — so the floating overlay cannot appear there.
 * The side panel can, but it docks and squeezes the page. The popup floats
 * over the page like the overlay does, which is why the worker uses it on
 * those pages instead.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { popupHost } from '../lib/host';
import { OVERLAY_WIDTH_KEY, parseOverlayWidth } from '../lib/overlayWidth';
import { applyCachedTheme } from '../lib/theme';
import { App } from '../sidepanel/App';

/** Chrome's hard limits for an action popup. */
const POPUP_MAX_WIDTH = 800;
const POPUP_MAX_HEIGHT = 600;

applyCachedTheme();

/**
 * A popup is as big as its document, so the document asks for a size: the
 * width the user chose by dragging the overlay, capped at what Chrome allows a
 * popup, and the most height Chrome allows. Chrome may still give less — on a
 * small screen it shrinks the popup to fit — so the app itself is sized to the
 * viewport it actually got, and the document never scrolls.
 */
async function sizeToFit(): Promise<void> {
  let width = parseOverlayWidth(undefined);
  try {
    const record = await chrome.storage.local.get(OVERLAY_WIDTH_KEY);
    width = parseOverlayWidth(record[OVERLAY_WIDTH_KEY]);
  } catch {
    // The default width is fine.
  }
  const style = document.documentElement.style;
  style.width = `${Math.min(width, POPUP_MAX_WIDTH)}px`;
  style.height = `${POPUP_MAX_HEIGHT}px`;
  document.body.style.height = '100%';
  document.body.style.margin = '0';
}

/**
 * When Chrome gives the popup less height than it asked for, stop asking for
 * more: a document taller than its popup is a page with a scrollbar down the
 * side, and the whole panel would scroll instead of just the notes list.
 */
function settleHeight(): void {
  const given = window.innerHeight;
  if (given > 0 && given < POPUP_MAX_HEIGHT) {
    document.documentElement.style.height = `${given}px`;
  }
}

// Sized before the first render, so the popup opens at its final size rather
// than growing into it.
void sizeToFit().then(() => {
  requestAnimationFrame(settleHeight);
  window.addEventListener('resize', settleHeight);
  const container = document.getElementById('root');
  if (!container) return;
  createRoot(container).render(
    <StrictMode>
      <App host={popupHost()} />
    </StrictMode>,
  );
  // Opening the popup is the intent to write, as with the overlay. The editor
  // mounts a moment after the app, so look for it for a few frames.
  let tries = 0;
  const focusEditor = () => {
    const editor = document.querySelector('.fn-prose') as HTMLElement | null;
    if (editor) editor.focus();
    else if (++tries < 30) requestAnimationFrame(focusEditor);
  };
  requestAnimationFrame(focusEditor);
});

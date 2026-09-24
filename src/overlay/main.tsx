/**
 * The notes panel as it runs inside the in-page overlay.
 *
 * This is an extension page loaded in an iframe, not a content script. That is
 * the whole point: a cross-origin frame is the one boundary a web page cannot
 * see through, so the page can neither read the notes, nor hear the keys typed
 * into them, nor script clicks on the panel's buttons.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { trapFocus } from '../lib/focusTrap';
import { OVERLAY_OPENED, framedOverlayHost } from '../lib/host';
import { App } from '../sidepanel/App';
import { applyCachedTheme } from '../lib/theme';

// Before the first render, so the page opens in the user's palette rather
// than flashing the default one while settings load.
applyCachedTheme();

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App host={framedOverlayHost()} />
    </StrictMode>,
  );
}

// Tab cycles through the panel instead of escaping into the page behind it,
// where nothing visible would show which element has focus. Escape and a
// click outside still close the panel. The side panel does not need this:
// Chrome moves focus out of it on its own terms.
trapFocus(document);

// The shell says when the panel has finished opening, so the editor takes the
// focus the way opening an app puts you in its window. Only the embedding
// window's messages count; the worst a page could do by forging one is move
// the caret into the notes editor.
window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return;
  if ((event.data as { type?: unknown } | null)?.type !== OVERLAY_OPENED) return;
  (document.querySelector('.fn-prose') as HTMLElement | null)?.focus();
});

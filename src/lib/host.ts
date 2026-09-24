/**
 * The bridge between the notes UI and whichever shell it is running in.
 *
 * The same React app is mounted in three places: the native side panel, an
 * extension page framed inside the overlay a content script puts on a web page,
 * and the toolbar popup used on Chrome's own pages, where no overlay is
 * allowed. All are extension pages with the full `chrome.*` surface; what
 * differs is how they close. The UI must not know or care which, so that goes through
 * here.
 */

/** Sent by the framed panel to the shell around it, asking it to close. */
export const OVERLAY_CLOSE = 'for-now:close';
/** Sent by the shell to the framed panel once it has finished opening. */
export const OVERLAY_OPENED = 'for-now:opened';

export type Surface = 'sidepanel' | 'overlay' | 'popup';

export interface HostBridge {
  surface: Surface;
  /** The element the `data-theme` attribute belongs on for this shell. */
  themeRoot: HTMLElement;
  /** Open a URL in a new browser tab. */
  openTab(url: string): Promise<boolean>;
  /** Open the extension's settings page. */
  openOptions(): Promise<boolean>;
  /** Ask the shell to close. In the overlay this plays the genie out. */
  requestClose(): void;
}

/** Route through the worker, which has the APIs a content script lacks. */
async function askWorker(message: unknown): Promise<boolean> {
  try {
    const reply = (await chrome.runtime.sendMessage(message)) as
      | { ok?: boolean }
      | undefined;
    return reply?.ok === true;
  } catch {
    return false;
  }
}

export function sidePanelHost(): HostBridge {
  return {
    surface: 'sidepanel',
    themeRoot: document.documentElement,
    async openTab(url) {
      try {
        await chrome.tabs.create({ url });
        return true;
      } catch {
        return askWorker({ type: 'open-tab', url });
      }
    },
    async openOptions() {
      try {
        await chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
        return true;
      } catch {
        // `openOptionsPage` can resolve from a side panel without showing
        // anything, so it is the fallback rather than the first choice.
        try {
          chrome.runtime.openOptionsPage();
          return true;
        } catch {
          return false;
        }
      }
    },
    requestClose() {
      const api = chrome.sidePanel as typeof chrome.sidePanel & {
        close?: () => Promise<void>;
      };
      if (typeof api.close === 'function') {
        api.close().catch(() => window.close());
        return;
      }
      window.close();
    },
  };
}

/**
 * The panel inside the overlay's iframe. Opening tabs works exactly as it does
 * in the side panel; closing is the shell's job, since only it can play the
 * genie, so the frame asks its parent.
 */
export function framedOverlayHost(): HostBridge {
  const base = sidePanelHost();
  return {
    surface: 'overlay',
    themeRoot: document.documentElement,
    openTab: base.openTab,
    openOptions: base.openOptions,
    requestClose() {
      // The message carries nothing private, so it does not matter that the
      // page's own scripts can see it too. The shell checks it came from this
      // frame before acting on it.
      window.parent.postMessage({ type: OVERLAY_CLOSE }, '*');
    },
  };
}

/**
 * The panel as the toolbar popup, shown on Chrome's own pages (New Tab,
 * Settings, the Web Store…) where Chrome allows no overlay. It floats over the
 * page instead of docking beside it. Unlike the overlay, Chrome closes it on a
 * click outside, and there is no way to ask it not to. Closing it from inside
 * is simply closing the page.
 */
export function popupHost(): HostBridge {
  const base = sidePanelHost();
  return {
    surface: 'popup',
    themeRoot: document.documentElement,
    openTab: base.openTab,
    openOptions: base.openOptions,
    requestClose() {
      window.close();
    },
  };
}

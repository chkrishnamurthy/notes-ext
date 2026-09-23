/**
 * The bridge between the notes UI and whichever shell it is running in.
 *
 * The same React app is mounted in two places: the native side panel (an
 * extension page, with the full `chrome.*` surface) and an overlay injected
 * into a web page (a content script, where `chrome.tabs` does not exist). The
 * UI must not know or care which, so everything that differs goes through
 * here, and anything a content script cannot call is routed to the service
 * worker instead.
 */

export type Surface = 'sidepanel' | 'overlay';

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

export function overlayHost(close: () => void, themeRoot: HTMLElement): HostBridge {
  return {
    surface: 'overlay',
    themeRoot,
    // A content script has no `chrome.tabs`, so both of these are the worker's
    // job. Opening a tab from here would otherwise silently do nothing.
    openTab: (url) => askWorker({ type: 'open-tab', url }),
    openOptions: () => askWorker({ type: 'open-options' }),
    requestClose: close,
  };
}

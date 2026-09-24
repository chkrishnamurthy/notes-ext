/**
 * Event-driven service worker.
 *
 * Chrome terminates idle extension workers, so this file holds no durable
 * state: every handler re-reads what it needs from storage. Its jobs are
 * registering the context menus, turning capture events into notes, opening
 * the panel, and running migrations and the Trash purge on start-up.
 */

import {
  captureFrom,
  MAX_CAPTURE_LENGTH,
  MENU_LINK,
  MENU_PAGE,
  MENU_SELECTION,
} from '../lib/capture';
import { canInject } from '../lib/inject';
import { broadcast, type ExtensionMessage } from '../lib/messages';
import { createNote, purgeExpiredTrash } from '../lib/notes';
import { runMigrations } from '../lib/migrations';
import { sanitizeUrl } from '../lib/schema';
import { chromeLocalArea, NoteStore } from '../lib/storage';

const area = chromeLocalArea();
const store = new NoteStore(area);

function registerMenus(): void {
  // removeAll first so a reload or update never leaves duplicates behind.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SELECTION,
      title: 'Save selection to For Now',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: MENU_LINK,
      title: 'Save link to For Now',
      contexts: ['link'],
    });
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: 'Save this page to For Now',
      contexts: ['page'],
    });
    // Reported here rather than thrown: a failed menu registration should not
    // take down the rest of the worker's start-up.
    if (chrome.runtime.lastError) {
      console.warn('For Now: could not register context menus.');
    }
  });
}

/**
 * The toolbar click has to reach `action.onClicked` so the overlay can be
 * injected, which it will not do while Chrome is set to open the side panel
 * for us. The side panel is still registered — it is the last resort when
 * neither the overlay nor the popup can be shown.
 */
function configurePanel(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => undefined);
}

/**
 * Show the notes panel for this tab.
 *
 * The first click injects the overlay, which opens itself; later clicks find
 * a listener already there and toggle it. `activeTab` grants the host access
 * this needs, and only for the tab the user just clicked on — which is why
 * the extension still asks for no host permissions.
 */
async function showPanel(
  tab: chrome.tabs.Tab,
  mode: 'toggle' | 'open' = 'toggle',
): Promise<void> {
  if (!canInject(tab.url) || tab.id === undefined) {
    openPopup(tab);
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: mode === 'open' ? 'open-overlay' : 'toggle-overlay',
    });
    return;
  } catch {
    // No listener yet, so this is the first click on this page.
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
  } catch {
    // Injection is refused on the Web Store and other protected origins even
    // when the URL looks ordinary. Fall back rather than doing nothing.
    openPopup(tab);
  }
}

/** The notes panel as a toolbar popup; see src/popup/main.tsx. */
const POPUP_PAGE = 'popup.html';

/**
 * Show the panel as the toolbar popup, for pages Chrome allows no overlay on.
 *
 * The popup is attached to this tab only for as long as it takes to open it,
 * then detached again. Left attached, Chrome would open the popup itself on
 * the next click and `action.onClicked` would never fire — including after the
 * tab moves on to an ordinary web page, where the overlay belongs. The worker
 * cannot see tab addresses ahead of a click, so it cannot keep a per-tab
 * popup in step with navigation; attaching it at the moment of the click
 * sidesteps that.
 *
 * Neither call is awaited before the next: `openPopup` must run while the
 * click still counts as a user gesture, and Chrome applies the two in order.
 * If the popup cannot open — no focused window, say — the side panel is
 * tried, which is the one other surface allowed on these pages.
 */
function openPopup(tab: chrome.tabs.Tab): void {
  const { id: tabId, windowId } = tab;
  if (tabId === undefined) {
    if (windowId !== undefined) chrome.sidePanel.open({ windowId }).catch(() => undefined);
    return;
  }
  const attached = chrome.action.setPopup({ tabId, popup: POPUP_PAGE });
  chrome.action
    .openPopup(windowId !== undefined ? { windowId } : {})
    .catch(() => (windowId !== undefined ? chrome.sidePanel.open({ windowId }) : undefined))
    .catch(() => undefined)
    .finally(() => {
      void attached
        .then(() => chrome.action.setPopup({ tabId, popup: '' }))
        .catch(() => undefined);
    });
}

/**
 * The quick-open button is registered at runtime rather than declared in the
 * manifest.
 *
 * Declaring it would mean asking for access to every website at install time,
 * which is the single thing most likely to make someone close the install
 * prompt. So the manifest asks for nothing, and this registers the script only
 * once the user has both turned the button on and granted the access — and
 * unregisters it the moment either of those stops being true.
 */
const LAUNCHER_SCRIPT_ID = 'for-now-launcher';
const LAUNCHER_ORIGINS = ['<all_urls>'];

async function hasSiteAccess(): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: LAUNCHER_ORIGINS });
  } catch {
    return false;
  }
}

async function launcherRegistered(): Promise<boolean> {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    return scripts.some((script) => script.id === LAUNCHER_SCRIPT_ID);
  } catch {
    return false;
  }
}

/** Bring the registered script into line with the setting and the permission. */
async function syncLauncher(): Promise<void> {
  let wanted = false;
  try {
    const settings = await store.getSettings();
    wanted = settings.showLauncher && (await hasSiteAccess());
  } catch {
    // Unreadable settings mean the button stays off. Failing closed is the
    // only safe direction for something that runs on every page.
    wanted = false;
  }

  const registered = await launcherRegistered();
  if (wanted === registered) return;

  try {
    if (wanted) {
      await chrome.scripting.registerContentScripts([
        {
          id: LAUNCHER_SCRIPT_ID,
          js: ['launcher.js'],
          matches: LAUNCHER_ORIGINS,
          runAt: 'document_idle',
          // One button per page, not one per advertising iframe.
          allFrames: false,
          persistAcrossSessions: true,
        },
      ]);
    } else {
      await chrome.scripting.unregisterContentScripts({ ids: [LAUNCHER_SCRIPT_ID] });
    }
  } catch {
    // Registration is best-effort: the toolbar icon and the keyboard shortcut
    // both still open the panel without it.
  }
}

/**
 * A registered content script only runs on pages loaded after it is
 * registered, so switching the button on would otherwise appear to do nothing
 * until every open tab had been reloaded. Inject it into the tabs already
 * open instead; the script itself refuses to mount twice.
 */
async function injectLauncherIntoOpenTabs(): Promise<void> {
  let tabs: chrome.tabs.Tab[] = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }

  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined || !canInject(tab.url)) return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['launcher.js'],
        });
      } catch {
        // A tab that refuses injection just does not get a button.
      }
    }),
  );
}

/** Take every button off the pages that are open right now. */
async function removeLauncherFromOpenTabs(): Promise<void> {
  let tabs: chrome.tabs.Tab[] = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }

  await Promise.all(
    tabs.map(async (tab) => {
      if (tab.id === undefined || !canInject(tab.url)) return;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => document.getElementById('for-now-launcher-host')?.remove(),
        });
      } catch {
        // Nothing to clean up on a tab we cannot reach.
      }
    }),
  );
}

async function startup(): Promise<void> {
  configurePanel();
  registerMenus();
  void syncLauncher();
  try {
    await runMigrations(store, { get: (keys) => area.get(keys) });
    const settings = await store.getSettings();
    await purgeExpiredTrash(store, settings.trashRetentionDays);
  } catch {
    // Start-up maintenance is best-effort. Failing it must never block the
    // user from opening the panel and reading their notes.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void startup();
});

chrome.runtime.onStartup.addListener(() => {
  void startup();
});

/**
 * Read the selection the user right-clicked as rich text, keeping its links,
 * emphasis, lists and code — or null, in which case the plain text from the
 * menu payload is used exactly as before.
 *
 * The click's `activeTab` grant is what allows the injection. The result is
 * sanitized inside the page (see `lib/selection.ts`), and checked for shape
 * here, since it crossed from a renderer the page shares.
 */
async function readRichSelection(
  tab: chrome.tabs.Tab | undefined,
  frameId: number | undefined,
): Promise<{ html: string; text: string } | null> {
  if (!tab || tab.id === undefined || !canInject(tab.url)) return null;
  const target = { tabId: tab.id, frameIds: [frameId ?? 0] };
  try {
    await chrome.scripting.executeScript({ target, files: ['capture.js'] });
    const [injection] = await chrome.scripting.executeScript({
      target,
      func: () =>
        (globalThis as typeof globalThis & { __forNowReadSelection?: () => unknown })
          .__forNowReadSelection?.() ?? null,
    });
    const value = injection?.result as { html?: unknown; text?: unknown } | null | undefined;
    if (
      !value ||
      typeof value.html !== 'string' ||
      typeof value.text !== 'string' ||
      value.text.length > MAX_CAPTURE_LENGTH
    ) {
      return null;
    }
    return { html: value.html, text: value.text };
  } catch {
    // A frame the grant does not cover, or a page that refuses injection.
    return null;
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Show the capture landing in the same place a toolbar click opens: the
  // overlay where the page allows one, the popup where it does not. The popup
  // may only be opened synchronously, before the first await, while the click
  // still counts as a user gesture. The overlay needs no gesture, and is
  // opened below once the selection has been read.
  const overlay = tab !== undefined && tab.id !== undefined && canInject(tab.url);
  if (!overlay && tab) openPopup(tab);

  void (async () => {
    let input = captureFrom(info, tab);
    if (input?.kind === 'selection') {
      const rich = await readRichSelection(tab, info.frameId);
      if (rich) input = { ...input, html: rich.html, text: rich.text };
    }
    // After the selection is read: opening the overlay moves focus into it.
    // Opened rather than toggled, so a second save never closes it.
    if (overlay && tab) void showPanel(tab, 'open');

    if (!input) {
      broadcast({
        type: 'capture-failed',
        message: 'There was nothing to save from that click.',
      });
      return;
    }

    const result = await createNote(store, input);
    if (result.ok) {
      broadcast({ type: 'capture-saved', note: result.value });
      return;
    }
    broadcast({
      type: 'capture-failed',
      message:
        result.reason === 'quota'
          ? 'Not saved — this device is out of space for notes. Export a backup and clear some notes.'
          : `Not saved — ${result.message}`,
    });
  })();
});

chrome.action.onClicked.addListener((tab) => {
  void showPanel(tab);
});

// Site access can also be revoked from Chrome's own extension page, entirely
// outside this extension. When that happens the setting is turned off too, so
// the options page never claims a button is showing when it cannot be.
chrome.permissions.onRemoved.addListener(() => {
  void (async () => {
    if (await hasSiteAccess()) return;
    const settings = await store.getSettings();
    if (settings.showLauncher) {
      await store.setSettings({ ...settings, showLauncher: false });
    }
    await syncLauncher();
  })();
});

chrome.permissions.onAdded.addListener(() => {
  void syncLauncher();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'open-panel') return;
  if (tab) {
    void showPanel(tab);
    return;
  }
  // A command can fire without a tab; the side panel still works from here.
  chrome.sidePanel
    .open({ windowId: chrome.windows.WINDOW_ID_CURRENT })
    .catch(() => undefined);
});

/** True for a message from one of this extension's own pages. */
function fromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return sender.url?.startsWith(chrome.runtime.getURL('')) === true;
}

/**
 * Requests from other parts of the extension. The listener returns true so
 * the async reply is not dropped.
 *
 * A content script runs inside a web page's renderer, so a compromised page
 * could send anything a content script can. The one thing a content script
 * has reason to ask for is the quick-open click; everything else is accepted
 * only from the extension's own pages.
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, respond) => {
  if (message?.type === 'launcher-click') {
    // `sender.tab` is the page the button lives on, which is the tab the panel
    // belongs to — the same path a toolbar click takes from here on.
    if (sender.tab) void showPanel(sender.tab);
    respond({ ok: true });
    return false;
  }
  if (!fromExtensionPage(sender)) return undefined;

  if (message?.type === 'open-tab') {
    // Only the kinds of address a note can hold: no `javascript:`, no
    // `chrome://`, no extension pages.
    const url = sanitizeUrl(message.url);
    if (!url) {
      respond({ ok: false });
      return false;
    }
    chrome.tabs
      .create({ url })
      .then(() => respond({ ok: true }))
      .catch(() => respond({ ok: false }));
    return true;
  }
  if (message?.type === 'launcher-changed') {
    void (async () => {
      await syncLauncher();
      const settings = await store.getSettings();
      if (settings.showLauncher && (await hasSiteAccess())) {
        await injectLauncherIntoOpenTabs();
      } else {
        await removeLauncherFromOpenTabs();
      }
      respond({ ok: true });
    })();
    return true;
  }
  return undefined;
});

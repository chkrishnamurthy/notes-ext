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
  MENU_LINK,
  MENU_PAGE,
  MENU_SELECTION,
} from '../lib/capture';
import { canInject } from '../lib/inject';
import { broadcast, type ExtensionMessage } from '../lib/messages';
import { createNote, purgeExpiredTrash } from '../lib/notes';
import { runMigrations } from '../lib/migrations';
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
 * for us. The side panel is still registered — it is the fallback for pages a
 * content script cannot touch.
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
async function showPanel(tab: chrome.tabs.Tab): Promise<void> {
  const windowId = tab.windowId;

  if (!canInject(tab.url) || tab.id === undefined) {
    if (windowId !== undefined) {
      chrome.sidePanel.open({ windowId }).catch(() => undefined);
    }
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'toggle-overlay' });
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
    if (windowId !== undefined) {
      chrome.sidePanel.open({ windowId }).catch(() => undefined);
    }
  }
}

async function startup(): Promise<void> {
  configurePanel();
  registerMenus();
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

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // A menu click is a user gesture, so the panel may be opened from inside
  // this handler — but only synchronously, before the first await.
  if (tab?.windowId !== undefined) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => undefined);
  }

  void (async () => {
    const input = captureFrom(info, tab);
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

/**
 * Requests from the overlay for things a content script cannot do itself.
 * The listener returns true so the async reply is not dropped.
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, respond) => {
  if (message?.type === 'open-tab') {
    chrome.tabs
      .create({ url: message.url })
      .then(() => respond({ ok: true }))
      .catch(() => respond({ ok: false }));
    return true;
  }
  if (message?.type === 'open-options') {
    chrome.tabs
      .create({ url: chrome.runtime.getURL('options.html') })
      .then(() => respond({ ok: true }))
      .catch(() => respond({ ok: false }));
    return true;
  }
  return undefined;
});

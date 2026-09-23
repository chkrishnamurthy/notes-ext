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
import { broadcast } from '../lib/messages';
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

/** Opening on the toolbar click is the documented way to avoid a popup. */
function configurePanel(): void {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);
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

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'open-panel') return;
  // Also a user gesture, so sidePanel.open is permitted here.
  const windowId = tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
  chrome.sidePanel.open({ windowId }).catch(() => undefined);
});

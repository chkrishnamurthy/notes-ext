/**
 * Messages between the service worker, the panels and the content scripts.
 *
 * The worker never holds UI state; it writes to storage and then tells any
 * open panel what just happened so the panel can confirm it to the user.
 */

import type { Note } from './schema';

export interface CaptureSavedMessage {
  type: 'capture-saved';
  note: Note;
  /** The selection was longer than a capture keeps, so the note ends early. */
  truncated?: boolean;
}

export interface CaptureFailedMessage {
  type: 'capture-failed';
  message: string;
}

/**
 * Asks the worker to open a tab: the side panel's fallback when it cannot
 * call `chrome.tabs` itself.
 */
export interface OpenTabMessage {
  type: 'open-tab';
  url: string;
}

/** Sent to a tab to toggle an overlay that is already injected. */
export interface ToggleOverlayMessage {
  type: 'toggle-overlay';
}

/** Sent to a tab to open its overlay, leaving it be if it is already open. */
export interface OpenOverlayMessage {
  type: 'open-overlay';
}

/** The quick-open button on a page was clicked. */
export interface LauncherClickMessage {
  type: 'launcher-click';
}

/**
 * The quick-open setting was changed on the options page. The worker has to
 * register or unregister the content script itself, since the options page
 * cannot reach other tabs.
 */
export interface LauncherChangedMessage {
  type: 'launcher-changed';
}

/**
 * The overlay mounted but its panel never loaded — the page's own policy
 * forbids framing it. The worker shows the popup instead.
 */
export interface OverlayUnavailableMessage {
  type: 'overlay-unavailable';
}

export type ExtensionMessage =
  | CaptureSavedMessage
  | CaptureFailedMessage
  | OpenTabMessage
  | ToggleOverlayMessage
  | OpenOverlayMessage
  | LauncherClickMessage
  | OverlayUnavailableMessage
  | LauncherChangedMessage;

/**
 * Broadcast to whichever panel happens to be open. No receiver is the normal
 * case, so the "no listener" rejection is swallowed rather than logged.
 */
export function broadcast(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

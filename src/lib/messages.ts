/**
 * Messages between the service worker and the side panel.
 *
 * The worker never holds UI state; it writes to storage and then tells any
 * open panel what just happened so the panel can confirm it to the user.
 */

import type { Note } from './schema';

export interface CaptureSavedMessage {
  type: 'capture-saved';
  note: Note;
}

export interface CaptureFailedMessage {
  type: 'capture-failed';
  message: string;
}

/** Asks the worker to open a tab, which a content script cannot do itself. */
export interface OpenTabMessage {
  type: 'open-tab';
  url: string;
}

export interface OpenOptionsMessage {
  type: 'open-options';
}

/** Sent to a tab to toggle an overlay that is already injected. */
export interface ToggleOverlayMessage {
  type: 'toggle-overlay';
}

export type ExtensionMessage =
  | CaptureSavedMessage
  | CaptureFailedMessage
  | OpenTabMessage
  | OpenOptionsMessage
  | ToggleOverlayMessage;

/**
 * Broadcast to whichever panel happens to be open. No receiver is the normal
 * case, so the "no listener" rejection is swallowed rather than logged.
 */
export function broadcast(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

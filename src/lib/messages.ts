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

export type ExtensionMessage = CaptureSavedMessage | CaptureFailedMessage;

/**
 * Broadcast to whichever panel happens to be open. No receiver is the normal
 * case, so the "no listener" rejection is swallowed rather than logged.
 */
export function broadcast(message: ExtensionMessage): void {
  chrome.runtime.sendMessage(message).catch(() => undefined);
}

/** The panel's single store instance, bound to chrome.storage.local. */
import { chromeLocalArea, NoteStore } from '../lib/storage';

export const store = new NoteStore(chromeLocalArea());

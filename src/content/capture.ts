/**
 * Reads the page's selection as rich text, for "Save selection to Holdpad".
 *
 * Injected by the service worker on the context-menu click, under the
 * `activeTab` grant that click creates. It only defines a function; the worker
 * calls it in a second step and gets the result back, since a script injected
 * as a file has no clean way to return a value.
 *
 * Kept as its own small bundle, like the launcher, so a capture does not load
 * the whole panel into the page.
 */

import { MAX_CAPTURE_LENGTH } from '../lib/capture';
import { serializeSelection } from '../lib/selection';

(globalThis as typeof globalThis & { __forNowReadSelection?: () => unknown }).__forNowReadSelection =
  () => serializeSelection(window.getSelection(), document.baseURI, MAX_CAPTURE_LENGTH);

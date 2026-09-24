/**
 * UI strings, through `chrome.i18n`.
 *
 * Every user-facing string lives in `public/_locales/<locale>/messages.json`,
 * and Chrome picks the locale from the browser's UI language, falling back to
 * English. `chrome.i18n` works the same in every context this extension runs
 * in — the panel, the options page, the service worker and the content
 * scripts — so there is one way to get a string everywhere.
 *
 * Nothing here imports the catalogue itself. The quick-open button runs on
 * every page load and has to stay tiny, so it must not carry a copy of every
 * string; the unit tests install an English `chrome.i18n` instead.
 */

import type catalogue from '../public/_locales/en/messages.json';

export type MessageKey = keyof typeof catalogue;

/**
 * The string for `key`, with `$1`…`$9` replaced by `subs`. A missing key
 * comes back as the key itself, so a gap is visible rather than blank.
 */
export function t(key: MessageKey, ...subs: Array<string | number>): string {
  const message = chrome.i18n.getMessage(key, subs.map(String));
  return message || key;
}

/**
 * Chrome's messages have no plural forms, so each counted string comes as a
 * pair: `one` for exactly one, with the number written into the message and
 * `subs` as `$1` onwards; `other` for everything else, with the count as `$1`
 * and `subs` from `$2`. Every language shipped so far fits that split, or
 * needs only one form.
 */
export function plural(
  count: number,
  one: MessageKey,
  other: MessageKey,
  ...subs: Array<string | number>
): string {
  return count === 1 ? t(one, ...subs) : t(other, count, ...subs);
}

/**
 * Mark the page with the language its strings are in, so a screen reader
 * pronounces them properly and the browser picks the right fonts and quotes.
 */
export function applyLanguage(doc: Document = document): void {
  try {
    doc.documentElement.lang = chrome.i18n.getUILanguage();
  } catch {
    // Outside the extension there is no language to report; `en` stands.
  }
}

/**
 * A message with things that are not text in it — a bold phrase, a code
 * span, a link — returned as pieces to render in order, so a translation can
 * move them wherever its grammar puts them. `parts` fill `$1`, `$2`… Give
 * each element part a `key`.
 */
export function tParts<T>(key: MessageKey, ...parts: T[]): Array<string | T> {
  const marks = parts.map((_, index) => `\u0001${index}\u0001`);
  return t(key, ...marks)
    .split(/\u0001(\d)\u0001/)
    .map((piece, index) => (index % 2 === 1 ? parts[Number(piece)] : piece))
    .filter((piece) => piece !== '');
}

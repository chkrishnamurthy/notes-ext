/**
 * An English `chrome.i18n` for the unit tests, answering from the real
 * catalogue the way Chrome does: `$1`…`$9` replaced, unknown keys empty.
 */
import catalogue from '../src/public/_locales/en/messages.json';

const messages = catalogue as Record<string, { message: string }>;

export function getMessage(key: string, subs: string | string[] = []): string {
  const list = Array.isArray(subs) ? subs : [subs];
  const entry = messages[key];
  if (!entry) return '';
  return entry.message.replace(/\$([1-9])/g, (_, n: string) => list[Number(n) - 1] ?? '');
}

const g = globalThis as unknown as { chrome?: Record<string, unknown> };
g.chrome = {
  ...g.chrome,
  i18n: { getMessage, getUILanguage: () => 'en' },
};

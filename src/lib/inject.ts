/**
 * Which pages the overlay can be injected into.
 *
 * Chrome refuses to run a content script on its own pages, the Web Store, and
 * a handful of other protected origins. Rather than letting the click do
 * nothing there, the worker checks this first and falls back to the native
 * side panel — which is why the side panel is still registered even though the
 * overlay is the everyday surface.
 */

/** Origins Chrome blocks even when the URL otherwise looks ordinary. */
const BLOCKED_HOSTS = [
  'chromewebstore.google.com',
  'chrome.google.com',
];

export function canInject(url: string | undefined): boolean {
  if (!url) return false;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  // `file:` works, but only when the user has granted file access; the caller
  // treats a refused injection the same as a blocked page either way.
  if (!['http:', 'https:', 'file:'].includes(parsed.protocol)) return false;
  if (BLOCKED_HOSTS.includes(parsed.hostname)) return false;

  return true;
}

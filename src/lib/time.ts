/** Relative time and grouping labels for the notes list. */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function dayOffset(timestamp: number, now = Date.now()): number {
  return Math.round((startOfDay(now) - startOfDay(timestamp)) / (24 * HOUR));
}

export type NoteGroup = 'Pinned' | 'Today' | 'Yesterday' | 'Earlier';

export function groupFor(timestamp: number, pinned: boolean, now = Date.now()): NoteGroup {
  if (pinned) return 'Pinned';
  const offset = dayOffset(timestamp, now);
  if (offset <= 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  return 'Earlier';
}

const timeOfDay = (timestamp: number): string =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

/** "Just now", "Today · 9:12 AM", "Yesterday · 5:30 PM", "12 Sept · 9:12 AM". */
export function formatTimestamp(timestamp: number, now = Date.now()): string {
  const elapsed = now - timestamp;
  if (elapsed >= 0 && elapsed < MINUTE) return 'Just now';

  const offset = dayOffset(timestamp, now);
  if (offset <= 0) return `Today · ${timeOfDay(timestamp)}`;
  if (offset === 1) return `Yesterday · ${timeOfDay(timestamp)}`;

  const date = new Date(timestamp).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(offset > 300 ? { year: 'numeric' } : {}),
  });
  return `${date} · ${timeOfDay(timestamp)}`;
}

/** "example.edu / learning / recall" — a URL a person can read at a glance. */
export function formatUrl(url: string, maxSegments = 3): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return host;
  const shown = segments.slice(0, maxSegments);
  const suffix = segments.length > maxSegments ? ' / …' : '';
  return `${host} / ${shown.join(' / ')}${suffix}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

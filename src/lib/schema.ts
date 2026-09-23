import { stripTagsFallback, textToHtml } from './richtext';

/**
 * Data model and schema versioning for For Now.
 *
 * Every persisted note carries its own `schemaVersion` and `rev`. The version
 * lets migrations run per-record without rewriting the whole store; the
 * revision lets a write detect that another window changed the note first
 * (see storage.ts) instead of silently overwriting it.
 */

/** Bump whenever the shape of a persisted record changes, and add a migration. */
export const SCHEMA_VERSION = 2;

/** Where a note came from. Determines which source metadata is meaningful. */
export type CaptureKind = 'thought' | 'selection' | 'link' | 'page';

export interface Note {
  /** Stable, never reused. */
  id: string;
  /**
   * The note body as rich HTML, always sanitized before it is stored or
   * rendered. Formatting lives here.
   */
  html: string;
  /**
   * The plain-text projection of `html`, kept alongside it rather than derived
   * on demand. Search, snippets, the list view and Copy all read this, none of
   * which should have to parse HTML, and the service worker cannot.
   */
  text: string;
  kind: CaptureKind;
  /**
   * For `link` captures only: the URL the link pointed at. Kept separate from
   * `sourceUrl` so "the page I was on" and "the thing I saved" never merge.
   */
  targetUrl?: string;
  /** The page the capture was made from, for explicit web captures. */
  sourceUrl?: string;
  sourceTitle?: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  /** Set when the note is in Trash. Absent means active. */
  deletedAt?: number;
  /** Incremented on every committed write. Used for stale-edit detection. */
  rev: number;
  schemaVersion: number;
}

/** An uncommitted composer draft. Survives closing the panel. */
export interface Draft {
  html: string;
  text: string;
  /** Set when the draft is an in-progress edit of an existing note. */
  editingId?: string;
  /** The rev the edit started from, so a stale edit can be detected. */
  editingRev?: number;
  updatedAt: number;
}

export type ThemePreference = 'system' | 'light' | 'dark';

export interface Settings {
  theme: ThemePreference;
  /** Days a note stays recoverable in Trash before it is purged. */
  trashRetentionDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  trashRetentionDays: 30,
};

export const EMPTY_DRAFT: Draft = { html: '', text: '', updatedAt: 0 };

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

/** Notes live under one key each so a write never rewrites the whole set. */
export const NOTE_PREFIX = 'note:';
export const META_KEY = 'meta';
export const DRAFT_KEY = 'draft';
export const SETTINGS_KEY = 'settings';

export const noteKey = (id: string): string => `${NOTE_PREFIX}${id}`;
export const isNoteKey = (key: string): boolean => key.startsWith(NOTE_PREFIX);

export interface StoreMeta {
  schemaVersion: number;
  /** Set once, on first install. Purely informational. */
  installedAt?: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const KINDS: readonly CaptureKind[] = ['thought', 'selection', 'link', 'page'];

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * Only http(s) and mailto survive. Anything else — `javascript:`, `data:`,
 * extension-internal schemes — is dropped rather than stored and later
 * rendered as a clickable link.
 */
export function sanitizeUrl(value: unknown): string | undefined {
  const raw = str(value);
  if (!raw) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return undefined;
  }
  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return undefined;
  return parsed.toString();
}

/**
 * Coerce an untrusted record (an import file, or a record written by an older
 * version) into a Note, or return null if it cannot be salvaged. Never throws.
 */
export function parseNote(value: unknown, now = Date.now()): Note | null {
  if (!isPlainObject(value)) return null;

  const id = str(value.id);
  if (!id) return null;

  // A v1 record that has not been migrated yet still parses, so a read never
  // loses a note just because the migration has not run.
  const html =
    typeof value.html === 'string'
      ? value.html
      : typeof value.body === 'string'
        ? textToHtml(value.body)
        : null;
  if (html === null) return null;

  const text =
    typeof value.text === 'string'
      ? value.text
      : typeof value.body === 'string'
        ? value.body
        : stripTagsFallback(html);

  const createdAt = num(value.createdAt, now);
  const kind = KINDS.includes(value.kind as CaptureKind)
    ? (value.kind as CaptureKind)
    : 'thought';

  const note: Note = {
    id,
    html,
    text,
    kind,
    createdAt,
    updatedAt: num(value.updatedAt, createdAt),
    pinned: value.pinned === true,
    rev: Math.max(1, Math.floor(num(value.rev, 1))),
    schemaVersion: SCHEMA_VERSION,
  };

  const targetUrl = sanitizeUrl(value.targetUrl);
  if (targetUrl) note.targetUrl = targetUrl;
  const sourceUrl = sanitizeUrl(value.sourceUrl);
  if (sourceUrl) note.sourceUrl = sourceUrl;
  const sourceTitle = str(value.sourceTitle);
  if (sourceTitle) note.sourceTitle = sourceTitle;
  if (typeof value.deletedAt === 'number' && Number.isFinite(value.deletedAt)) {
    note.deletedAt = value.deletedAt;
  }

  return note;
}

export function parseDraft(value: unknown): Draft {
  if (!isPlainObject(value)) return { ...EMPTY_DRAFT };
  const html = typeof value.html === 'string' ? value.html : '';
  return {
    html,
    text:
      typeof value.text === 'string' ? value.text : stripTagsFallback(html),
    editingId: str(value.editingId),
    editingRev:
      typeof value.editingRev === 'number' ? value.editingRev : undefined,
    updatedAt: num(value.updatedAt, 0),
  };
}

export function parseSettings(value: unknown): Settings {
  if (!isPlainObject(value)) return { ...DEFAULT_SETTINGS };
  const theme = value.theme;
  const days = num(value.trashRetentionDays, DEFAULT_SETTINGS.trashRetentionDays);
  return {
    theme:
      theme === 'light' || theme === 'dark' || theme === 'system'
        ? theme
        : DEFAULT_SETTINGS.theme,
    // Clamped so an edited or corrupt value can never mean "purge immediately".
    trashRetentionDays: Math.min(365, Math.max(1, Math.round(days))),
  };
}

/** Crypto-backed id; falls back to a timestamp+random id if unavailable. */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

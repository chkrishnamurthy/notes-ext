import { isHexColor } from './color';
import { DEFAULT_PALETTE, isPaletteId, type PaletteId } from './palettes';
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
export const SCHEMA_VERSION = 3;

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
  /** Incremented on every committed write. */
  rev: number;
  /**
   * Incremented only when the body changes. An edit checks this rather than
   * `rev`, so pinning, trashing or restoring a note in another window does not
   * make an open edit of it look stale.
   */
  contentRev: number;
  schemaVersion: number;
}

/** An uncommitted composer draft. Survives closing the panel. */
export interface Draft {
  html: string;
  text: string;
  /** Set when the draft is an in-progress edit of an existing note. */
  editingId?: string;
  /**
   * The content revision the edit started from, so an edit made stale by a
   * change to the note's text can be detected.
   */
  editingRev?: number;
  updatedAt: number;
}

/** When to be dark. `system` follows the OS and switches with it. */
export type ThemePreference = 'system' | 'light' | 'dark';

export type EditorFont = 'sans' | 'serif' | 'mono';
export type TextSize = 'small' | 'medium' | 'large';

export interface Settings {
  /**
   * The mode. Kept under its original name so settings written before
   * palettes existed still mean exactly what they meant.
   */
  theme: ThemePreference;
  /** The palette used whenever the panel is in light mode. */
  lightPalette: PaletteId;
  /** The palette used whenever the panel is in dark mode. */
  darkPalette: PaletteId;
  /**
   * A colour the user picked to replace the palette's own accent, or null to
   * keep it. Stored as picked; the readable light and dark versions are
   * derived from it when the theme is applied.
   */
  accent: string | null;
  /** Typeface for note text, in the editor and in the list. */
  editorFont: EditorFont;
  textSize: TextSize;
  /** Days a note stays recoverable in Trash before it is purged. */
  trashRetentionDays: number;
  /**
   * Show the quick-open button on web pages. Off by default, because turning
   * it on requires access to every site — a decision that has to be the
   * user's, made deliberately, rather than something the extension assumes on
   * their behalf at install time.
   */
  showLauncher: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  lightPalette: DEFAULT_PALETTE,
  darkPalette: DEFAULT_PALETTE,
  accent: null,
  editorFont: 'sans',
  textSize: 'medium',
  trashRetentionDays: 30,
  showLauncher: false,
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
 * True for a record written by a newer build than this one.
 *
 * Such a record can still be *read* — `parseNote` salvages what it recognises
 * — but must never be written back: that would stamp it with this build's
 * older version and drop every field this build does not know about, so a
 * user who rolls back and then forward again would find those fields gone.
 */
export function isFromNewerVersion(value: unknown): boolean {
  return (
    isPlainObject(value) &&
    typeof value.schemaVersion === 'number' &&
    value.schemaVersion > SCHEMA_VERSION
  );
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
  const rev = Math.max(1, Math.floor(num(value.rev, 1)));
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
    rev,
    // Before v3 there was one counter; it stands in until the migration runs.
    contentRev: Math.max(1, Math.floor(num(value.contentRev, rev))),
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
    // Unknown palettes — from a newer build, or a corrupt record — fall back
    // to the default rather than leaving the panel without colours.
    lightPalette: isPaletteId(value.lightPalette) ? value.lightPalette : DEFAULT_PALETTE,
    darkPalette: isPaletteId(value.darkPalette) ? value.darkPalette : DEFAULT_PALETTE,
    accent: isHexColor(value.accent) ? value.accent.toLowerCase() : null,
    editorFont:
      value.editorFont === 'serif' || value.editorFont === 'mono' ? value.editorFont : 'sans',
    textSize:
      value.textSize === 'small' || value.textSize === 'large' ? value.textSize : 'medium',
    // Clamped so an edited or corrupt value can never mean "purge immediately".
    trashRetentionDays: Math.min(365, Math.max(1, Math.round(days))),
    // Anything but an explicit `true` means off. A corrupt record must never
    // be the reason a button appears on every page the user visits.
    showLauncher: value.showLauncher === true,
  };
}

/** Crypto-backed id; falls back to a timestamp+random id if unavailable. */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

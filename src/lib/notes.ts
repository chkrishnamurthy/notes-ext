/**
 * Note operations — the rules that sit between the UI and the storage layer.
 *
 * Clearing is always a move to Trash, never a delete. Permanent removal
 * happens in exactly two places: an explicit "delete forever", and the
 * retention purge. Pinned notes are excluded from every bulk action.
 */

import { textToHtml } from './richtext';
import { newId, SCHEMA_VERSION, sanitizeUrl, type CaptureKind, type Note } from './schema';
import type { NoteStore, WriteResult } from './storage';

/**
 * A note to be created, given either as rich HTML from the editor or as plain
 * text from a capture.
 *
 * The plain-text form is what the service worker uses. Deriving the HTML from
 * text is a pure string operation, so a capture never needs a DOM; deriving
 * text from HTML does, which is why the editor supplies both.
 */
export interface NoteDraftInput {
  /** Rich body from the editor. Supply `text` alongside it. */
  html?: string;
  /** Plain text. On its own, the HTML body is derived from it. */
  text: string;
  kind?: CaptureKind;
  targetUrl?: string;
  sourceUrl?: string;
  sourceTitle?: string;
}

export function buildNote(input: NoteDraftInput, now = Date.now()): Note {
  const note: Note = {
    id: newId(),
    html: input.html ?? textToHtml(input.text),
    text: input.text,
    kind: input.kind ?? 'thought',
    createdAt: now,
    updatedAt: now,
    pinned: false,
    rev: 1,
    schemaVersion: SCHEMA_VERSION,
  };
  const targetUrl = sanitizeUrl(input.targetUrl);
  if (targetUrl) note.targetUrl = targetUrl;
  const sourceUrl = sanitizeUrl(input.sourceUrl);
  if (sourceUrl) note.sourceUrl = sourceUrl;
  if (input.sourceTitle) note.sourceTitle = input.sourceTitle;
  return note;
}

/**
 * Trim the plain-text projection for emptiness checks and display.
 *
 * The HTML body itself is never trimmed: inside a code block the leading
 * whitespace is the content.
 */
export function normalizeText(text: string): string {
  return text.trim();
}

export async function createNote(
  store: NoteStore,
  input: NoteDraftInput,
  now = Date.now(),
): Promise<WriteResult<Note>> {
  const text = normalizeText(input.text);
  if (!text) {
    return { ok: false, reason: 'unknown', message: 'A note needs some text.' };
  }
  return store.putNote(buildNote({ ...input, text }, now));
}

export function editNote(
  store: NoteStore,
  id: string,
  changes: { html: string; text: string },
  expectedRev: number,
  now = Date.now(),
): Promise<WriteResult<Note>> {
  const text = normalizeText(changes.text);
  return store.updateNote(
    id,
    (current) => ({ ...current, html: changes.html, text }),
    expectedRev,
    now,
  );
}

/**
 * Keep a losing edit as its own note rather than discarding it. The user ends
 * up with both versions and can decide, which is the only outcome that cannot
 * lose work.
 */
export function saveConflictCopy(
  store: NoteStore,
  original: Note,
  html: string,
  text: string,
  now = Date.now(),
): Promise<WriteResult<Note>> {
  return store.putNote(
    buildNote(
      {
        html,
        text: normalizeText(text),
        kind: original.kind,
        targetUrl: original.targetUrl,
        sourceUrl: original.sourceUrl,
        sourceTitle: original.sourceTitle
          ? `Conflicting copy · ${original.sourceTitle}`
          : 'Conflicting copy',
      },
      now,
    ),
  );
}

export function setPinned(
  store: NoteStore,
  id: string,
  pinned: boolean,
  now = Date.now(),
): Promise<WriteResult<Note>> {
  return store.updateNote(id, (current) => ({ ...current, pinned }), undefined, now);
}

export function trashNote(
  store: NoteStore,
  id: string,
  now = Date.now(),
): Promise<WriteResult<Note>> {
  return store.updateNote(id, (current) => ({ ...current, deletedAt: now }), undefined, now);
}

export function restoreNote(
  store: NoteStore,
  id: string,
  now = Date.now(),
): Promise<WriteResult<Note>> {
  return store.updateNote(
    id,
    (current) => {
      const { deletedAt: _discarded, ...rest } = current;
      return rest;
    },
    undefined,
    now,
  );
}

export const isActive = (note: Note): boolean => note.deletedAt === undefined;
export const isTrashed = (note: Note): boolean => note.deletedAt !== undefined;

/** The notes a bulk clear would move to Trash. Pinned notes are never included. */
export function clearableNotes(notes: Note[]): Note[] {
  return notes.filter((note) => isActive(note) && !note.pinned);
}

/**
 * Move every unpinned active note to Trash. Returns the ids so the caller can
 * offer a single Undo covering the whole batch.
 */
export async function clearUnpinned(
  store: NoteStore,
  notes: Note[],
  now = Date.now(),
): Promise<WriteResult<string[]>> {
  const targets = clearableNotes(notes);
  if (targets.length === 0) return { ok: true, value: [] };
  const updated = targets.map((note) => ({
    ...note,
    deletedAt: now,
    updatedAt: now,
    rev: note.rev + 1,
  }));
  const result = await store.putNotes(updated);
  if (!result.ok) return result;
  return { ok: true, value: targets.map((note) => note.id) };
}

export async function restoreMany(
  store: NoteStore,
  ids: string[],
  now = Date.now(),
): Promise<WriteResult<string[]>> {
  const restored: Note[] = [];
  for (const id of ids) {
    const note = await store.getNote(id);
    // A note the user deleted forever in the meantime is simply skipped.
    if (!note) continue;
    const { deletedAt: _discarded, ...rest } = note;
    restored.push({ ...rest, updatedAt: now, rev: note.rev + 1 });
  }
  const result = await store.putNotes(restored);
  if (!result.ok) return result;
  return { ok: true, value: restored.map((note) => note.id) };
}

export function deleteForever(store: NoteStore, ids: string[]): Promise<WriteResult<string[]>> {
  return store.removeNotes(ids);
}

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Trashed notes whose recovery window has closed. */
export function expiredTrash(notes: Note[], retentionDays: number, now = Date.now()): Note[] {
  const cutoff = now - retentionDays * DAY_MS;
  return notes.filter((note) => note.deletedAt !== undefined && note.deletedAt < cutoff);
}

/**
 * Purge notes past the retention window. Called opportunistically on panel
 * open and worker start rather than on a timer, which would need the alarms
 * permission for no user-visible benefit.
 */
export async function purgeExpiredTrash(
  store: NoteStore,
  retentionDays: number,
  now = Date.now(),
): Promise<string[]> {
  const notes = await store.listNotes();
  const expired = expiredTrash(notes, retentionDays, now);
  if (expired.length === 0) return [];
  const result = await store.removeNotes(expired.map((note) => note.id));
  return result.ok ? result.value : [];
}

/** Days left before a trashed note is purged; 0 means it goes on the next purge. */
export function daysUntilPurge(note: Note, retentionDays: number, now = Date.now()): number {
  if (note.deletedAt === undefined) return Number.POSITIVE_INFINITY;
  const elapsed = now - note.deletedAt;
  return Math.max(0, Math.ceil((retentionDays * DAY_MS - elapsed) / DAY_MS));
}

/** Pinned first, then most recently touched. Stable for equal timestamps. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt || b.createdAt - a.createdAt;
  });
}

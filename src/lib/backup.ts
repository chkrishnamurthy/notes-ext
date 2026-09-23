/**
 * Backup export and import.
 *
 * Export and import are MVP features because uninstalling the extension
 * clears chrome.storage.local. An import file is untrusted input: it is
 * validated record by record, and anything unusable is reported rather than
 * silently dropped or silently written.
 */

import { sanitizeHtml } from './richtext';
import { SCHEMA_VERSION, parseNote, type Note } from './schema';
import { migrateRecord } from './migrations';
import type { NoteStore, WriteResult } from './storage';

export const BACKUP_APP = 'for-now';
export const BACKUP_KIND = 'backup';

export interface BackupFile {
  app: typeof BACKUP_APP;
  kind: typeof BACKUP_KIND;
  schemaVersion: number;
  exportedAt: number;
  noteCount: number;
  notes: Note[];
}

export function buildBackup(notes: Note[], now = Date.now()): BackupFile {
  return {
    app: BACKUP_APP,
    kind: BACKUP_KIND,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now,
    noteCount: notes.length,
    notes,
  };
}

export function serializeBackup(notes: Note[], now = Date.now()): string {
  return JSON.stringify(buildBackup(notes, now), null, 2);
}

/** `for-now-backup-2026-09-23.json` */
export function backupFilename(now = Date.now()): string {
  const date = new Date(now).toISOString().slice(0, 10);
  return `for-now-backup-${date}.json`;
}

export interface ParsedBackup {
  ok: boolean;
  notes: Note[];
  /** Records present in the file that could not be read as notes. */
  skipped: number;
  schemaVersion: number;
  exportedAt?: number;
  error?: string;
}

const invalid = (error: string): ParsedBackup => ({
  ok: false,
  notes: [],
  skipped: 0,
  schemaVersion: 0,
  error,
});

/**
 * Parse and validate a backup file. Records from older schema versions are
 * migrated on the way in, so an old export still restores.
 */
export function parseBackup(raw: string, now = Date.now()): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return invalid('That file is not valid JSON.');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return invalid('That file is not a For Now backup.');
  }

  const file = data as Record<string, unknown>;
  if (file.app !== BACKUP_APP) {
    return invalid('That file was not exported by For Now.');
  }
  if (!Array.isArray(file.notes)) {
    return invalid('That backup has no notes list.');
  }

  const schemaVersion =
    typeof file.schemaVersion === 'number' ? file.schemaVersion : 0;
  if (schemaVersion > SCHEMA_VERSION) {
    return invalid(
      'That backup was made by a newer version of For Now. Update the extension, then import again.',
    );
  }

  const notes: Note[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (const entry of file.notes) {
    if (typeof entry !== 'object' || entry === null) {
      skipped += 1;
      continue;
    }
    const record = entry as Record<string, unknown>;
    // The file's version wins when a record does not carry its own.
    if (typeof record.schemaVersion !== 'number') record.schemaVersion = schemaVersion;
    const note = parseNote(migrateRecord(record), now);
    if (!note || seen.has(note.id)) {
      skipped += 1;
      continue;
    }
    // An import is untrusted HTML. It is sanitized on the way in, so nothing
    // outside the allowlist is ever written to storage.
    note.html = sanitizeHtml(note.html);
    seen.add(note.id);
    notes.push(note);
  }

  return {
    ok: true,
    notes,
    skipped,
    schemaVersion,
    exportedAt: typeof file.exportedAt === 'number' ? file.exportedAt : undefined,
  };
}

export type ImportMode = 'merge' | 'replace';

export interface ImportSummary {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  removed: number;
}

/**
 * Decide what a merge would do, without writing anything. The panel shows this
 * before the user confirms, so "import" is never a surprise.
 */
export function planMerge(existing: Note[], incoming: Note[]): ImportSummary {
  const byId = new Map(existing.map((note) => [note.id, note]));
  const summary: ImportSummary = {
    added: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    removed: 0,
  };
  for (const note of incoming) {
    const current = byId.get(note.id);
    if (!current) summary.added += 1;
    else if (note.updatedAt > current.updatedAt) summary.updated += 1;
    else summary.unchanged += 1;
  }
  return summary;
}

/**
 * Merge keeps whichever copy was updated more recently and preserves the local
 * revision counter, so a restored note still detects future conflicts.
 */
export function mergeNotes(existing: Note[], incoming: Note[]): Note[] {
  const byId = new Map(existing.map((note) => [note.id, note]));
  const writes: Note[] = [];
  for (const note of incoming) {
    const current = byId.get(note.id);
    if (!current) {
      writes.push(note);
      continue;
    }
    if (note.updatedAt > current.updatedAt) {
      writes.push({ ...note, rev: Math.max(current.rev + 1, note.rev) });
    }
  }
  return writes;
}

export async function importBackup(
  store: NoteStore,
  parsed: ParsedBackup,
  mode: ImportMode,
): Promise<WriteResult<ImportSummary>> {
  if (!parsed.ok) {
    return { ok: false, reason: 'unknown', message: parsed.error ?? 'Invalid backup.' };
  }

  const existing = await store.listNotes();

  if (mode === 'replace') {
    const cleared = await store.clearAllNotes();
    if (!cleared.ok) return cleared;
    const written = await store.putNotes(parsed.notes);
    if (!written.ok) return written;
    return {
      ok: true,
      value: {
        added: parsed.notes.length,
        updated: 0,
        unchanged: 0,
        skipped: parsed.skipped,
        removed: cleared.value,
      },
    };
  }

  const summary = planMerge(existing, parsed.notes);
  const writes = mergeNotes(existing, parsed.notes);
  const written = await store.putNotes(writes);
  if (!written.ok) return written;
  return { ok: true, value: { ...summary, skipped: parsed.skipped, removed: 0 } };
}

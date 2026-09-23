/**
 * The storage/repository layer.
 *
 * Three rules shape this file, all from the reliability requirements:
 *
 *  1. Nothing durable lives in a module global. The service worker can be
 *     terminated at any time, so every read goes back to chrome.storage.
 *  2. Mutations are serialized through a promise chain, and each one
 *     re-reads the record it is about to change. A write that finds a newer
 *     revision than it expected is a conflict, never an overwrite.
 *  3. A write is only "saved" once the storage area acknowledges it. Callers
 *     get a typed result and are expected to surface failure honestly.
 */

import {
  DRAFT_KEY,
  META_KEY,
  NOTE_PREFIX,
  SETTINGS_KEY,
  SCHEMA_VERSION,
  isNoteKey,
  noteKey,
  parseDraft,
  parseNote,
  parseSettings,
  type Draft,
  type Note,
  type Settings,
  type StoreMeta,
} from './schema';

/**
 * The slice of chrome.storage.StorageArea this layer needs. Narrowing it to an
 * interface is what lets the whole module be tested without a browser.
 */
export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  getBytesInUse?(keys?: string | string[] | null): Promise<number>;
}

/** Documented chrome.storage.local ceiling without `unlimitedStorage`. */
export const QUOTA_BYTES = 10 * 1024 * 1024;
/** Above this share of the quota, the UI warns before the user hits a failure. */
export const QUOTA_WARN_RATIO = 0.8;

export type WriteFailureReason = 'quota' | 'conflict' | 'unknown';

export type WriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: WriteFailureReason; message: string; conflict?: Note };

const failure = (
  reason: WriteFailureReason,
  message: string,
  conflict?: Note,
): WriteResult<never> => ({ ok: false, reason, message, conflict });

/** Chrome reports quota exhaustion as a message, not a typed error. */
function classify(error: unknown): WriteFailureReason {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /quota|QUOTA_BYTES|exceeded/i.test(message) ? 'quota' : 'unknown';
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

export class NoteStore {
  /**
   * Serializes mutations within this context. Cross-context races are caught
   * by the revision check instead; this only prevents a context racing itself.
   */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly area: StorageArea) {}

  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    // Keep the chain alive even when a task rejects.
    this.queue = next.catch(() => undefined);
    return next;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async listNotes(): Promise<Note[]> {
    const all = await this.area.get(null);
    const notes: Note[] = [];
    for (const [key, value] of Object.entries(all)) {
      if (!isNoteKey(key)) continue;
      const note = parseNote(value);
      // A record that cannot be parsed is skipped, not deleted: a future
      // version may understand it, and dropping it would be silent data loss.
      if (note) notes.push(note);
    }
    return notes;
  }

  async getNote(id: string): Promise<Note | null> {
    const record = await this.area.get(noteKey(id));
    return parseNote(record[noteKey(id)]);
  }

  async getDraft(): Promise<Draft> {
    const record = await this.area.get(DRAFT_KEY);
    return parseDraft(record[DRAFT_KEY]);
  }

  async getSettings(): Promise<Settings> {
    const record = await this.area.get(SETTINGS_KEY);
    return parseSettings(record[SETTINGS_KEY]);
  }

  async getMeta(): Promise<StoreMeta> {
    const record = await this.area.get(META_KEY);
    const value = record[META_KEY];
    if (typeof value === 'object' && value !== null) {
      const meta = value as Record<string, unknown>;
      return {
        schemaVersion:
          typeof meta.schemaVersion === 'number' ? meta.schemaVersion : 0,
        installedAt:
          typeof meta.installedAt === 'number' ? meta.installedAt : undefined,
      };
    }
    return { schemaVersion: 0 };
  }

  async usage(): Promise<{ bytes: number; quota: number; ratio: number }> {
    let bytes = 0;
    if (this.area.getBytesInUse) {
      try {
        bytes = await this.area.getBytesInUse(null);
      } catch {
        bytes = 0;
      }
    }
    return { bytes, quota: QUOTA_BYTES, ratio: bytes / QUOTA_BYTES };
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  /** Write a note verbatim, without a revision check. Used by import/restore. */
  putNote(note: Note): Promise<WriteResult<Note>> {
    return this.run(async () => {
      try {
        await this.area.set({ [noteKey(note.id)]: note });
        return { ok: true as const, value: note };
      } catch (error) {
        return failure(classify(error), describe(error));
      }
    });
  }

  putNotes(notes: Note[]): Promise<WriteResult<Note[]>> {
    return this.run(async () => {
      if (notes.length === 0) return { ok: true as const, value: [] };
      const items: Record<string, unknown> = {};
      for (const note of notes) items[noteKey(note.id)] = note;
      try {
        await this.area.set(items);
        return { ok: true as const, value: notes };
      } catch (error) {
        return failure(classify(error), describe(error));
      }
    });
  }

  /**
   * Apply `mutate` to the stored note, bumping its revision.
   *
   * When `expectedRev` is given and the stored note has moved on, the write is
   * refused and the newer record is handed back so the caller can decide. The
   * incoming text is never dropped and never written over the newer one.
   */
  updateNote(
    id: string,
    mutate: (current: Note) => Note,
    expectedRev?: number,
    now = Date.now(),
  ): Promise<WriteResult<Note>> {
    return this.run(async () => {
      const record = await this.area.get(noteKey(id));
      const current = parseNote(record[noteKey(id)]);
      if (!current) {
        return failure('unknown', 'That note no longer exists on this device.');
      }
      if (expectedRev !== undefined && current.rev !== expectedRev) {
        return failure(
          'conflict',
          'This note changed in another window while you were editing.',
          current,
        );
      }
      const next: Note = {
        ...mutate(current),
        id: current.id,
        rev: current.rev + 1,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION,
      };
      try {
        await this.area.set({ [noteKey(id)]: next });
        return { ok: true as const, value: next };
      } catch (error) {
        return failure(classify(error), describe(error));
      }
    });
  }

  /** Permanent removal. Only ever called for Trash purge or explicit delete. */
  removeNotes(ids: string[]): Promise<WriteResult<string[]>> {
    return this.run(async () => {
      if (ids.length === 0) return { ok: true as const, value: [] };
      try {
        await this.area.remove(ids.map(noteKey));
        return { ok: true as const, value: ids };
      } catch (error) {
        return failure(classify(error), describe(error));
      }
    });
  }

  async setDraft(draft: Draft): Promise<WriteResult<Draft>> {
    try {
      await this.area.set({ [DRAFT_KEY]: draft });
      return { ok: true, value: draft };
    } catch (error) {
      return failure(classify(error), describe(error));
    }
  }

  async clearDraft(): Promise<void> {
    try {
      await this.area.remove(DRAFT_KEY);
    } catch {
      // A stale draft is recoverable noise; it must not fail the note write
      // that triggered the clear.
    }
  }

  async setSettings(settings: Settings): Promise<WriteResult<Settings>> {
    try {
      const value = parseSettings(settings);
      await this.area.set({ [SETTINGS_KEY]: value });
      return { ok: true, value };
    } catch (error) {
      return failure(classify(error), describe(error));
    }
  }

  async setMeta(meta: StoreMeta): Promise<void> {
    await this.area.set({ [META_KEY]: meta });
  }

  /**
   * Remove every note key. Used only by "replace all" import, which writes the
   * replacement set in the same call sequence.
   */
  async clearAllNotes(): Promise<WriteResult<number>> {
    try {
      const all = await this.area.get(null);
      const keys = Object.keys(all).filter(isNoteKey);
      if (keys.length > 0) await this.area.remove(keys);
      return { ok: true, value: keys.length };
    } catch (error) {
      return failure(classify(error), describe(error));
    }
  }
}

/** Promise-based adapter over the real chrome.storage.local area. */
export function chromeLocalArea(): StorageArea {
  const area = chrome.storage.local;
  return {
    get: (keys) => area.get(keys ?? null) as Promise<Record<string, unknown>>,
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
    getBytesInUse: (keys) => area.getBytesInUse(keys ?? null),
  };
}

export { NOTE_PREFIX };

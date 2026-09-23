/**
 * Schema migrations.
 *
 * Migrations run per note record and are additive: an update must never reset
 * or drop a user's notes. A record that cannot be migrated is left untouched
 * so a later version still has a chance at it.
 */

import { textToCodeBlock, textToHtml } from './richtext';
import { SCHEMA_VERSION, parseNote, type Note } from './schema';
import type { NoteStore } from './storage';

export type RawRecord = Record<string, unknown>;

/** Each step takes a record at `from` and returns it at `from + 1`. */
export type MigrationStep = (record: RawRecord) => RawRecord;

/**
 * Index N migrates a record from version N to version N+1.
 *
 * Version 0 covers records written before versioning existed: they may lack
 * `kind`, `rev`, `format`, or `pinned`, and may carry a legacy `text` field.
 *
 * Version 1 is the plain-text era, before the rich text editor.
 */
export const MIGRATIONS: MigrationStep[] = [
  function v0_to_v1(record) {
    const next: RawRecord = { ...record };
    if (typeof next.body !== 'string' && typeof next.text === 'string') {
      next.body = next.text;
    }
    delete next.text;
    if (next.format !== 'code' && next.format !== 'text') next.format = 'text';
    if (typeof next.kind !== 'string') {
      next.kind = typeof next.sourceUrl === 'string' ? 'selection' : 'thought';
    }
    if (typeof next.rev !== 'number') next.rev = 1;
    if (typeof next.pinned !== 'boolean') next.pinned = next.pinned === 'true';
    if (typeof next.createdAt !== 'number' && typeof next.created === 'number') {
      next.createdAt = next.created;
    }
    delete next.created;
    next.schemaVersion = 1;
    return next;
  },

  function v1_to_v2(record) {
    // Plain-text bodies become HTML. A note that was a code snippet keeps its
    // whitespace by becoming a code block, which is what the toolbar's code
    // button now produces, so nothing a v1 user wrote is lost or reflowed.
    const next: RawRecord = { ...record };
    const body = typeof next.body === 'string' ? next.body : '';
    next.html = next.format === 'code' ? textToCodeBlock(body) : textToHtml(body);
    next.text = body;
    delete next.body;
    delete next.format;
    next.schemaVersion = 2;
    return next;
  },
];

export function migrateRecord(record: RawRecord): RawRecord {
  const from = typeof record.schemaVersion === 'number' ? record.schemaVersion : 0;
  let current = record;
  for (let version = from; version < SCHEMA_VERSION; version += 1) {
    const step = MIGRATIONS[version];
    // No step for this gap means the record is from a *newer* build. Leave it
    // alone rather than mangling it into the shape this build expects.
    if (!step) break;
    current = step(current);
  }
  return current;
}

export interface MigrationReport {
  scanned: number;
  migrated: number;
  unreadable: number;
}

/**
 * Bring every stored record up to the current schema and record the version.
 * Safe to call on every worker start: records already at the current version
 * are not rewritten.
 */
export async function runMigrations(
  store: NoteStore,
  area: { get(keys: null): Promise<Record<string, unknown>> },
  now = Date.now(),
): Promise<MigrationReport> {
  const all = await area.get(null);
  const report: MigrationReport = { scanned: 0, migrated: 0, unreadable: 0 };
  const upgraded: Note[] = [];

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith('note:')) continue;
    report.scanned += 1;
    if (typeof value !== 'object' || value === null) {
      report.unreadable += 1;
      continue;
    }
    const record = value as RawRecord;
    const version = typeof record.schemaVersion === 'number' ? record.schemaVersion : 0;
    if (version === SCHEMA_VERSION) continue;

    const migrated = parseNote(migrateRecord(record), now);
    if (!migrated) {
      report.unreadable += 1;
      continue;
    }
    upgraded.push(migrated);
  }

  if (upgraded.length > 0) {
    const result = await store.putNotes(upgraded);
    // Only claim the migration if the write was acknowledged; otherwise the
    // version marker stays behind and the migration runs again next start.
    if (result.ok) report.migrated = upgraded.length;
    else return report;
  }

  const meta = await store.getMeta();
  await store.setMeta({
    schemaVersion: SCHEMA_VERSION,
    installedAt: meta.installedAt ?? now,
  });
  return report;
}

import { describe, expect, it } from 'vitest';
import {
  importBackup,
  parseBackup,
  planMerge,
  serializeBackup,
  backupFilename,
} from '../src/lib/backup';
import { createNote, isActive, isTrashed, setPinned, trashNote } from '../src/lib/notes';
import { NoteStore } from '../src/lib/storage';
import { SCHEMA_VERSION } from '../src/lib/schema';
import { FakeArea, quotaError } from './fakeArea';

const freshStore = () => {
  const area = new FakeArea();
  return { area, store: new NoteStore(area) };
};

async function seed(store: NoteStore) {
  await createNote(store, { text: 'a plain thought' });
  await createNote(store, {
    html: '<pre><code>  indented(code)\n\tand a tab</code></pre>',
    text: '  indented(code)\n\tand a tab',
  });
  await createNote(store, {
    text: 'a captured passage',
    kind: 'selection',
    sourceUrl: 'https://example.edu/learning/recall',
    sourceTitle: 'The Learning Notebook',
  });
  const notes = await store.listNotes();
  await setPinned(store, notes[0].id, true);
  await trashNote(store, notes[1].id);
}

describe('export and import round trip', () => {
  it('restores every note byte for byte into an empty store', async () => {
    const source = freshStore();
    await seed(source.store);
    const exported = await source.store.listNotes();
    const json = serializeBackup(exported);

    const target = freshStore();
    const parsed = parseBackup(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.skipped).toBe(0);

    const result = await importBackup(target.store, parsed, 'replace');
    expect(result.ok).toBe(true);

    const restored = await target.store.listNotes();
    const byId = (notes: typeof restored) =>
      [...notes].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(restored)).toEqual(byId(exported));
  });

  it('preserves code whitespace exactly', async () => {
    const source = freshStore();
    const snippet = 'function f() {\n    return [\n\t\t1,\n\t\t2,\n    ];\n}';
    await createNote(source.store, {
      html: `<pre><code>${snippet.replace(/</g, '&lt;')}</code></pre>`,
      text: snippet,
    });

    const json = serializeBackup(await source.store.listNotes());
    const target = freshStore();
    await importBackup(target.store, parseBackup(json), 'replace');

    expect((await target.store.listNotes())[0].text).toBe(snippet);
  });

  it('carries pinned state and Trash across the round trip', async () => {
    const source = freshStore();
    await seed(source.store);
    const json = serializeBackup(await source.store.listNotes());

    const target = freshStore();
    await importBackup(target.store, parseBackup(json), 'replace');
    const restored = await target.store.listNotes();

    expect(restored.filter((n) => n.pinned)).toHaveLength(1);
    expect(restored.filter(isTrashed)).toHaveLength(1);
    expect(restored.filter(isActive)).toHaveLength(2);
  });

  it('names the file by date', () => {
    expect(backupFilename(Date.UTC(2026, 8, 23))).toBe('for-now-backup-2026-09-23.json');
  });
});

describe('import validation', () => {
  it('rejects text that is not JSON', () => {
    expect(parseBackup('not json at all').ok).toBe(false);
  });

  it('rejects a JSON file from another app', () => {
    const parsed = parseBackup(JSON.stringify({ app: 'something-else', notes: [] }));
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/not exported by For Now/);
  });

  it('rejects a backup from a newer schema version', () => {
    const parsed = parseBackup(
      JSON.stringify({ app: 'for-now', schemaVersion: SCHEMA_VERSION + 1, notes: [] }),
    );
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/newer version/);
  });

  it('keeps good records and counts the unusable ones', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: 'for-now',
        kind: 'backup',
        schemaVersion: SCHEMA_VERSION,
        notes: [
          { id: 'good', text: 'fine', html: '<p>fine</p>', createdAt: 1, updatedAt: 1 },
          { id: 'no-body' },
          null,
          'a string',
          { id: 'good', text: 'duplicate id', html: '<p>dup</p>', createdAt: 2, updatedAt: 2 },
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.skipped).toBe(4);
  });

  it('migrates an older backup on the way in', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: 'for-now',
        schemaVersion: 0,
        notes: [{ id: 'old', text: 'written by an older build', created: 5 }],
      }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.notes[0].text).toBe('written by an older build');
    expect(parsed.notes[0].html).toBe('<p>written by an older build</p>');
    expect(parsed.notes[0].schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('strips a dangerous URL from an imported record', () => {
    const parsed = parseBackup(
      JSON.stringify({
        app: 'for-now',
        schemaVersion: SCHEMA_VERSION,
        // eslint-disable-next-line no-script-url
        notes: [{ id: 'x', text: 'b', html: '<p>b</p>', targetUrl: 'javascript:alert(1)', createdAt: 1 }],
      }),
    );
    expect(parsed.notes[0].targetUrl).toBeUndefined();
  });
});

describe('merge import', () => {
  it('adds new notes and leaves existing ones alone', async () => {
    const { store } = freshStore();
    await createNote(store, { text: 'mine' });
    const existing = await store.listNotes();

    const incoming = parseBackup(
      JSON.stringify({
        app: 'for-now',
        schemaVersion: SCHEMA_VERSION,
        notes: [{ id: 'imported', text: 'theirs', html: '<p>theirs</p>', createdAt: 1, updatedAt: 1 }],
      }),
    );

    const result = await importBackup(store, incoming, 'merge');
    expect(result.ok && result.value.added).toBe(1);

    const after = await store.listNotes();
    expect(after).toHaveLength(2);
    expect(after.find((n) => n.id === existing[0].id)?.text).toBe('mine');
  });

  it('keeps the more recently edited copy of the same note', async () => {
    const { store } = freshStore();
    await createNote(store, { text: 'old local version' });
    const [local] = await store.listNotes();

    const newer = parseBackup(
      JSON.stringify({
        app: 'for-now',
        schemaVersion: SCHEMA_VERSION,
        notes: [
          { id: local.id, text: 'newer backup version', html: '<p>newer backup version</p>', createdAt: 1, updatedAt: local.updatedAt + 1000 },
        ],
      }),
    );

    await importBackup(store, newer, 'merge');
    expect((await store.listNotes())[0].text).toBe('newer backup version');
  });

  it('does not overwrite a local note that is newer than the backup', async () => {
    const { store } = freshStore();
    await createNote(store, { text: 'newer local version' });
    const [local] = await store.listNotes();

    const older = parseBackup(
      JSON.stringify({
        app: 'for-now',
        schemaVersion: SCHEMA_VERSION,
        notes: [
          { id: local.id, text: 'stale backup version', html: '<p>stale</p>', createdAt: 1, updatedAt: local.updatedAt - 1000 },
        ],
      }),
    );

    const result = await importBackup(store, older, 'merge');
    expect(result.ok && result.value.unchanged).toBe(1);
    expect((await store.listNotes())[0].text).toBe('newer local version');
  });

  it('previews what a merge would do before writing', () => {
    const base = {
      id: 'a',
      html: '<p>x</p>',
      text: 'x',
      kind: 'thought',
      createdAt: 1,
      pinned: false,
      rev: 1,
      schemaVersion: SCHEMA_VERSION,
    } as const;
    const summary = planMerge(
      [{ ...base, updatedAt: 100 }],
      [
        { ...base, updatedAt: 200 },
        { ...base, id: 'b', updatedAt: 1 },
      ],
    );
    expect(summary).toMatchObject({ added: 1, updated: 1, unchanged: 0 });
  });

  it('reports a failed import instead of claiming success', async () => {
    const { store, area } = freshStore();
    const parsed = parseBackup(
      JSON.stringify({
        app: 'for-now',
        schemaVersion: SCHEMA_VERSION,
        notes: [{ id: 'x', text: 'y', html: '<p>y</p>', createdAt: 1, updatedAt: 1 }],
      }),
    );
    area.failNextWrites = quotaError();

    const result = await importBackup(store, parsed, 'merge');
    expect(result).toMatchObject({ ok: false, reason: 'quota' });
  });
});

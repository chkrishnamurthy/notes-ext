import { describe, expect, it } from 'vitest';
import { migrateRecord, runMigrations } from '../src/lib/migrations';
import { NoteStore } from '../src/lib/storage';
import { SCHEMA_VERSION } from '../src/lib/schema';
import { FakeArea, quotaError } from './fakeArea';

/** A note as a pre-versioning build would have written it. */
const legacyNote = {
  id: 'legacy-1',
  text: 'a thought from an older build',
  created: 1_700_000_000_000,
  sourceUrl: 'https://example.com/article',
};

describe('record migration', () => {
  it('carries a v0 legacy body through to the v2 shape', () => {
    // The v0 field was called `text` and v2 has a real field of that name, so
    // this asserts the content lands in the right one and `body` is gone.
    const migrated = migrateRecord({ ...legacyNote });
    expect(migrated.text).toBe('a thought from an older build');
    expect(migrated.html).toBe('<p>a thought from an older build</p>');
    expect(migrated.body).toBeUndefined();
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('fills in fields the old shape lacked', () => {
    const migrated = migrateRecord({ ...legacyNote });
    expect(migrated.rev).toBe(1);
    expect(migrated.pinned).toBe(false);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('turns a plain-text body into HTML', () => {
    const migrated = migrateRecord({ ...legacyNote });
    expect(migrated.html).toBe('<p>a thought from an older build</p>');
    expect(migrated.body).toBeUndefined();
    expect(migrated.format).toBeUndefined();
  });

  it('keeps a v1 code snippet as a code block, whitespace intact', () => {
    const snippet = 'function f() {\n    return 1;\n}';
    const migrated = migrateRecord({
      id: 'c', body: snippet, format: 'code', schemaVersion: 1,
    });
    expect(migrated.html).toBe(
      '<pre><code>function f() {\n    return 1;\n}</code></pre>',
    );
    expect(migrated.text).toBe(snippet);
  });

  it('escapes HTML that was only ever plain text', () => {
    const migrated = migrateRecord({
      id: 'x', body: '<img src=x onerror=alert(1)>', schemaVersion: 1,
    });
    expect(String(migrated.html)).not.toContain('<img');
    expect(String(migrated.html)).toContain('&lt;img');
  });

  it('infers a capture kind from the presence of a source', () => {
    expect(migrateRecord({ ...legacyNote }).kind).toBe('selection');
    expect(migrateRecord({ id: 'x', text: 'no source' }).kind).toBe('thought');
  });

  it('starts the content revision where the single revision was', () => {
    const v2 = {
      id: 'v2',
      html: '<p>x</p>',
      text: 'x',
      kind: 'thought',
      createdAt: 1,
      updatedAt: 1,
      pinned: true,
      rev: 7,
      schemaVersion: 2,
    };
    const migrated = migrateRecord({ ...v2 });
    expect(migrated.contentRev).toBe(7);
    expect(migrated.rev).toBe(7);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('leaves a record from a newer build alone', () => {
    const future = { id: 'f', body: 'x', schemaVersion: SCHEMA_VERSION + 5, somethingNew: true };
    expect(migrateRecord({ ...future })).toEqual(future);
  });
});

describe('runMigrations', () => {
  it('upgrades old records without losing any', async () => {
    const area = new FakeArea({
      'note:legacy-1': legacyNote,
      'note:legacy-2': { id: 'legacy-2', text: 'second', created: 1 },
    });
    const store = new NoteStore(area);

    const report = await runMigrations(store, area);
    expect(report.scanned).toBe(2);
    expect(report.migrated).toBe(2);

    const notes = await store.listNotes();
    expect(notes.map((n) => n.text).sort()).toEqual([
      'a thought from an older build',
      'second',
    ]);
  });

  it('an update does not reset storage', async () => {
    const area = new FakeArea({ 'note:legacy-1': legacyNote });
    const store = new NoteStore(area);

    await runMigrations(store, area);
    await runMigrations(store, area);
    await runMigrations(store, area);

    expect(await store.listNotes()).toHaveLength(1);
    expect((await store.getMeta()).schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('does not rewrite records already at the current version', async () => {
    const area = new FakeArea({
      'note:current': {
        id: 'current',
        html: '<p>up to date</p>',
        text: 'up to date',
        kind: 'thought',
        createdAt: 1,
        updatedAt: 1,
        pinned: false,
        rev: 4,
        schemaVersion: SCHEMA_VERSION,
      },
    });
    const store = new NoteStore(area);
    const report = await runMigrations(store, area);

    expect(report.migrated).toBe(0);
    // The revision is preserved, so no spurious conflict is introduced.
    expect((await store.listNotes())[0].rev).toBe(4);
  });

  it('leaves the version marker behind when the migration write fails', async () => {
    const area = new FakeArea({ 'note:legacy-1': legacyNote });
    const store = new NoteStore(area);
    area.failNextWrites = quotaError();

    const report = await runMigrations(store, area);
    expect(report.migrated).toBe(0);
    // Not marked as migrated, so the next start tries again.
    expect((await store.getMeta()).schemaVersion).toBe(0);
  });

  it('counts an unreadable record without deleting it', async () => {
    const area = new FakeArea({ 'note:junk': { no: 'id' } });
    const store = new NoteStore(area);

    const report = await runMigrations(store, area);
    expect(report.unreadable).toBe(1);
    expect(area.keys()).toContain('note:junk');
  });

  it('never rewrites a record from a newer build', async () => {
    // After a rollback: the store holds a note a later version wrote, with a
    // field this build has never heard of.
    const future = {
      id: 'future-1',
      html: '<p>from the future</p>',
      text: 'from the future',
      kind: 'thought',
      createdAt: 1,
      updatedAt: 1,
      pinned: false,
      rev: 4,
      schemaVersion: SCHEMA_VERSION + 1,
      colour: 'teal',
    };
    const area = new FakeArea({ 'note:future-1': future });
    const store = new NoteStore(area);

    const report = await runMigrations(store, area);
    expect(report.newer).toBe(1);
    expect(report.migrated).toBe(0);
    expect(area.raw('note:future-1')).toEqual(future);
  });
});

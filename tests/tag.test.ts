import { describe, expect, it } from 'vitest';
import { importBackup, parseBackup, serializeBackup } from '../src/lib/backup';
import { migrateRecord } from '../src/lib/migrations';
import { buildNote, createNote, editNote, saveConflictCopy, setTag, tagsInUse } from '../src/lib/notes';
import { normalizeTag, parseNote, sameTag, SCHEMA_VERSION, TAG_MAX_LENGTH } from '../src/lib/schema';
import { filterNotes } from '../src/lib/search';
import { NoteStore } from '../src/lib/storage';
import { FakeArea } from './fakeArea';

const freshStore = () => new NoteStore(new FakeArea());

describe('normalizeTag', () => {
  it('drops a leading #, collapses whitespace and trims', () => {
    expect(normalizeTag('  #Reading   list ')).toBe('Reading list');
    expect(normalizeTag('##work')).toBe('work');
  });

  it('treats empty, whitespace and non-strings as no tag', () => {
    expect(normalizeTag('')).toBeUndefined();
    expect(normalizeTag('  # ')).toBeUndefined();
    expect(normalizeTag(42)).toBeUndefined();
    expect(normalizeTag(null)).toBeUndefined();
  });

  it('caps the length', () => {
    expect(normalizeTag('x'.repeat(100))).toHaveLength(TAG_MAX_LENGTH);
  });

  it('compares case-insensitively', () => {
    expect(sameTag('Work', 'work')).toBe(true);
    expect(sameTag('work', undefined)).toBe(false);
  });
});

describe('setTag', () => {
  it('sets, changes and clears a tag', async () => {
    const store = freshStore();
    const created = await createNote(store, { text: 'hello' });
    if (!created.ok) throw new Error('seed failed');
    const id = created.value.id;

    const tagged = await setTag(store, id, '#Work');
    expect(tagged.ok && tagged.value.tag).toBe('Work');

    const cleared = await setTag(store, id, '   ');
    expect(cleared.ok && 'tag' in cleared.value).toBe(false);
    expect((await store.getNote(id))?.tag).toBeUndefined();
  });

  it('does not make an edit open on the same note look stale', async () => {
    const store = freshStore();
    const created = await createNote(store, { text: 'hello' });
    if (!created.ok) throw new Error('seed failed');
    const { id, contentRev } = created.value;

    await setTag(store, id, 'later');
    const edited = await editNote(store, id, { html: '<p>hello again</p>', text: 'hello again' }, contentRev);
    expect(edited.ok).toBe(true);
    expect(edited.ok && edited.value.tag).toBe('later');
  });

  it('is carried onto a conflicting copy', async () => {
    const store = freshStore();
    const original = buildNote({ text: 'a', tag: 'work' });
    const copy = await saveConflictCopy(store, original, '<p>b</p>', 'b');
    expect(copy.ok && copy.value.tag).toBe('work');
  });
});

describe('tags elsewhere', () => {
  it('lists tags in use once each, sorted, first spelling winning', () => {
    const notes = [
      buildNote({ text: 'a', tag: 'work' }),
      buildNote({ text: 'b', tag: 'Work' }),
      buildNote({ text: 'c', tag: 'errands' }),
      buildNote({ text: 'd' }),
    ];
    expect(tagsInUse(notes)).toEqual(['errands', 'work']);
  });

  it('is matched by search', () => {
    const notes = [buildNote({ text: 'plain', tag: 'Recipes' }), buildNote({ text: 'other' })];
    expect(filterNotes(notes, 'recipe').map((n) => n.text)).toEqual(['plain']);
  });

  it('is read from a record, and junk is dropped', () => {
    const base = { id: 'n', html: '<p>x</p>', text: 'x', schemaVersion: SCHEMA_VERSION };
    expect(parseNote({ ...base, tag: ' #todo ' })?.tag).toBe('todo');
    expect(parseNote({ ...base, tag: { evil: true } })?.tag).toBeUndefined();
  });

  it('migrates a v3 record to the current version without inventing a tag', () => {
    const migrated = migrateRecord({ id: 'n', html: '<p>x</p>', text: 'x', rev: 2, contentRev: 2, schemaVersion: 3 });
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parseNote(migrated)?.tag).toBeUndefined();
  });

  it('survives an export and import round trip', async () => {
    const source = freshStore();
    const created = await createNote(source, { text: 'tagged' });
    if (!created.ok) throw new Error('seed failed');
    await setTag(source, created.value.id, 'keep me');

    const target = freshStore();
    const parsed = parseBackup(serializeBackup(await source.listNotes()));
    await importBackup(target, parsed, 'merge');
    expect((await target.getNote(created.value.id))?.tag).toBe('keep me');
  });
});

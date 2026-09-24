import { describe, expect, it } from 'vitest';
import { NoteStore } from '../src/lib/storage';
import { buildNote } from '../src/lib/notes';
import { noteKey, SCHEMA_VERSION } from '../src/lib/schema';
import { FakeArea, quotaError } from './fakeArea';

describe('NoteStore', () => {
  it('round-trips a note through storage', async () => {
    const area = new FakeArea();
    const store = new NoteStore(area);
    const note = buildNote({ text: 'hello', kind: 'thought' });

    const result = await store.putNote(note);
    expect(result.ok).toBe(true);

    const [loaded] = await store.listNotes();
    expect(loaded).toEqual(note);
  });

  it('reports a quota failure instead of claiming a save', async () => {
    const area = new FakeArea();
    const store = new NoteStore(area);
    area.failNextWrites = quotaError();

    const result = await store.putNote(buildNote({ text: 'too big' }));
    expect(result).toMatchObject({ ok: false, reason: 'quota' });
    expect(await store.listNotes()).toHaveLength(0);
  });

  it('refuses a stale edit and hands back the newer note', async () => {
    const area = new FakeArea();
    const store = new NoteStore(area);
    const note = buildNote({ text: 'original' });
    await store.putNote(note);

    // Another window commits first, bumping the revision.
    area.poke(noteKey(note.id), { ...note, text: 'from the other window', html: '<p>from the other window</p>', rev: 2, contentRev: 2 });

    const result = await store.updateNote(
      note.id,
      (current) => ({ ...current, text: 'mine' }),
      note.contentRev,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('conflict');
    expect(result.conflict?.text).toBe('from the other window');

    // The newer note must be untouched.
    const [stored] = await store.listNotes();
    expect(stored.text).toBe('from the other window');
  });

  it('bumps the revision on every committed write', async () => {
    const store = new NoteStore(new FakeArea());
    const note = buildNote({ text: 'v1' });
    await store.putNote(note);

    const first = await store.updateNote(note.id, (c) => ({ ...c, text: 'v2' }), 1);
    expect(first.ok && first.value.rev).toBe(2);
    const second = await store.updateNote(note.id, (c) => ({ ...c, text: 'v3' }), 2);
    expect(second.ok && second.value.rev).toBe(3);
  });

  it('serializes concurrent mutations of the same note', async () => {
    const store = new NoteStore(new FakeArea());
    const note = buildNote({ text: 'start' });
    await store.putNote(note);

    // Without the queue these interleave and one increment is lost.
    await Promise.all(
      Array.from({ length: 5 }, () =>
        store.updateNote(note.id, (current) => ({
          ...current,
          text: `${current.text}+`,
        })),
      ),
    );

    const [stored] = await store.listNotes();
    expect(stored.text).toBe('start+++++');
    expect(stored.rev).toBe(6);
  });

  it('skips an unreadable record rather than dropping it', async () => {
    const area = new FakeArea({
      'note:broken': { nothing: 'useful' },
      settings: { theme: 'dark' },
    });
    const store = new NoteStore(area);

    expect(await store.listNotes()).toHaveLength(0);
    // Still on disk, so a later version can still read it.
    expect(area.keys()).toContain('note:broken');
  });

  it('stores each note under its own key', async () => {
    const area = new FakeArea();
    const store = new NoteStore(area);
    await store.putNote(buildNote({ text: 'a' }));
    await store.putNote(buildNote({ text: 'b' }));

    expect(area.keys().filter((key) => key.startsWith('note:'))).toHaveLength(2);
  });

  it('clamps a corrupt retention setting instead of purging immediately', async () => {
    const area = new FakeArea({ settings: { theme: 'nonsense', trashRetentionDays: -5 } });
    const store = new NoteStore(area);
    const settings = await store.getSettings();

    expect(settings.theme).toBe('system');
    expect(settings.trashRetentionDays).toBe(1);
  });

  it('tags every written note with the current schema version', async () => {
    const store = new NoteStore(new FakeArea());
    const note = buildNote({ text: 'x' });
    await store.putNote(note);
    const updated = await store.updateNote(note.id, (c) => ({ ...c, text: 'y' }));
    expect(updated.ok && updated.value.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

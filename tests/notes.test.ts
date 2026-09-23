import { describe, expect, it } from 'vitest';
import {
  clearUnpinned,
  clearableNotes,
  createNote,
  DAY_MS,
  daysUntilPurge,
  deleteForever,
  editNote,
  expiredTrash,
  isActive,
  isTrashed,
  normalizeText,
  purgeExpiredTrash,
  restoreMany,
  restoreNote,
  saveConflictCopy,
  setPinned,
  sortNotes,
  trashNote,
} from '../src/lib/notes';
import { NoteStore } from '../src/lib/storage';
import { FakeArea, quotaError } from './fakeArea';

const freshStore = () => {
  const area = new FakeArea();
  return { area, store: new NoteStore(area) };
};

describe('text normalization', () => {
  it('trims the plain-text projection', () => {
    expect(normalizeText('  hello  ')).toBe('hello');
  });

  it('leaves interior whitespace alone', () => {
    expect(normalizeText('  a\n\n  b  ')).toBe('a\n\n  b');
  });
});

describe('creating notes', () => {
  it('refuses an empty note', async () => {
    const { store } = freshStore();
    const result = await createNote(store, { text: '   ' });
    expect(result.ok).toBe(false);
    expect(await store.listNotes()).toHaveLength(0);
  });

  it('keeps a link target separate from the page it was found on', async () => {
    const { store } = freshStore();
    await createNote(store, {
      text: 'Docs\nhttps://example.com/docs',
      kind: 'link',
      targetUrl: 'https://example.com/docs',
      sourceUrl: 'https://news.example.org/thread',
      sourceTitle: 'A thread',
    });
    const [note] = await store.listNotes();
    expect(note.targetUrl).toBe('https://example.com/docs');
    expect(note.sourceUrl).toBe('https://news.example.org/thread');
  });

  it('drops a javascript: URL rather than storing it', async () => {
    const { store } = freshStore();
    // eslint-disable-next-line no-script-url
    await createNote(store, { text: 'x', kind: 'link', targetUrl: 'javascript:alert(1)' });
    const [note] = await store.listNotes();
    expect(note.targetUrl).toBeUndefined();
  });
});

describe('clearing and recovery', () => {
  it('clearing moves to Trash, it does not delete', async () => {
    const { store, area } = freshStore();
    await createNote(store, { text: 'keep me' });
    const [note] = await store.listNotes();

    await trashNote(store, note.id);
    const [trashed] = await store.listNotes();

    expect(isTrashed(trashed)).toBe(true);
    expect(trashed.text).toBe('keep me');
    expect(area.keys()).toContain(`note:${note.id}`);
  });

  it('restores a trashed note with its body intact', async () => {
    const { store } = freshStore();
    await createNote(store, { text: 'oops' });
    const [note] = await store.listNotes();

    await trashNote(store, note.id);
    await restoreNote(store, note.id);

    const [restored] = await store.listNotes();
    expect(isActive(restored)).toBe(true);
    expect(restored.text).toBe('oops');
  });

  it('bulk clear skips pinned notes', async () => {
    const { store } = freshStore();
    await createNote(store, { text: 'pinned one' });
    await createNote(store, { text: 'loose one' });
    const notes = await store.listNotes();
    const pinned = notes.find((n) => n.text === 'pinned one')!;
    await setPinned(store, pinned.id, true);

    const current = await store.listNotes();
    expect(clearableNotes(current)).toHaveLength(1);

    const result = await clearUnpinned(store, current);
    expect(result.ok && result.value).toHaveLength(1);

    const after = await store.listNotes();
    expect(after.filter(isActive).map((n) => n.text)).toEqual(['pinned one']);
  });

  it('undo restores an entire cleared batch', async () => {
    const { store } = freshStore();
    for (const text of ['a', 'b', 'c']) await createNote(store, { text });

    const result = await clearUnpinned(store, await store.listNotes());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await restoreMany(store, result.value);
    const after = await store.listNotes();
    expect(after.filter(isActive)).toHaveLength(3);
    expect(after.filter(isTrashed)).toHaveLength(0);
  });

  it('undo tolerates a note deleted forever in the meantime', async () => {
    const { store } = freshStore();
    await createNote(store, { text: 'a' });
    await createNote(store, { text: 'b' });
    const result = await clearUnpinned(store, await store.listNotes());
    if (!result.ok) throw new Error('setup failed');

    await deleteForever(store, [result.value[0]]);
    const restored = await restoreMany(store, result.value);

    expect(restored.ok && restored.value).toHaveLength(1);
  });
});

describe('retention', () => {
  const now = Date.UTC(2026, 8, 23);

  it('only counts notes past the window as expired', async () => {
    const { store } = freshStore();
    await createNote(store, { text: 'recent' });
    await createNote(store, { text: 'old' });
    const notes = await store.listNotes();
    const recent = notes.find((n) => n.text === 'recent')!;
    const old = notes.find((n) => n.text === 'old')!;

    await trashNote(store, recent.id, now - 10 * DAY_MS);
    await trashNote(store, old.id, now - 31 * DAY_MS);

    const expired = expiredTrash(await store.listNotes(), 30, now);
    expect(expired.map((n) => n.text)).toEqual(['old']);
  });

  it('purge removes only expired notes', async () => {
    const { store } = freshStore();
    await createNote(store, { text: 'active' });
    await createNote(store, { text: 'old' });
    const old = (await store.listNotes()).find((n) => n.text === 'old')!;
    await trashNote(store, old.id, now - 45 * DAY_MS);

    const purged = await purgeExpiredTrash(store, 30, now);
    expect(purged).toEqual([old.id]);
    expect((await store.listNotes()).map((n) => n.text)).toEqual(['active']);
  });

  it('reports the days left to recover', async () => {
    const { store } = freshStore();
    await createNote(store, { text: 'x' });
    const [note] = await store.listNotes();
    await trashNote(store, note.id, now - 25 * DAY_MS);
    const [trashed] = await store.listNotes();

    expect(daysUntilPurge(trashed, 30, now)).toBe(5);
  });
});

describe('editing', () => {
  it('a conflicting edit is kept as a separate note, not lost', async () => {
    const { store, area } = freshStore();
    await createNote(store, { text: 'original' });
    const [note] = await store.listNotes();

    area.poke(`note:${note.id}`, { ...note, text: 'theirs', html: '<p>theirs</p>', rev: 9 });

    const attempt = await editNote(store, note.id, { html: '<p>mine</p>', text: 'mine' }, note.rev);
    expect(attempt.ok).toBe(false);
    if (attempt.ok) return;

    await saveConflictCopy(store, attempt.conflict!, '<p>mine</p>', 'mine');
    const bodies = (await store.listNotes()).map((n) => n.text).sort();
    expect(bodies).toEqual(['mine', 'theirs']);
  });

  it('a failed edit leaves the stored note untouched', async () => {
    const { store, area } = freshStore();
    await createNote(store, { text: 'safe' });
    const [note] = await store.listNotes();

    area.failNextWrites = quotaError();
    const result = await editNote(store, note.id, { html: '<p>new</p>', text: 'new' }, note.rev);
    expect(result.ok).toBe(false);

    area.failNextWrites = null;
    const [stored] = await store.listNotes();
    expect(stored.text).toBe('safe');
  });
});

describe('sorting', () => {
  it('puts pinned notes first, then most recently updated', () => {
    const base = { id: '', html: '', text: '', kind: 'thought', createdAt: 0, rev: 1, schemaVersion: 2 } as const;
    const sorted = sortNotes([
      { ...base, id: 'a', pinned: false, updatedAt: 300 },
      { ...base, id: 'b', pinned: true, updatedAt: 100 },
      { ...base, id: 'c', pinned: false, updatedAt: 500 },
      { ...base, id: 'd', pinned: true, updatedAt: 200 },
    ]);
    expect(sorted.map((n) => n.id)).toEqual(['d', 'b', 'c', 'a']);
  });
});

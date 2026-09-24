import { describe, expect, it } from 'vitest';
import { EMPTY_SNAPSHOT, shouldAdopt } from '../src/lib/draftSync';

const draft = (html: string, editingId?: string, editingRev?: number) => ({
  html,
  editingId,
  editingRev,
});

describe('shouldAdopt', () => {
  it('adopts a draft another panel wrote when this one is idle', () => {
    const synced = draft('<p>old</p>');
    expect(shouldAdopt(draft('<p>new</p>'), synced, synced)).toBe(true);
  });

  it('ignores the echo of its own write', () => {
    const mine = draft('<p>mine</p>');
    expect(shouldAdopt(mine, mine, mine)).toBe(false);
  });

  it('never replaces typing that has not been written yet', () => {
    const synced = draft('<p>old</p>');
    const local = draft('<p>old and more</p>');
    expect(shouldAdopt(draft('<p>theirs</p>'), synced, local)).toBe(false);
  });

  it('follows a draft being cleared after a commit elsewhere', () => {
    const synced = draft('<p>shared</p>');
    expect(shouldAdopt(EMPTY_SNAPSHOT, synced, synced)).toBe(true);
  });

  it('treats a change of edit target as new, even with the same text', () => {
    const synced = draft('<p>same</p>');
    expect(shouldAdopt(draft('<p>same</p>', 'note-1', 3), synced, synced)).toBe(true);
  });
});

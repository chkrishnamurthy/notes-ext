import { describe, expect, it } from 'vitest';
import { filterNotes, highlight, parseQuery, snippet } from '../src/lib/search';
import { buildNote } from '../src/lib/notes';
import type { Note } from '../src/lib/schema';

const note = (overrides: Partial<Note>): Note => ({
  ...buildNote({ text: '' }),
  ...overrides,
});

describe('query parsing', () => {
  it('splits on whitespace and lowercases', () => {
    expect(parseQuery('  Study   Recall ')).toEqual(['study', 'recall']);
  });

  it('treats an empty query as no terms', () => {
    expect(parseQuery('   ')).toEqual([]);
  });
});

describe('filtering', () => {
  const notes = [
    note({ text: 'Essay outline: compare recall with rereading' }),
    note({ text: 'Train options for Friday', sourceTitle: 'Rail departures' }),
    note({ text: 'fetch(url)', sourceUrl: 'https://developer.example.com/fetch' }),
  ];

  it('matches the note body', () => {
    expect(filterNotes(notes, 'recall')).toHaveLength(1);
  });

  it('matches the source title', () => {
    expect(filterNotes(notes, 'departures')[0].text).toBe('Train options for Friday');
  });

  it('matches inside the source URL', () => {
    expect(filterNotes(notes, 'developer.example')).toHaveLength(1);
  });

  it('requires every term to match somewhere', () => {
    expect(filterNotes(notes, 'train friday')).toHaveLength(1);
    expect(filterNotes(notes, 'train recall')).toHaveLength(0);
  });

  it('ignores case', () => {
    expect(filterNotes(notes, 'RECALL')).toHaveLength(1);
  });

  it('returns everything for an empty query', () => {
    expect(filterNotes(notes, '  ')).toHaveLength(3);
  });
});

describe('highlighting', () => {
  it('splits text into plain and matched segments', () => {
    expect(highlight('write to recall', ['recall'])).toEqual([
      { text: 'write to ', match: false },
      { text: 'recall', match: true },
    ]);
  });

  it('marks every occurrence', () => {
    const marked = highlight('ab ab ab', ['ab']).filter((s) => s.match);
    expect(marked).toHaveLength(3);
  });

  it('merges overlapping terms into one mark', () => {
    const segments = highlight('recalling', ['recall', 'call']);
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual(['recall']);
  });

  it('rejoins to the original text exactly', () => {
    const text = 'Keep a few thoughts close while you work.';
    const rejoined = highlight(text, ['thoughts', 'work'])
      .map((s) => s.text)
      .join('');
    expect(rejoined).toBe(text);
  });

  it('returns the whole string when nothing matches', () => {
    expect(highlight('nothing here', ['zebra'])).toEqual([
      { text: 'nothing here', match: false },
    ]);
  });
});

describe('snippets', () => {
  const long = `${'x'.repeat(400)} the needle ${'y'.repeat(400)}`;

  it('returns short text unchanged', () => {
    expect(snippet('short note', ['note'])).toEqual({
      text: 'short note',
      truncatedStart: false,
      truncatedEnd: false,
    });
  });

  it('windows around a match buried in a long note', () => {
    const result = snippet(long, ['needle']);
    expect(result.text).toContain('needle');
    expect(result.truncatedStart).toBe(true);
    expect(result.truncatedEnd).toBe(true);
  });

  it('keeps the opening when the match is near the start', () => {
    const result = snippet(`needle ${'z'.repeat(400)}`, ['needle']);
    expect(result.truncatedStart).toBe(false);
    expect(result.text.startsWith('needle')).toBe(true);
  });
});

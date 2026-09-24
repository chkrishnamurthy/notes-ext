/**
 * Local search across note body, tag, source title, and URLs.
 *
 * Matching is AND across whitespace-separated terms, case-insensitive, and
 * substring-based rather than prefix-based — people search for a fragment they
 * half-remember, not for a word they know starts the match.
 */

import type { Note } from './schema';

export interface Segment {
  text: string;
  match: boolean;
}

export function parseQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
}

/** Everything a query is matched against, in display order. */
export function searchableFields(note: Note): string[] {
  return [
    note.text,
    note.tag ?? '',
    note.sourceTitle ?? '',
    note.sourceUrl ?? '',
    note.targetUrl ?? '',
  ];
}

export function matchesNote(note: Note, terms: string[]): boolean {
  if (terms.length === 0) return true;
  const haystack = searchableFields(note).join('\n').toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function filterNotes(notes: Note[], query: string): Note[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return notes;
  return notes.filter((note) => matchesNote(note, terms));
}

/**
 * Split `text` into alternating plain and matched segments so the UI can wrap
 * matches in <mark> without ever setting innerHTML.
 */
export function highlight(text: string, terms: string[]): Segment[] {
  if (terms.length === 0 || !text) return [{ text, match: false }];

  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    let from = 0;
    while (from <= lower.length - term.length) {
      const at = lower.indexOf(term, from);
      if (at < 0) break;
      ranges.push([at, at + term.length]);
      from = at + term.length;
    }
  }
  if (ranges.length === 0) return [{ text, match: false }];

  // Merge overlaps so two terms hitting the same span produce one <mark>.
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [ranges[0]];
  for (const [start, end] of ranges.slice(1)) {
    const last = merged[merged.length - 1];
    if (start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}

export const SNIPPET_RADIUS = 90;

/**
 * When the first match sits deep inside a long note, return a window around it
 * so the list shows why the note matched instead of its unrelated opening.
 * Returns the original text unchanged when no trimming is warranted.
 */
export function snippet(
  text: string,
  terms: string[],
  radius = SNIPPET_RADIUS,
): { text: string; truncatedStart: boolean; truncatedEnd: boolean } {
  const limit = radius * 2;
  if (terms.length === 0 || text.length <= limit) {
    return { text, truncatedStart: false, truncatedEnd: false };
  }

  const lower = text.toLowerCase();
  let first = -1;
  for (const term of terms) {
    const at = lower.indexOf(term);
    if (at >= 0 && (first < 0 || at < first)) first = at;
  }
  if (first < 0 || first <= radius) {
    return { text: text.slice(0, limit), truncatedStart: false, truncatedEnd: text.length > limit };
  }

  // Start at a word boundary where one is close by, so the snippet reads well.
  let start = Math.max(0, first - radius);
  const boundary = text.indexOf(' ', start);
  if (boundary >= 0 && boundary - start < 20) start = boundary + 1;
  const end = Math.min(text.length, start + limit);

  return {
    text: text.slice(start, end),
    truncatedStart: start > 0,
    truncatedEnd: end < text.length,
  };
}

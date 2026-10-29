/**
 * Local search across note body, tag, source title, and URLs.
 *
 * Matching is AND across whitespace-separated terms. Each term matches as a
 * substring — people search for a fragment they half-remember, not for a word
 * they know starts the match — ignoring case and accents. A term of four or
 * more letters also matches a word that is one typo away from it, so
 * "recal" finds "recall" and "recalll" does too.
 *
 * Results are ranked: a tag or title hit outranks a body hit, and a match at
 * the start of a word outranks one in the middle of it.
 */

import type { Note } from './schema';

export interface Segment {
  text: string;
  match: boolean;
}

/** Combining diacritical marks, the only ones folded away. Kana voicing marks and the like carry meaning. */
const COMBINING_ACCENTS = /^[̀-ͯ]+$/;

/**
 * Lowercase and strip accents, one character at a time so the result is
 * exactly as long as the input. Match positions found in folded text can then
 * be used to cut the original text, which is what highlighting does.
 */
export function fold(text: string): string {
  // Plain ASCII is by far the commonest case and needs only lowercasing.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7f]*$/.test(text)) return text.toLowerCase();

  let out = '';
  for (const char of text) {
    let folded = char.toLowerCase();
    if (folded.length !== char.length) folded = char;
    const decomposed = folded.normalize('NFD');
    if (decomposed.length > folded.length) {
      const base = decomposed.slice(0, folded.length);
      if (COMBINING_ACCENTS.test(decomposed.slice(folded.length))) folded = base;
    }
    out += folded;
  }
  return out;
}

export function parseQuery(query: string): string[] {
  return fold(query)
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

/** How much a hit in each field counts, in the order `searchableFields` returns them. */
const FIELD_WEIGHTS = [4, 8, 6, 2, 2];

/** Index in `searchableFields` where the web addresses begin. */
const URL_FIELDS_FROM = 3;

/** Shortest term that is allowed to match with a typo; shorter ones would match nearly anything. */
const MIN_FUZZY_TERM = 4;

/** Longest stretch of a field scanned for typo matches, to keep a keystroke cheap on a huge note. */
const MAX_FUZZY_SCAN = 5000;

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;
const isWordChar = (char: string | undefined): boolean => char !== undefined && /[\p{L}\p{N}]/u.test(char);

/** True when `a` and `b` differ by at most one insertion, deletion, substitution or swap. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

/** Words in `folded` that are one typo away from `term`. */
function typoWords(folded: string, term: string): string[] {
  if (term.length < MIN_FUZZY_TERM) return [];
  const found = new Set<string>();
  for (const word of folded.slice(0, MAX_FUZZY_SCAN).split(WORD_SPLIT)) {
    if (word.length >= 3 && word !== term && withinOneEdit(word, term)) found.add(word);
  }
  return [...found];
}

/** Folded copies of a note's fields. Notes are replaced, never edited in place, so this is safe to keep. */
const foldedCache = new WeakMap<Note, string[]>();

function foldedFields(note: Note): string[] {
  let fields = foldedCache.get(note);
  if (!fields) {
    fields = searchableFields(note).map(fold);
    foldedCache.set(note, fields);
  }
  return fields;
}

/** The score one term earns in one field: 0 for no match. */
function fieldScore(field: string, term: string, weight: number, index: number): number {
  const at = field.indexOf(term);
  if (at >= 0) {
    let score = weight;
    if (at === 0 || !isWordChar(field[at - 1])) score += weight / 2;
    if (index === 0 && at < 100) score += 1;
    return score;
  }
  // Addresses are not prose; a typo match inside one is only noise.
  if (index >= URL_FIELDS_FROM) return 0;
  return typoWords(field, term).length > 0 ? weight * 0.4 : 0;
}

/**
 * How well a note matches every term, or 0 when any term matches nowhere.
 * A term counts once, at its best field.
 */
export function scoreNote(note: Note, terms: string[]): number {
  if (terms.length === 0) return 1;
  const fields = foldedFields(note);
  let total = 0;
  for (const term of terms) {
    let best = 0;
    fields.forEach((field, index) => {
      if (!field) return;
      best = Math.max(best, fieldScore(field, term, FIELD_WEIGHTS[index] ?? 1, index));
    });
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

export function matchesNote(note: Note, terms: string[]): boolean {
  return scoreNote(note, terms) > 0;
}

/**
 * The notes that match, best first. Ties keep the order they came in, so a
 * list already sorted by pin and recency stays that way among equal matches.
 */
export function rankNotes(notes: Note[], terms: string[]): Note[] {
  if (terms.length === 0) return notes;
  return notes
    .map((note, order) => ({ note, order, score: scoreNote(note, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((entry) => entry.note);
}

export function filterNotes(notes: Note[], query: string): Note[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return notes;
  return rankNotes(notes, terms);
}

/**
 * What to look for in `folded`: each term itself where it appears, otherwise
 * the words one typo away from it, so a fuzzy match is highlighted too.
 */
function resolveTerms(folded: string, terms: string[]): string[] {
  const out: string[] = [];
  for (const term of terms) {
    if (folded.includes(term)) out.push(term);
    else out.push(...typoWords(folded, term));
  }
  return out;
}

/**
 * Split `text` into alternating plain and matched segments so the UI can wrap
 * matches in <mark> without ever setting innerHTML.
 */
export function highlight(text: string, terms: string[]): Segment[] {
  if (terms.length === 0 || !text) return [{ text, match: false }];

  const folded = fold(text);
  const ranges: Array<[number, number]> = [];
  for (const term of resolveTerms(folded, terms)) {
    let from = 0;
    while (from <= folded.length - term.length) {
      const at = folded.indexOf(term, from);
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

  const folded = fold(text);
  let first = -1;
  for (const term of resolveTerms(folded, terms)) {
    const at = folded.indexOf(term);
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

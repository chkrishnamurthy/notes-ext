import { describe, expect, it } from 'vitest';
import { buildNote } from '../src/lib/notes';
import { markdownZipFilename, notesToMarkdownFiles } from '../src/lib/markdown';
import { buildZip, crc32 } from '../src/lib/zip';

/** Read a stored-method archive back, as an unzip tool would, from its central directory. */
function readZip(bytes: Uint8Array): Array<{ name: string; content: string; crc: number }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = bytes.length - 22;
  expect(view.getUint32(end, true)).toBe(0x06054b50);
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    expect(view.getUint16(at + 10, true)).toBe(0); // stored
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    expect(view.getUint32(localAt, true)).toBe(0x04034b50);
    const localName = view.getUint16(localAt + 26, true);
    const start = localAt + 30 + localName;
    const data = bytes.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    out.push({ name, content: decoder.decode(data), crc });
    at += 46 + nameLength;
  }
  return out;
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('zip writer', () => {
  it('round-trips names and contents, including non-Latin text', () => {
    const entries = [
      { name: 'a.md', content: 'first' },
      { name: 'café 日本語.md', content: 'second\nline' },
      { name: 'empty.md', content: '' },
    ];
    expect(readZip(buildZip(entries)).map(({ name, content }) => ({ name, content }))).toEqual(entries);
  });

  it('makes an empty but valid archive from no files', () => {
    expect(readZip(buildZip([]))).toEqual([]);
  });
});

describe('Markdown files', () => {
  const at = (day: number, text: string, extra = {}) => ({
    ...buildNote({ text }, new Date(2026, 8, day, 12).getTime()),
    ...extra,
  });

  it('names each note for its day and first line', () => {
    const files = notesToMarkdownFiles([at(23, 'Essay outline\nmore detail')]);
    expect(files.map((f) => f.name)).toEqual(['2026-09-23 Essay outline.md']);
    expect(files[0].content).toContain('Essay outline');
  });

  it('removes characters a file system would refuse', () => {
    const [file] = notesToMarkdownFiles([at(23, 'what/is: this? <a>*|"x"')]);
    expect(file.name).toBe('2026-09-23 what is this a x.md');
  });

  it('never starts a name with a dot and keeps it short', () => {
    const [dotted] = notesToMarkdownFiles([at(23, '...hidden')]);
    expect(dotted.name).toBe('2026-09-23 hidden.md');
    const [long] = notesToMarkdownFiles([at(23, 'x'.repeat(300))]);
    expect(long.name.length).toBeLessThan(80);
  });

  it('numbers notes whose names would collide', () => {
    const files = notesToMarkdownFiles([at(23, 'Same'), at(23, 'same'), at(23, 'Same')]);
    expect(new Set(files.map((f) => f.name.toLowerCase())).size).toBe(3);
    expect(files.map((f) => f.name.toLowerCase())).toContain('2026-09-23 same (2).md');
  });

  it('leaves out notes in Trash', () => {
    const files = notesToMarkdownFiles([at(23, 'kept'), at(23, 'gone', { deletedAt: 1 })]);
    expect(files).toHaveLength(1);
  });

  it('falls back to a plain name for a note with no usable first line', () => {
    const [file] = notesToMarkdownFiles([at(23, '///')]);
    expect(file.name).toBe('2026-09-23 note.md');
  });

  it('names the archive for the day', () => {
    expect(markdownZipFilename(new Date(2026, 0, 5, 23).getTime())).toBe('holdpad-notes-2026-01-05.zip');
  });
});

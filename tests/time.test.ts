import { describe, expect, it } from 'vitest';
import { dayOffset, formatBytes, formatTimestamp, formatUrl, groupFor } from '../src/lib/time';

const at = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m, d, h, min).getTime();

describe('grouping', () => {
  const now = at(2026, 8, 23, 15);

  it('groups by calendar day, not by elapsed hours', () => {
    // 11pm yesterday is 16 hours ago but still belongs under "Yesterday".
    expect(groupFor(at(2026, 8, 22, 23), false, now)).toBe('Yesterday');
    expect(dayOffset(at(2026, 8, 22, 23), now)).toBe(1);
  });

  it('puts pinned notes in their own group regardless of age', () => {
    expect(groupFor(at(2020, 0, 1), true, now)).toBe('Pinned');
  });

  it('labels anything older than yesterday as Earlier', () => {
    expect(groupFor(at(2026, 8, 20), false, now)).toBe('Earlier');
  });
});

describe('timestamps', () => {
  const now = at(2026, 8, 23, 15);

  it('says "Just now" within the first minute', () => {
    expect(formatTimestamp(now - 30_000, now)).toBe('Just now');
  });

  it('prefixes today and yesterday', () => {
    expect(formatTimestamp(at(2026, 8, 23, 9, 12), now)).toMatch(/^Today · /);
    expect(formatTimestamp(at(2026, 8, 22, 17, 30), now)).toMatch(/^Yesterday · /);
  });

  it('falls back to a date for older notes', () => {
    const label = formatTimestamp(at(2026, 8, 12, 9, 12), now);
    expect(label).not.toMatch(/Today|Yesterday/);
    expect(label).toContain('12');
  });
});

describe('URL display', () => {
  it('drops the scheme and www', () => {
    expect(formatUrl('https://www.example.edu/learning/recall')).toBe(
      'example.edu / learning / recall',
    );
  });

  it('shows the host alone for a root URL', () => {
    expect(formatUrl('https://example.com/')).toBe('example.com');
  });

  it('truncates a deep path', () => {
    expect(formatUrl('https://example.com/a/b/c/d/e')).toBe('example.com / a / b / c / …');
  });

  it('returns unparseable input unchanged', () => {
    expect(formatUrl('not a url')).toBe('not a url');
  });
});

describe('byte formatting', () => {
  it('scales the unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

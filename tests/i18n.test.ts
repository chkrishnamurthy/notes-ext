import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { plural, t, tParts } from '../src/lib/i18n';

type Catalogue = Record<string, { message: string; description?: string }>;

const root = join(__dirname, '../src/public/_locales');
const read = (locale: string): Catalogue =>
  JSON.parse(readFileSync(join(root, locale, 'messages.json'), 'utf8')) as Catalogue;

const english = read('en');
const locales = readdirSync(root).filter((name) => name !== 'en');
const placeholders = (text: string) => [...new Set(text.match(/\$[1-9]/g) ?? [])].sort();

describe('the string catalogues', () => {
  it('ship the languages the roadmap names', () => {
    expect(locales.sort()).toEqual(['de', 'es', 'fr', 'hi', 'id', 'ja', 'pt_BR']);
  });

  it.each(locales)('%s has exactly the English keys', (locale) => {
    expect(Object.keys(read(locale)).sort()).toEqual(Object.keys(english).sort());
  });

  it.each(locales)('%s keeps every placeholder, and no message is empty', (locale) => {
    const catalogue = read(locale);
    for (const [key, { message }] of Object.entries(english)) {
      const translated = catalogue[key]?.message ?? '';
      expect(translated.trim(), `${locale}.${key}`).not.toBe('');
      expect(placeholders(translated), `${locale}.${key}`).toEqual(placeholders(message));
    }
  });

  it.each(['en', ...locales])('%s fits the Chrome Web Store limits', (locale) => {
    const catalogue = read(locale);
    expect(catalogue.extName.message.length).toBeLessThanOrEqual(45);
    expect(catalogue.extDescription.message.length).toBeLessThanOrEqual(132);
    // The product name is a name: it is not translated.
    expect(catalogue.extName.message).toBe(english.extName.message);
  });

  it('covers every message the manifest refers to', () => {
    const manifest = readFileSync(join(__dirname, '../src/public/manifest.json'), 'utf8');
    const used = [...manifest.matchAll(/__MSG_(\w+)__/g)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const key of used) expect(english[key], key).toBeDefined();
  });
});

describe('t and plural', () => {
  it('fills placeholders', () => {
    expect(t('notSavedReason', 'disk full')).toBe('Not saved — disk full');
  });

  it('picks the one or other form, with the count as $1 in other', () => {
    expect(plural(1, 'matchingOne', 'matchingOther')).toBe('1 matching note');
    expect(plural(4, 'matchingOne', 'matchingOther')).toBe('4 matching notes');
    expect(plural(1, 'movedManyOne', 'movedManyOther', 30)).toBe(
      '1 note moved to Trash · recover for 30 days',
    );
    expect(plural(3, 'movedManyOne', 'movedManyOther', 30)).toBe(
      '3 notes moved to Trash · recover for 30 days',
    );
  });

  it('splits a message around the parts that are not text', () => {
    const bold = { bold: true };
    expect(tParts('storageP1', bold)[0]).toBe('Notes are stored on this device by ');
    expect(tParts('storageP1', bold)[1]).toBe(bold);
  });
});

import { describe, expect, it } from 'vitest';
import {
  captureFrom,
  MAX_CAPTURE_LENGTH,
  MENU_LINK,
  MENU_PAGE,
  MENU_SELECTION,
} from '../src/lib/capture';

const tab = { url: 'https://example.edu/learning/recall', title: 'The Learning Notebook' };

describe('selection capture', () => {
  it('saves the selected text with its source', () => {
    const input = captureFrom(
      {
        menuItemId: MENU_SELECTION,
        selectionText: 'After reading, write down what you can recall.',
        pageUrl: tab.url,
      },
      tab,
    );
    expect(input).toEqual({
      text: 'After reading, write down what you can recall.',
      kind: 'selection',
      sourceUrl: tab.url,
      sourceTitle: tab.title,
    });
  });

  it('saves nothing when the selection is only whitespace', () => {
    expect(captureFrom({ menuItemId: MENU_SELECTION, selectionText: '   \n ' }, tab)).toBeNull();
  });

  it('caps a runaway selection', () => {
    const input = captureFrom(
      { menuItemId: MENU_SELECTION, selectionText: 'x'.repeat(MAX_CAPTURE_LENGTH + 5000) },
      tab,
    );
    expect(input?.text).toHaveLength(MAX_CAPTURE_LENGTH);
  });

  it('still captures on a page whose title is unavailable', () => {
    const input = captureFrom({
      menuItemId: MENU_SELECTION,
      selectionText: 'text from a restricted page',
      pageUrl: 'https://example.com/',
    });
    expect(input?.text).toBe('text from a restricted page');
    expect(input?.sourceTitle).toBeUndefined();
  });
});

describe('link capture', () => {
  it('keeps the link target distinct from the page it was found on', () => {
    const input = captureFrom(
      {
        menuItemId: MENU_LINK,
        linkUrl: 'https://docs.example.com/api',
        selectionText: 'API reference',
        pageUrl: tab.url,
      },
      tab,
    );
    expect(input?.kind).toBe('link');
    expect(input?.targetUrl).toBe('https://docs.example.com/api');
    expect(input?.sourceUrl).toBe(tab.url);
    expect(input?.text).toBe('API reference\nhttps://docs.example.com/api');
  });

  it('falls back to the bare URL when there is no link text', () => {
    const input = captureFrom(
      { menuItemId: MENU_LINK, linkUrl: 'https://docs.example.com/api' },
      tab,
    );
    expect(input?.text).toBe('https://docs.example.com/api');
  });

  it('saves nothing without a link URL', () => {
    expect(captureFrom({ menuItemId: MENU_LINK }, tab)).toBeNull();
  });
});

describe('page capture', () => {
  it('saves the title and URL', () => {
    const input = captureFrom({ menuItemId: MENU_PAGE, pageUrl: tab.url }, tab);
    expect(input?.text).toBe(`${tab.title}\n${tab.url}`);
    expect(input?.kind).toBe('page');
  });

  it('saves nothing when no URL is available at all', () => {
    expect(captureFrom({ menuItemId: MENU_PAGE }, {})).toBeNull();
  });
});

it('ignores a menu id it does not own', () => {
  expect(captureFrom({ menuItemId: 'some-other-extension' }, tab)).toBeNull();
});

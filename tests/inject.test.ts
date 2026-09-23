import { describe, expect, it } from 'vitest';
import { canInject } from '../src/lib/inject';

describe('where the overlay can be injected', () => {
  it('allows ordinary web pages', () => {
    expect(canInject('https://example.com/article')).toBe(true);
    expect(canInject('http://localhost:3000/')).toBe(true);
  });

  it('allows local files', () => {
    expect(canInject('file:///Users/someone/notes.html')).toBe(true);
  });

  it('refuses Chrome’s own pages', () => {
    expect(canInject('chrome://extensions/')).toBe(false);
    expect(canInject('chrome://newtab/')).toBe(false);
    expect(canInject('chrome-untrusted://foo')).toBe(false);
  });

  it('refuses other extensions', () => {
    expect(canInject('chrome-extension://abcdef/page.html')).toBe(false);
  });

  it('refuses the Web Store, which Chrome blocks even over https', () => {
    expect(canInject('https://chromewebstore.google.com/detail/x')).toBe(false);
    expect(canInject('https://chrome.google.com/webstore')).toBe(false);
  });

  it('refuses view-source, data and about URLs', () => {
    expect(canInject('view-source:https://example.com')).toBe(false);
    expect(canInject('data:text/html,<p>hi</p>')).toBe(false);
    expect(canInject('about:blank')).toBe(false);
  });

  it('refuses a missing or unparseable URL', () => {
    expect(canInject(undefined)).toBe(false);
    expect(canInject('')).toBe(false);
    expect(canInject('not a url')).toBe(false);
  });
});

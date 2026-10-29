import { describe, expect, it } from 'vitest';
import { blocksNetwork, summarizeAccess } from '../src/lib/trust';

describe('network policy', () => {
  it('is blocked when connect-src is none', () => {
    expect(blocksNetwork("script-src 'self'; connect-src 'none'; img-src 'self'")).toBe(true);
    expect(blocksNetwork("connect-src 'none'")).toBe(true);
  });

  it('is not blocked when connections are allowed somewhere', () => {
    expect(blocksNetwork("connect-src 'self' https://example.com")).toBe(false);
    expect(blocksNetwork("connect-src 'none' https://example.com")).toBe(false);
  });

  it('is not claimed when there is no connect-src or no policy', () => {
    expect(blocksNetwork("default-src 'none'")).toBe(false);
    expect(blocksNetwork('')).toBe(false);
    expect(blocksNetwork(undefined)).toBe(false);
  });

  it('does not mistake a similar directive for connect-src', () => {
    expect(blocksNetwork("my-connect-src 'none'")).toBe(false);
  });
});

describe('access summary', () => {
  it('lists permissions in a stable order', () => {
    expect(summarizeAccess({ permissions: ['storage', 'activeTab', 'sidePanel'] }).permissions).toEqual([
      'activeTab',
      'sidePanel',
      'storage',
    ]);
  });

  it('reports no site access by default', () => {
    expect(summarizeAccess({ permissions: ['storage'] })).toEqual({
      permissions: ['storage'],
      allSites: false,
      hosts: [],
    });
  });

  it('recognises access to every site however Chrome spells it', () => {
    for (const origin of ['<all_urls>', '*://*/*', 'https://*/*']) {
      expect(summarizeAccess({ origins: [origin] }).allSites).toBe(true);
    }
  });

  it('keeps narrower grants as hosts', () => {
    const summary = summarizeAccess({ origins: ['https://example.com/*'] });
    expect(summary.allSites).toBe(false);
    expect(summary.hosts).toEqual(['https://example.com/*']);
  });
});

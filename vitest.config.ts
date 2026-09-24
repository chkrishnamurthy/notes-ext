import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The sanitizer and the plain-text projection parse HTML, so the unit
    // tests need a DOM. Service-worker code paths never touch one; that is
    // asserted separately in tests/no-dom.test.ts.
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    // An English chrome.i18n, so code that reads its strings runs as it does
    // in the browser.
    setupFiles: ['tests/setup.ts'],
  },
});

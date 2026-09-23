import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The sanitizer and the plain-text projection parse HTML, so the unit
    // tests need a DOM. Service-worker code paths never touch one; that is
    // asserted separately in tests/no-dom.test.ts.
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});

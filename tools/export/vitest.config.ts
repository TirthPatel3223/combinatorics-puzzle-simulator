import { defineConfig } from 'vitest/config';

/** Runs the geometry exporter and the solution replay (not part of the normal test suite). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tools/export/*.gen.ts'],
    testTimeout: 600_000,
  },
});

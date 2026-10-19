import { defineConfig } from 'vitest/config';

// Los ficheros se llaman *.integration.ts (no *.test.ts) para que el
// `vitest run` de la raíz no los recoja: estos necesitan Docker.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['**/*.integration.ts'],
    exclude: ['node_modules/**'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});

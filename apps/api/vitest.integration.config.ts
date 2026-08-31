import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.integration-spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});

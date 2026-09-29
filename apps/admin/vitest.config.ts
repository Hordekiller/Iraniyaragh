import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    env: {
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
    },
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['dist/**', 'node_modules/**'],
    setupFiles: ['src/test/setup.ts'],
    passWithNoTests: false,
    clearMocks: true,
    restoreMocks: true,
    // The admin views render a full data table plus their dialogs in jsdom, and
    // a view-level test has to await the list load, the detail dialog and the
    // panel dialog in sequence. That costs about a second on a workstation and
    // several times more on a loaded CI runner, which pushed view tests past
    // Vitest's 5s default. The tests are slow, not hung, so the budget is
    // raised instead of padding individual tests with timeouts.
    testTimeout: 20_000,
    coverage: {
      enabled: process.env.CI === 'true',
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      exclude: ['**/*.test.{ts,tsx}'],
      thresholds: {
        lines: 80,
        statements: 75,
        functions: 72,
        branches: 60,
      },
    },
  },
})

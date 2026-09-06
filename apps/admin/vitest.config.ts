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
    coverage: {
      enabled: process.env.CI === 'true',
      provider: 'v8',
      reporter: ['text', 'json-summary'],
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

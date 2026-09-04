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
  },
})

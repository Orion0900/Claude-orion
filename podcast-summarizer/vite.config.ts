import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'web',
  // Relative paths so the same build works at a domain root or under a sub-path.
  base: './',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: {
    host: true,
    // In dev the API runs separately; forward so the phone only needs one URL.
    proxy: { '/api': 'http://localhost:8787' },
  },
  test: { globals: true, environment: 'node', include: ['../server/**/*.test.ts', 'src/**/*.test.ts'] },
})

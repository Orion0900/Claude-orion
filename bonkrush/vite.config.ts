import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative paths so the same build works at a domain root or under a
  // GitHub Pages sub-path like /Claude-orion/bonkrush/.
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
})

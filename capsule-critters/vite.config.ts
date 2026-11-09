import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative paths so the same build works at a domain root or under a
  // GitHub Pages sub-path like /Claude-orion/tidebound/.
  base: './',
  // Every sprite and song is generated in code, so the one bundle is the whole game.
  build: { chunkSizeWarningLimit: 1200 },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
})

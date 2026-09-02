import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative paths so the same build works at a domain root or under a
  // GitHub Pages sub-path like /Claude-orion/.
  base: './',
  plugins: [react()],
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
})

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative paths so one build works at a domain root, under a GitHub Pages
  // project path, or nested under /upscout/ next to the other app.
  base: './',
  plugins: [react()],
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
})

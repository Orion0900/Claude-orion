import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// The face landmarker's WebAssembly runtime ships inside the npm package.
// It is served from the app's own origin (never a CDN) so the analysis works
// offline and no request about a face ever leaves the phone.
const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm',
]
const require = createRequire(import.meta.url)
const wasmPath = (name: string) => require.resolve(`@mediapipe/tasks-vision/${name}`)

function mediapipeWasm(): Plugin {
  return {
    name: 'facet-mediapipe-wasm',
    configureServer(server) {
      server.middlewares.use('/mediapipe/', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0]
        if (!WASM_FILES.includes(name)) return next()
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(wasmPath(name)))
      })
    },
    generateBundle() {
      for (const name of WASM_FILES) {
        this.emitFile({ type: 'asset', fileName: `mediapipe/${name}`, source: readFileSync(wasmPath(name)) })
      }
    },
  }
}

export default defineConfig({
  // Relative paths so the same build works at a domain root or under a
  // GitHub Pages sub-path like /Claude-orion/facet/.
  base: './',
  plugins: [react(), mediapipeWasm()],
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
})

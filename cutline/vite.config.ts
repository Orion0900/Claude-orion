import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Whisper runs on onnxruntime-web, whose WebAssembly build ships inside the
// npm package. It is served from the app's own origin rather than a CDN, so
// a transcription needs nothing but the model download and works offline
// once that's cached.
const ORT_FILES = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']
const require = createRequire(import.meta.url)
const ortPath = (name: string) => require.resolve(`onnxruntime-web/${name}`)

function onnxRuntimeWasm(): Plugin {
  return {
    name: 'cutline-onnxruntime-wasm',
    configureServer(server) {
      server.middlewares.use('/ort/', (req, res, next) => {
        const name = (req.url ?? '').replace(/^\//, '').split('?')[0]
        if (!ORT_FILES.includes(name)) return next()
        res.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        res.end(readFileSync(ortPath(name)))
      })
    },
    generateBundle() {
      for (const name of ORT_FILES) {
        this.emitFile({ type: 'asset', fileName: `ort/${name}`, source: readFileSync(ortPath(name)) })
      }
    },
  }
}

export default defineConfig({
  // Relative paths so the same build works at a domain root or under a
  // GitHub Pages sub-path like /Claude-orion/cutline/.
  base: './',
  plugins: [react(), onnxRuntimeWasm()],
  worker: { format: 'es' },
  test: { globals: true, environment: 'node', include: ['src/**/*.test.ts'] },
})

// Folds the production build into one self-contained page fragment (title,
// inline styles, inline module script) for hosts that serve a single file.
// Run after `npm run build`: node scripts/build-artifact.mjs <out.html>
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const css = /href="\.\/(assets\/[^"]+\.css)"/.exec(html)?.[1]
const js = /src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1]
if (!css || !js) throw new Error('Run `npm run build` first')
const style = readFileSync(join(dist, css), 'utf8')
// A literal "</script" inside the bundle would end the inline script early.
const script = readFileSync(join(dist, js), 'utf8').replace(/<\/script/gi, '<\\/script')
const out = process.argv[2] ?? join(dist, 'fretfire-single.html')
writeFileSync(
  out,
  `<title>Fretfire</title>\n<style>\n${style}\n</style>\n<div id="app"></div>\n<script type="module">\n${script}\n</script>\n`,
)
console.log(`wrote ${out} (${Math.round((style.length + script.length) / 1024)} KB)`)

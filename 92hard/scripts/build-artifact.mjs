// Folds the production build into one self-contained page fragment (title,
// inline styles with the font embedded, inline module script) for hosts that
// serve a single file, like a preview link.
// Run after `npm run build`: node scripts/build-artifact.mjs <out.html>
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const css = /href="\.\/(assets\/[^"]+\.css)"/.exec(html)?.[1]
const js = /src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1]
if (!css || !js) throw new Error('Run `npm run build` first')
// Every browser that runs the app reads woff2, so that's the one embedded.
const style = readFileSync(join(dist, css), 'utf8')
  .replace(/,\s*url\(\.\/[^)]+\.woff\) format\(["']?woff["']?\)/g, '')
  .replace(/url\(\.\/([^)]+\.woff2)\)/g, (_, file) => {
    const font = readFileSync(join(dist, 'assets', file)).toString('base64')
    return `url(data:font/woff2;base64,${font})`
  })
// A literal "</script" inside the bundle would end the inline script early.
const script = readFileSync(join(dist, js), 'utf8').replace(/<\/script/gi, '<\\/script')
// Single-file hosts already pad the page clear of the phone's status bar,
// and can't hand a file to the viewer, so the backup button stays home.
const host = '.screen{padding-top:8px}.start{padding-top:28px}.backup-btn{display:none}.btn-row{grid-template-columns:1fr}'
const out = process.argv[2] ?? join(dist, '92hard-single.html')
writeFileSync(
  out,
  `<title>92 Hard</title>\n<style>\n${style}\n${host}\n</style>\n<div id="root"></div>\n<script type="module">\n${script}\n</script>\n`,
)
console.log(`wrote ${out} (${Math.round((style.length + script.length) / 1024)} KB)`)

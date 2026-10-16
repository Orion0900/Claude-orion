// Folds the artifact build into one self-contained page fragment (title,
// inline styles with the font embedded, inline module script) for hosts that
// serve a single file, like a Claude artifact.
// Run by `npm run artifact`, which builds into dist-artifact/ first:
//   npm run artifact -- <out.html>
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-artifact')
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const css = /href="\.\/(assets\/[^"]+\.css)"/.exec(html)?.[1]
const js = /src="\.\/(assets\/[^"]+\.js)"/.exec(html)?.[1]
if (!css || !js) throw new Error('Run `vite build --mode artifact --outDir dist-artifact` first')

// Only the Latin subset is embedded: every word and figure on screen is in
// it, and the other subsets would add a third to the page for nothing.
const style = readFileSync(join(dist, css), 'utf8').replace(/@font-face\{[^}]*\}/g, (face) => {
  const file = /url\(\.\/(archivo-latin-wdth-normal-[^)]+\.woff2)\)/.exec(face)?.[1]
  if (!file) return ''
  const font = readFileSync(join(dist, 'assets', file)).toString('base64')
  return face.replace(/url\([^)]+\)/, `url(data:font/woff2;base64,${font})`)
})
if (!style.includes('data:font/woff2')) throw new Error('The Latin font face was not found in the build')

// A literal "</script" inside the bundle would end the inline script early.
const script = readFileSync(join(dist, js), 'utf8').replace(/<\/script/gi, '<\\/script')
const out = process.argv[2] ?? join(dist, 'o-plan.html')
writeFileSync(
  out,
  `<title>O-Plan</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>\n${style}\n</style>\n<div id="root"></div>\n<script type="module">\n${script}\n</script>\n`,
)
console.log(`wrote ${out} (${Math.round((style.length + script.length) / 1024)} KB)`)

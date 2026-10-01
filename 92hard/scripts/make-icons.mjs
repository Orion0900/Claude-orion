// Draws the PWA icons in the app's own type: a black tile, a big white 92
// and HARD in volt underneath. Renders with Playwright's Chromium so the
// Anton face is the real one. Run: npm run icons
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public')
mkdirSync(out, { recursive: true })
const font = readFileSync(join(root, 'node_modules/@fontsource/anton/files/anton-latin-400-normal.woff2')).toString('base64')

/** `scale` shrinks the mark into the middle (maskable icons keep to the safe zone); `corner` rounds the tile. */
const page = (size, { scale, corner }) => `<!doctype html>
<style>
  @font-face { font-family: Anton; src: url(data:font/woff2;base64,${font}) format('woff2'); }
  html, body { margin: 0; background: transparent; }
  .tile {
    width: ${size}px; height: ${size}px; border-radius: ${corner * size}px;
    background: radial-gradient(circle at 50% 30%, #1a1a1d, #000 70%);
    display: grid; place-content: center;
  }
  .mark {
    display: grid; justify-items: center;
    font-family: Anton; line-height: 0.82; transform: scale(${scale});
  }
  .num { font-size: ${size * 0.6}px; color: #f5f5f4; letter-spacing: -0.01em; }
  .word { font-size: ${size * 0.235}px; color: #d4ff3f; letter-spacing: 0.04em; margin-top: ${size * 0.02}px; }
</style>
<div class="tile"><div class="mark"><span class="num">92</span><span class="word">HARD</span></div></div>`

const browser = await chromium.launch()
async function render(file, size, options) {
  const tab = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await tab.setContent(page(size, options))
  await tab.evaluate(() => document.fonts.ready)
  writeFileSync(join(out, file), await tab.screenshot({ omitBackground: options.corner > 0 }))
  await tab.close()
}

// iOS masks the Home Screen icon itself and wants it square and opaque.
await render('apple-touch-icon.png', 180, { scale: 1, corner: 0 })
await render('icon-192.png', 192, { scale: 1, corner: 0.22 })
await render('icon-512.png', 512, { scale: 1, corner: 0.22 })
await render('icon-maskable-512.png', 512, { scale: 0.8, corner: 0 })
await browser.close()
console.log('icons written to', out)

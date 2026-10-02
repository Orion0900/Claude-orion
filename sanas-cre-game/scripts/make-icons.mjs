// Draws the home screen icons: a night skyline in the game's sector colors,
// lit windows and a crane, on the deep navy of the dark theme. Rendered with
// Playwright's Chromium so the shapes and gradients match the game exactly.
// Run: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
mkdirSync(out, { recursive: true })

/** `scale` shrinks the skyline into the middle (maskable icons keep to the safe zone); `corner` rounds the tile. */
const page = (size, { scale, corner }) => `<!doctype html>
<style>
  html, body { margin: 0; background: transparent; }
  canvas { display: block; }
</style>
<canvas id="c" width="${size}" height="${size}"></canvas>
<script>
  const s = ${size}, k = ${scale}, r = ${corner} * s
  const c = document.getElementById('c').getContext('2d')
  c.beginPath()
  c.roundRect ? c.roundRect(0, 0, s, s, r) : c.rect(0, 0, s, s)
  c.clip()
  const sky = c.createLinearGradient(0, 0, 0, s)
  sky.addColorStop(0, '#060d1c')
  sky.addColorStop(1, '#22406f')
  c.fillStyle = sky
  c.fillRect(0, 0, s, s)
  // Stars.
  c.fillStyle = 'rgba(255,255,255,0.75)'
  for (const [x, y] of [[0.16, 0.14], [0.3, 0.24], [0.52, 0.1], [0.74, 0.2], [0.86, 0.12], [0.62, 0.3]]) c.fillRect(x * s, y * s, s * 0.012, s * 0.012)
  c.save()
  c.translate(s / 2, s / 2)
  c.scale(k, k)
  c.translate(-s / 2, -s / 2)
  const ground = s * 0.84
  // Far city.
  c.fillStyle = 'rgba(140,170,220,0.16)'
  for (const [x, w, h] of [[0.02, 0.12, 0.3], [0.13, 0.1, 0.42], [0.82, 0.12, 0.36], [0.9, 0.12, 0.28]]) c.fillRect(x * s, ground - h * s, w * s, h * s)
  const towers = [
    [0.1, 0.17, 0.34, '#d8644f'],
    [0.28, 0.15, 0.6, '#5a8fd8'],
    [0.44, 0.13, 0.46, '#a27cdb'],
    [0.58, 0.16, 0.7, '#5a8fd8'],
    [0.75, 0.16, 0.3, '#27b7a5'],
  ]
  for (const [x, w, h, color] of towers) {
    const left = x * s, top = ground - h * s, width = w * s, height = h * s
    c.fillStyle = color
    c.fillRect(left, top, width, height)
    c.fillStyle = 'rgba(0,0,0,0.18)'
    c.fillRect(left + width * 0.72, top, width * 0.28, height)
    const cols = 3, rows = Math.max(2, Math.floor(height / (s * 0.06)))
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const lit = (i * 7 + j * 3 + Math.round(x * 100)) % 5 !== 0
      c.fillStyle = lit ? '#ffcf6b' : '#18233a'
      c.fillRect(left + width * (0.14 + j * 0.27), top + s * 0.03 + i * s * 0.06, width * 0.16, s * 0.025)
    }
  }
  // A crane on the newest building.
  c.strokeStyle = '#e2a100'
  c.lineWidth = s * 0.012
  c.lineCap = 'round'
  const cx = s * 0.86, ct = ground - s * 0.5
  c.beginPath()
  c.moveTo(cx, ground - s * 0.3); c.lineTo(cx, ct)
  c.moveTo(cx - s * 0.1, ct); c.lineTo(cx + s * 0.08, ct)
  c.moveTo(cx - s * 0.07, ct); c.lineTo(cx - s * 0.07, ct + s * 0.09)
  c.stroke()
  c.fillStyle = '#ff4b3a'
  c.fillRect(s * 0.63, ground - s * 0.74, s * 0.025, s * 0.025)
  c.restore()
  // The street.
  c.fillStyle = '#0d141f'
  c.fillRect(0, ground, s, s - ground)
  c.fillStyle = 'rgba(255,255,255,0.22)'
  for (let x = 0.04; x < 1; x += 0.14) c.fillRect(x * s, ground + (s - ground) * 0.45, s * 0.07, s * 0.012)
</script>`

const browser = await chromium.launch()
async function render(file, size, options) {
  const tab = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await tab.setContent(page(size, options))
  writeFileSync(join(out, file), await tab.locator('canvas').screenshot({ omitBackground: options.corner > 0 }))
  await tab.close()
}

// iOS masks the Home Screen icon itself and wants it square and opaque.
await render('apple-touch-icon.png', 180, { scale: 1, corner: 0 })
await render('icon-192.png', 192, { scale: 1, corner: 0.22 })
await render('icon-512.png', 512, { scale: 1, corner: 0.22 })
await render('icon-maskable-512.png', 512, { scale: 0.8, corner: 0 })
await browser.close()
console.log('icons written to', out)

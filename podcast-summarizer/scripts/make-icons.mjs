// Generates the PWA icons without any image library: a rounded tile with a
// waveform and a "brief" line under it. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'public')
mkdirSync(out, { recursive: true })

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
const crc32 = (buf) => {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y)
      const i = y * (size * 3 + 1) + 1 + x * 3
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

const BG = [24, 22, 38]        // deep indigo
const ACCENT = [124, 92, 255]  // violet
const WHITE = [245, 244, 250]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

function draw(size, { maskable }) {
  const pad = maskable ? 0 : size * 0.02
  const radius = maskable ? 0 : size * 0.22
  // Waveform bars, heights as a fraction of the tile.
  const bars = [0.24, 0.42, 0.58, 0.36, 0.5, 0.3, 0.42]
  const barW = size * 0.06
  const gap = size * 0.035
  const totalW = bars.length * barW + (bars.length - 1) * gap
  const x0 = (size - totalW) / 2
  const cy = size * 0.4
  const lineY = size * 0.74
  return png(size, (x, y) => {
    // Rounded-rect mask (outside is white so the icon has a clean edge on iOS).
    const inside = (() => {
      if (maskable) return true
      const lx = x - pad, ly = y - pad, w = size - 2 * pad
      if (lx < 0 || ly < 0 || lx >= w || ly >= w) return false
      const cx = Math.min(Math.max(lx, radius), w - radius)
      const cyy = Math.min(Math.max(ly, radius), w - radius)
      return (lx - cx) ** 2 + (ly - cyy) ** 2 <= radius ** 2
    })()
    if (!inside) return WHITE
    // Vertical gradient background.
    let color = mix(BG, [40, 34, 70], y / size)
    for (let i = 0; i < bars.length; i++) {
      const bx = x0 + i * (barW + gap)
      const h = bars[i] * size * (maskable ? 0.8 : 1)
      const top = cy - h / 2, bottom = cy + h / 2
      if (x >= bx && x < bx + barW && y >= top && y < bottom) {
        const r = barW / 2
        const edge = Math.min(y - top, bottom - y)
        if (edge < r) {
          const dx = x - (bx + r)
          const dy = r - edge
          if (dx * dx + dy * dy > r * r) continue
        }
        color = mix(ACCENT, WHITE, i / (bars.length * 2))
      }
    }
    // The "brief": two lines of text suggested under the wave.
    const lw = size * 0.44
    if (y >= lineY && y < lineY + size * 0.035 && x >= (size - lw) / 2 && x < (size + lw) / 2) color = WHITE
    if (y >= lineY + size * 0.065 && y < lineY + size * 0.1 && x >= (size - lw * 0.6) / 2 && x < (size + lw * 0.6) / 2) color = mix(WHITE, BG, 0.4)
    return color
  })
}

writeFileSync(join(out, 'apple-touch-icon.png'), draw(180, { maskable: true }))
writeFileSync(join(out, 'icon-192.png'), draw(192, { maskable: false }))
writeFileSync(join(out, 'icon-512.png'), draw(512, { maskable: false }))
writeFileSync(join(out, 'icon-maskable-512.png'), draw(512, { maskable: true }))
console.log('icons written to', out)

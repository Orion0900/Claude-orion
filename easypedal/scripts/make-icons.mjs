// Generates the PWA icons without any image library: a rounded green tile
// with a bicycle drawn from two wheels and a frame. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
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
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const BG = [15, 17, 21]
const BG_LIGHT = [24, 40, 30]
const ACCENT = [74, 222, 128]
const WHITE = [232, 234, 240]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

/** Distance from a point to a line segment. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

function draw(size, { maskable }) {
  const pad = maskable ? 0 : size * 0.02
  const radius = maskable ? 0 : size * 0.22
  // Maskable icons get cropped to a circle, so the drawing sits well inside.
  const scale = maskable ? 0.78 : 0.92
  const u = (v) => size / 2 + (v - 0.5) * size * scale

  // The bicycle, in unit coordinates.
  const wheelR = 0.17
  const left = { x: 0.27, y: 0.66 }
  const right = { x: 0.73, y: 0.66 }
  const seat = { x: 0.4, y: 0.34 }
  const crank = { x: 0.5, y: 0.66 }
  const bars = { x: 0.64, y: 0.32 }
  const frame = [
    [left, seat],
    [seat, crank],
    [left, crank],
    [crank, bars],
    [seat, bars],
    [bars, right],
    [{ x: 0.36, y: 0.32 }, { x: 0.44, y: 0.32 }], // saddle
    [{ x: 0.6, y: 0.29 }, { x: 0.69, y: 0.31 }], // handlebars
  ]
  const stroke = size * 0.045 * scale
  const rim = size * 0.035 * scale

  return png(size, (x, y) => {
    const inside = (() => {
      if (maskable) return true
      const lx = x - pad
      const ly = y - pad
      const w = size - 2 * pad
      if (lx < 0 || ly < 0 || lx >= w || ly >= w) return false
      const cx = Math.min(Math.max(lx, radius), w - radius)
      const cy = Math.min(Math.max(ly, radius), w - radius)
      return (lx - cx) ** 2 + (ly - cy) ** 2 <= radius ** 2
    })()
    if (!inside) return WHITE

    let color = mix(BG, BG_LIGHT, y / size)

    // Wheels: a ring of accent colour.
    for (const wheel of [left, right]) {
      const d = Math.hypot(x - u(wheel.x), y - u(wheel.y))
      const r = wheelR * size * scale
      if (Math.abs(d - r) <= rim / 2) color = ACCENT
      if (d <= size * 0.02 * scale) color = ACCENT
    }
    // Frame: white strokes.
    for (const [a, b] of frame) {
      if (segmentDistance(x, y, u(a.x), u(a.y), u(b.x), u(b.y)) <= stroke / 2) color = WHITE
    }
    return color
  })
}

writeFileSync(join(out, 'apple-touch-icon.png'), draw(180, { maskable: true }))
writeFileSync(join(out, 'icon-192.png'), draw(192, { maskable: false }))
writeFileSync(join(out, 'icon-512.png'), draw(512, { maskable: false }))
writeFileSync(join(out, 'icon-maskable-512.png'), draw(512, { maskable: true }))
console.log('icons written to', out)

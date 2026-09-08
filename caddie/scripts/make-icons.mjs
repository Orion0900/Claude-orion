// Generates the PWA icons without any image library: a rounded green tile
// with a flag in a hole. Run: node scripts/make-icons.mjs
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

const GREEN = [22, 101, 52]
const GREEN_LIGHT = [34, 140, 70]
const WHITE = [255, 255, 255]
const RED = [248, 113, 113]
const DARK = [15, 17, 21]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

function draw(size, { maskable }) {
  const pad = maskable ? 0 : size * 0.02
  const radius = maskable ? 0 : size * 0.22
  const scale = maskable ? 0.72 : 0.88
  const u = (v) => size / 2 + (v - 0.5) * size * scale

  // Flag in unit coordinates: a pole with a pennant, standing in a hole.
  const pole = { x: 0.42, top: 0.16, bottom: 0.78 }
  const poleW = size * 0.05 * scale
  const flag = { left: 0.42, right: 0.78, top: 0.16, bottom: 0.42 }
  const hole = { cx: 0.5, cy: 0.8, rx: 0.2, ry: 0.07 }

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

    let color = mix(GREEN, GREEN_LIGHT, y / size)

    // The hole: a dark ellipse.
    const ex = (x - u(hole.cx)) / (hole.rx * size * scale)
    const ey = (y - u(hole.cy)) / (hole.ry * size * scale)
    if (ex * ex + ey * ey <= 1) color = DARK

    // The pennant: a triangle pointing right.
    const fx = (x - u(flag.left)) / (u(flag.right) - u(flag.left))
    const fy = (y - u(flag.top)) / (u(flag.bottom) - u(flag.top))
    if (fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1 && Math.abs(fy - 0.5) <= (1 - fx) / 2) color = RED

    // The pole.
    if (Math.abs(x - u(pole.x)) <= poleW / 2 && y >= u(pole.top) && y <= u(pole.bottom)) color = WHITE
    return color
  })
}

writeFileSync(join(out, 'apple-touch-icon.png'), draw(180, { maskable: true }))
writeFileSync(join(out, 'icon-192.png'), draw(192, { maskable: false }))
writeFileSync(join(out, 'icon-512.png'), draw(512, { maskable: false }))
writeFileSync(join(out, 'icon-maskable-512.png'), draw(512, { maskable: true }))
console.log('icons written to', out)

// Generates the PWA icons without any image library: a violet tile with a
// yellow impact star and a wooden mallet mid-bonk. Run: node scripts/make-icons.mjs
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

const VIOLET_DARK = [34, 20, 78]
const VIOLET = [108, 43, 217]
const YELLOW = [255, 210, 63]
const ORANGE = [255, 138, 61]
const WOOD = [150, 92, 48]
const WOOD_DARK = [96, 56, 28]
const OUTLINE = [20, 12, 40]
const WHITE = [255, 255, 255]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

/** Inside a rectangle of half-size (hw, hh) centred at (cx, cy), rotated by angle. */
function inRotRect(x, y, cx, cy, hw, hh, angle) {
  const dx = x - cx
  const dy = y - cy
  const c = Math.cos(-angle)
  const s = Math.sin(-angle)
  const lx = dx * c - dy * s
  const ly = dx * s + dy * c
  return Math.abs(lx) <= hw && Math.abs(ly) <= hh
}

function draw(size, { maskable }) {
  const radius = maskable ? 0 : size * 0.22
  const scale = maskable ? 0.74 : 0.9
  const u = (v) => size / 2 + (v - 0.5) * size * scale
  const k = size * scale

  return png(size, (x, y) => {
    if (!maskable) {
      const cx = Math.min(Math.max(x, radius), size - radius)
      const cy = Math.min(Math.max(y, radius), size - radius)
      if ((x - cx) ** 2 + (y - cy) ** 2 > radius ** 2) return WHITE
    }
    let color = mix(VIOLET, VIOLET_DARK, y / size)

    // Impact star: a spiky burst behind the mallet head.
    const sx = x - u(0.31)
    const sy = y - u(0.53)
    const r = Math.hypot(sx, sy) / k
    const a = Math.atan2(sy, sx)
    const spike = 0.2 + 0.09 * Math.cos(a * 8)
    if (r < spike + 0.02) color = OUTLINE
    if (r < spike) color = mix(YELLOW, ORANGE, r / spike)

    // Mallet: handle then head, tilted mid-swing, with a dark outline.
    const angle = -0.6
    const handle = [u(0.73), u(0.61), k * 0.05, k * 0.24]
    const head = [u(0.56), u(0.36), k * 0.22, k * 0.12]
    const o = k * 0.025
    if (inRotRect(x, y, handle[0], handle[1], handle[2] + o, handle[3] + o, angle)) color = OUTLINE
    if (inRotRect(x, y, handle[0], handle[1], handle[2], handle[3], angle)) color = WOOD_DARK
    if (inRotRect(x, y, head[0], head[1], head[2] + o, head[3] + o, angle)) color = OUTLINE
    if (inRotRect(x, y, head[0], head[1], head[2], head[3], angle)) {
      color = inRotRect(x, y, head[0], head[1], head[2] * 0.72, head[3], angle) ? WOOD : WOOD_DARK
    }
    return color
  })
}

writeFileSync(join(out, 'apple-touch-icon.png'), draw(180, { maskable: true }))
writeFileSync(join(out, 'icon-192.png'), draw(192, { maskable: false }))
writeFileSync(join(out, 'icon-512.png'), draw(512, { maskable: false }))
writeFileSync(join(out, 'icon-maskable-512.png'), draw(512, { maskable: true }))
console.log('icons written to', out)

// Generates the PWA icons without any image library: a gold face outline
// divided into thirds on a near-black tile. Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
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

const BG = [11, 11, 14]
const BG_LIGHT = [30, 28, 34]
const GOLD = [217, 183, 123]
const DIM = [120, 104, 76]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))))

/**
 * One icon in unit coordinates (−1…1 across the tile). `inset` shrinks the
 * mark for maskable icons, whose edges may be cropped to a circle.
 */
function icon(size, inset) {
  const ss = 3 // supersampling per axis
  return png(size, (px, py) => {
    let acc = [0, 0, 0]
    for (let sy = 0; sy < ss; sy++) {
      for (let sx = 0; sx < ss; sx++) {
        const u = ((px + (sx + 0.5) / ss) / size) * 2 - 1
        const v = ((py + (sy + 0.5) / ss) / size) * 2 - 1
        const k = 1 / inset
        const x = u * k
        const y = v * k
        // Background: a soft glow behind the face.
        let c = mix(BG_LIGHT, BG, Math.hypot(u, v * 1.1) / 1.2)
        // Face outline: an egg, wider at the cheeks than the chin.
        const ry = 0.66
        const rx = 0.46 * (1 - 0.13 * Math.max(0, y / ry))
        const e = Math.hypot(x / rx, (y + 0.02) / ry)
        const line = 0.026 * k
        const edge = Math.abs(e - 1) * Math.min(rx, ry)
        if (edge < line) c = mix(GOLD, c, edge / line - 0.5)
        // Thirds: the two dashed rules that divide the face.
        for (const ty of [-0.22, 0.2]) {
          const half = rx * Math.sqrt(Math.max(0, 1 - ((ty + 0.02) / ry) ** 2)) + 0.12
          const d = Math.abs(y - ty)
          const dashed = Math.floor((x + 2) / 0.09) % 2 === 0
          if (Math.abs(x) < half && d < line * 0.6 && dashed) c = mix(DIM, c, d / (line * 0.6) - 0.4)
        }
        // Eyes: two small almonds between the rules.
        for (const ex of [-0.16, 0.16]) {
          const d = Math.hypot((x - ex) / 1.6, y + 0.04)
          if (d < 0.034) c = mix(GOLD, c, (d - 0.022) / 0.012)
        }
        acc = acc.map((a, i) => a + c[i])
      }
    }
    return acc.map((a) => Math.round(a / (ss * ss)))
  })
}

writeFileSync(join(out, 'icon-192.png'), icon(192, 1))
writeFileSync(join(out, 'icon-512.png'), icon(512, 1))
writeFileSync(join(out, 'apple-touch-icon.png'), icon(180, 1))
writeFileSync(join(out, 'icon-maskable-512.png'), icon(512, 0.78))
console.log('icons written to public/')

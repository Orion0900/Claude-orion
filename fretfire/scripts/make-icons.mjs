// Draws the PWA icons with no image library: a dark stage, the note highway
// in perspective, five fret rings, two falling gems and a flame bursting from
// the middle ring. Run: node scripts/make-icons.mjs
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

/** An RGBA PNG from a per-pixel function returning [r, g, b, a] in 0-255. */
function png(size, pixel) {
  const stride = size * 4 + 1
  const raw = Buffer.alloc(stride * size)
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y)
      const i = y * stride + 1 + x * 4
      raw[i] = r
      raw[i + 1] = g
      raw[i + 2] = b
      raw[i + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const LANES = [
  [53, 216, 91],
  [255, 75, 85],
  [255, 212, 61],
  [63, 140, 255],
  [255, 142, 43],
]
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)
const clamp01 = (t) => Math.min(1, Math.max(0, t))

/** Colour of the scene at (u, v) in 0-1 design space, as linear RGB 0-255. */
function scene(u, v) {
  // Stage backdrop lit from behind the far end.
  const r = Math.hypot(u - 0.5, (v - 0.18) * 0.9)
  let c = mix([66, 24, 122], [10, 6, 20], clamp01(r / 0.85))

  // Highway: a trapezoid from the far end (top) to past the bottom edge.
  const top = 0.16
  const t = (v - top) / (1.05 - top)
  if (t >= 0) {
    const half = 0.12 + (0.5 - 0.12) * t
    const dx = Math.abs(u - 0.5)
    if (dx < half) {
      c = mix(c, [22, 13, 42], 0.9)
      // Lane dividers and beat lines, faint.
      const lane = ((u - 0.5) / (half * 2)) * 5 + 2.5
      if (Math.abs(lane - Math.round(lane)) < 0.03 && Math.round(lane) > 0 && Math.round(lane) < 5) c = mix(c, [255, 255, 255], 0.12)
      for (const bt of [0.2, 0.42]) if (Math.abs(t - bt) < 0.006) c = mix(c, [255, 255, 255], 0.25)
      // Rails.
      if (dx > half - 0.022) c = mix(c, [226, 214, 250], 0.85)
    }
  }

  // Falling gems: red, then blue further up the highway.
  const gem = (lane, gv, size, col) => {
    const gt = (gv - top) / (1.05 - top)
    const half = 0.12 + (0.5 - 0.12) * gt
    const gx = 0.5 + (lane - 2) * ((half * 2) / 5)
    const rx = ((half * 2) / 5) * 0.42 * size
    const ry = rx * 0.58
    const d = ((u - gx) / rx) ** 2 + ((v - gv) / ry) ** 2
    const side = ((u - gx) / rx) ** 2 + ((v - gv - ry * 0.35) / ry) ** 2
    if (side <= 1 && d > 1) c = mix(col, [0, 0, 0], 0.5)
    if (d <= 1) c = d < 0.3 ? mix([255, 255, 255], [215, 220, 235], d / 0.3) : mix(col, [255, 255, 255], (1 - d) * 0.25)
  }
  gem(3, 0.36, 1, LANES[3])
  gem(1, 0.55, 1, LANES[1])

  // Fret rings along the strike line.
  const sv = 0.8
  const st = (sv - top) / (1.05 - top)
  const sHalf = 0.12 + (0.5 - 0.12) * st
  const laneW = (sHalf * 2) / 5
  for (let i = 0; i < 5; i++) {
    const cx = 0.5 + (i - 2) * laneW
    const rx = laneW * 0.44
    const ry = rx * 0.62
    const d = ((u - cx) / rx) ** 2 + ((v - sv) / ry) ** 2
    if (d <= 1) c = d < 0.42 ? [16, 10, 30] : mix(LANES[i], [255, 255, 255], d < 0.6 ? 0.25 : 0)
  }

  // A flame bursting up from the yellow ring.
  const fBase = sv
  const fTip = 0.34
  const ft = (fBase - v) / (fBase - fTip)
  if (ft > -0.1 && ft < 1) {
    const width = laneW * 0.55 * Math.pow(clamp01(1 - ft), 0.75) * (ft < 0 ? 1 + ft * 4 : 1)
    const k = 1 - Math.abs(u - 0.5) / Math.max(1e-6, width)
    if (k > 0) {
      const hot = mix([255, 120, 30], [255, 225, 90], clamp01(k * 1.4))
      const core = mix(hot, [255, 255, 255], clamp01((k - 0.55) * 2.5) * (1 - clamp01(ft)))
      c = mix(c, core, clamp01(k * 2.2))
    }
  }
  return c
}

/**
 * Renders the icon: `scale` shrinks the design into the middle (maskable
 * icons keep it inside the safe zone), `corner` rounds and clears corners.
 */
function icon(size, { scale, corner }) {
  const samples = 3
  return png(size, (x, y) => {
    let acc = [0, 0, 0]
    let cover = 0
    for (let sy = 0; sy < samples; sy++) {
      for (let sx = 0; sx < samples; sx++) {
        const px = (x + (sx + 0.5) / samples) / size
        const py = (y + (sy + 0.5) / samples) / size
        if (corner > 0) {
          const cx = Math.min(Math.max(px, corner), 1 - corner)
          const cy = Math.min(Math.max(py, corner), 1 - corner)
          if ((px - cx) ** 2 + (py - cy) ** 2 > corner ** 2) continue
        }
        const u = 0.5 + (px - 0.5) / scale
        const v = 0.5 + (py - 0.5) / scale
        acc = acc.map((a, i) => a + scene(u, v)[i])
        cover++
      }
    }
    const n = samples * samples
    if (!cover) return [0, 0, 0, 0]
    return [...acc.map((a) => Math.round(a / cover)), Math.round((cover / n) * 255)]
  })
}

writeFileSync(join(out, 'apple-touch-icon.png'), icon(180, { scale: 1, corner: 0 }))
writeFileSync(join(out, 'icon-192.png'), icon(192, { scale: 1, corner: 0.22 }))
writeFileSync(join(out, 'icon-512.png'), icon(512, { scale: 1, corner: 0.22 }))
writeFileSync(join(out, 'icon-maskable-512.png'), icon(512, { scale: 0.8, corner: 0 }))
console.log('icons written to', out)

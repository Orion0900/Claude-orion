/**
 * Draws the app icons.
 *
 * Icons are checked in, so this only runs when the mark changes — but it lives
 * here rather than in a design tool so the shapes are reproducible and nobody
 * has to hunt for a source file. Pure Node: pixels into a buffer, deflate,
 * PNG chunks out.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [11, 14, 20]
const BG_MASKABLE = [11, 14, 20]
const MARK = [76, 194, 255]

/** CRC32, as PNG specifies it. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** `pixel(x, y)` returns [r, g, b] for each point of a size×size image. */
function png(size, pixel) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolour
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let offset = 0
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0 // no per-scanline filter
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y)
      raw[offset++] = r
      raw[offset++] = g
      raw[offset++] = b
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const mix = (a, b, t) => a.map((channel, i) => Math.round(channel + (b[i] - channel) * t))

/**
 * The mark: a chevron pointing up — a job moving to the top of the list.
 * Drawn from the distance to the chevron's two arms so the edges are smooth
 * at every size.
 */
function chevron(size, inset, rounded) {
  const radius = size * 0.22
  const half = size / 2
  const stroke = size * 0.115
  const apex = { x: half, y: size * (0.5 - inset) }
  const armY = size * (0.5 + inset * 0.85)

  const distanceToArm = (px, py, end) => {
    const vx = end.x - apex.x
    const vy = end.y - apex.y
    const t = Math.max(0, Math.min(1, ((px - apex.x) * vx + (py - apex.y) * vy) / (vx * vx + vy * vy)))
    return Math.hypot(px - (apex.x + vx * t), py - (apex.y + vy * t))
  }

  return (x, y) => {
    const px = x + 0.5
    const py = y + 0.5

    if (rounded) {
      // Rounded-square corner mask, so the icon isn't a hard square on iOS.
      const dx = Math.max(radius - px, px - (size - radius), 0)
      const dy = Math.max(radius - py, py - (size - radius), 0)
      if (Math.hypot(dx, dy) > radius) return [0, 0, 0]
    }

    const background = rounded ? BG : BG_MASKABLE
    const distance = Math.min(
      distanceToArm(px, py, { x: half - size * (inset * 0.95), y: armY }),
      distanceToArm(px, py, { x: half + size * (inset * 0.95), y: armY }),
    )
    const edge = (stroke / 2 - distance) / 1.5
    if (edge <= 0) return background
    return mix(background, MARK, Math.min(1, edge))
  }
}

const files = [
  ['icon-192.png', 192, 0.2, true],
  ['icon-512.png', 512, 0.2, true],
  // A maskable icon is cropped to a circle by some launchers, so the mark sits
  // well inside the safe area and the background runs to the edges.
  ['icon-maskable-512.png', 512, 0.14, false],
  ['apple-touch-icon.png', 180, 0.2, false],
]

for (const [name, size, inset, rounded] of files) {
  writeFileSync(join(OUT, name), png(size, chevron(size, inset, rounded)))
  console.log(`wrote ${name} (${size}×${size})`)
}

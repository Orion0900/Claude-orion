/**
 * Node-only PNG writer for art previews and icons. Takes the game's Pixels
 * buffers straight to disk with no image library.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { blit, createPixels, fillRect, scale, type Pixels, type Rgba } from '../src/core/pixels'

const crcTable = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf: Uint8Array): number {
  let c = -1
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

export function encodePng(p: Pixels): Buffer {
  const stride = p.w * 4 + 1
  const raw = Buffer.alloc(stride * p.h)
  for (let y = 0; y < p.h; y++) {
    raw[y * stride] = 0
    for (let x = 0; x < p.w * 4; x++) raw[y * stride + 1 + x] = p.data[y * p.w * 4 + x]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(p.w, 0)
  ihdr.writeUInt32BE(p.h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function writePng(path: string, p: Pixels, zoom = 1): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, encodePng(zoom > 1 ? scale(p, zoom) : p))
}

/**
 * Lays images out in a grid on a backdrop, for eyeballing a whole set at
 * once. `cols` per row, `pad` pixels between cells.
 */
export function sheet(images: readonly Pixels[], cols: number, pad = 4, backdrop: Rgba = 0xd8e8f0ff): Pixels {
  if (images.length === 0) return createPixels(1, 1)
  const cw = Math.max(...images.map((i) => i.w))
  const ch = Math.max(...images.map((i) => i.h))
  const rows = Math.ceil(images.length / cols)
  const out = createPixels(cols * (cw + pad) + pad, rows * (ch + pad) + pad)
  fillRect(out, 0, 0, out.w, out.h, backdrop)
  images.forEach((img, i) => blit(out, img, pad + (i % cols) * (cw + pad), pad + Math.floor(i / cols) * (ch + pad)))
  return out
}

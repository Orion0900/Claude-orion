/**
 * The home-screen icons, drawn from the game's own art: NARLET on a sea-blue
 * tile with a sun-bright horizon. Run: npm run icons
 */
import { join } from 'node:path'
import { creatureFront } from '../src/art/creatures'
import { blit, createPixels, fillRect, hex, mix, scale, setPx, type Pixels } from '../src/core/pixels'
import { writePng } from './png'

const out = join(import.meta.dirname ?? __dirname, '..', 'public')

/** A 64×64 tile: sky and sea bands with NARLET bobbing in front. */
function tile(margin: number): Pixels {
  const p = createPixels(64, 64)
  const sky = hex('#58a8f0')
  const deep = hex('#1c4a9c')
  for (let y = 0; y < 64; y++) {
    const t = y / 63
    fillRect(p, 0, y, 64, 1, y < 34 ? mix(hex('#a8dcff'), sky, t * 1.6) : mix(hex('#3a82d8'), deep, (y - 34) / 30))
  }
  // Wave glints.
  for (const [x, y] of [
    [8, 40],
    [30, 46],
    [50, 42],
    [18, 54],
    [44, 57],
  ])
    for (let i = 0; i < 5; i++) setPx(p, x + i, y, hex('#a8d8ff'))
  const beast = creatureFront('narlet')
  const small = margin > 0 ? shrink(beast, margin) : beast
  blit(p, small, Math.floor((64 - small.w) / 2), Math.floor((64 - small.h) / 2) + 2)
  return p
}

/** Crops the beast's empty border, then fits it in (64 - 2·margin). */
function shrink(src: Pixels, margin: number): Pixels {
  const size = 64 - margin * 2
  const out = createPixels(size, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x / size) * 64)
      const sy = Math.floor((y / size) * 64)
      const i = (sy * 64 + sx) * 4
      if (src.data[i + 3] > 0) setPx(out, x, y, ((src.data[i] << 24) | (src.data[i + 1] << 16) | (src.data[i + 2] << 8) | 255) >>> 0)
    }
  return out
}

function upscale(p: Pixels, size: number): Pixels {
  const k = Math.max(1, Math.floor(size / p.w))
  const big = scale(p, k)
  if (big.w === size) return big
  const out = createPixels(size, size)
  fillRect(out, 0, 0, size, size, hex('#1c4a9c'))
  blit(out, big, Math.floor((size - big.w) / 2), Math.floor((size - big.h) / 2))
  return out
}

writePng(join(out, 'icon-192.png'), upscale(tile(0), 192))
writePng(join(out, 'icon-512.png'), upscale(tile(0), 512))
writePng(join(out, 'icon-maskable-512.png'), upscale(tile(10), 512))
writePng(join(out, 'apple-touch-icon.png'), upscale(tile(4), 180))
console.log('icons written to', out)

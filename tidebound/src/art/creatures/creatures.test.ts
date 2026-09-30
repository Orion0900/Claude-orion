import { describe, expect, it } from 'vitest'
import { colourCount, getPx, opaqueCount, type Pixels } from '../../core/pixels'
import { SPECIES_IDS, type SpeciesId } from '../../data/dex'
import { CREATURE_SIZE, ICON_SIZE, creatureBack, creatureFront, creatureIcon } from './index'
import { RECIPES } from './species'

function same(a: Pixels, b: Pixels): boolean {
  if (a.w !== b.w || a.h !== b.h) return false
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false
  return true
}

function bounds(p: Pixels): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = p.w
  let y0 = p.h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++)
      if ((getPx(p, x, y) & 255) > 0) {
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
  return { x0, y0, x1, y1 }
}

/** Every pixel is either fully opaque or fully transparent, as on the GBA. */
function binaryAlpha(p: Pixels): boolean {
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 0 && p.data[i] !== 255) return false
  return true
}

/** Opaque pixels with no opaque 8-neighbour: stray noise. */
function strays(p: Pixels): number {
  let n = 0
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      if ((getPx(p, x, y) & 255) === 0) continue
      let alone = true
      for (let dy = -1; dy <= 1 && alone; dy++)
        for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && (getPx(p, x + dx, y + dy) & 255) > 0) alone = false
      if (alone) n++
    }
  return n
}

describe('creature art', () => {
  it('has a recipe for every species', () => {
    for (const id of SPECIES_IDS) expect(RECIPES[id], id).toBeDefined()
  })

  describe.each(SPECIES_IDS.map((id) => [id] as [SpeciesId]))('%s', (id) => {
    it('draws a front sprite: 64×64, solid, shaded, standing near the bottom', () => {
      const p = creatureFront(id)
      expect(p.w).toBe(CREATURE_SIZE)
      expect(p.h).toBe(CREATURE_SIZE)
      expect(binaryAlpha(p)).toBe(true)
      const n = opaqueCount(p)
      expect(n).toBeGreaterThan(350)
      expect(n).toBeLessThan(64 * 64 * 0.7)
      expect(colourCount(p)).toBeGreaterThanOrEqual(6)
      const b = bounds(p)
      // Lowest point a few pixels above the bottom edge; fills a sane share of the frame.
      expect(b.y1).toBeGreaterThanOrEqual(56)
      expect(b.y1).toBeLessThanOrEqual(62)
      expect(Math.max(b.x1 - b.x0, b.y1 - b.y0) + 1).toBeGreaterThanOrEqual(30)
      expect(strays(p)).toBe(0)
    })

    it('draws a back sprite that differs from the front and is at least as big in frame', () => {
      const f = creatureFront(id)
      const p = creatureBack(id)
      expect(p.w).toBe(CREATURE_SIZE)
      expect(p.h).toBe(CREATURE_SIZE)
      expect(binaryAlpha(p)).toBe(true)
      expect(colourCount(p)).toBeGreaterThanOrEqual(6)
      expect(same(p, f)).toBe(false)
      const fb = bounds(f)
      const bb = bounds(p)
      const big = (b: typeof fb) => Math.max(b.x1 - b.x0, b.y1 - b.y0) + 1
      expect(big(bb)).toBeGreaterThanOrEqual(Math.min(56, big(fb)))
      // Cropped by (or sitting on) the bottom edge, like the player's side in battle.
      expect(bounds(p).y1).toBe(CREATURE_SIZE - 1)
      expect(strays(p)).toBe(0)
    })

    it('draws a 32×32 icon with a one-pixel bob', () => {
      const a = creatureIcon(id, 0)
      const b = creatureIcon(id, 1)
      for (const p of [a, b]) {
        expect(p.w).toBe(ICON_SIZE)
        expect(p.h).toBe(ICON_SIZE)
        expect(binaryAlpha(p)).toBe(true)
      }
      expect(opaqueCount(a)).toBeGreaterThan(80)
      expect(colourCount(a)).toBeGreaterThanOrEqual(5)
      expect(same(a, b)).toBe(false)
      const ba = bounds(a)
      const bb = bounds(b)
      expect(bb.y0).toBe(ba.y0 - 1)
      expect(bb.x0).toBe(ba.x0)
      expect(opaqueCount(b)).toBe(opaqueCount(a))
    })

    it('has a shiny palette that changes the colours but not the shape', () => {
      const f = creatureFront(id)
      const s = creatureFront(id, true)
      expect(same(f, s)).toBe(false)
      expect(opaqueCount(s)).toBe(opaqueCount(f))
      let changed = 0
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (getPx(f, x, y) !== getPx(s, x, y)) changed++
      expect(changed).toBeGreaterThan(opaqueCount(f) * 0.08)
      expect(same(creatureBack(id), creatureBack(id, true))).toBe(false)
    })
  })

  it('caches: the same arguments return the same buffer', () => {
    expect(creatureFront('leafolin')).toBe(creatureFront('leafolin'))
    expect(creatureBack('atollus', true)).toBe(creatureBack('atollus', true))
    expect(creatureIcon('zappet', 1)).toBe(creatureIcon('zappet', 1))
  })

  it('is deterministic across fresh module loads', async () => {
    const before = SPECIES_IDS.map((id) => creatureFront(id))
    const { vi } = await import('vitest')
    vi.resetModules()
    const fresh = await import('./index')
    SPECIES_IDS.forEach((id, i) => expect(same(fresh.creatureFront(id), before[i]), id).toBe(true))
    expect(same(fresh.creatureBack('narlet'), creatureBack('narlet'))).toBe(true)
    expect(same(fresh.creatureIcon('kindlet', 0), creatureIcon('kindlet', 0))).toBe(true)
  })

  it('faces left: eye highlights sit on the left of the front sprite', () => {
    let withEyes = 0
    let left = 0
    for (const id of SPECIES_IDS) {
      const p = creatureFront(id)
      const b = bounds(p)
      let sx = 0
      let n = 0
      for (let y = 0; y < p.h; y++)
        for (let x = 0; x < p.w; x++)
          if (getPx(p, x, y) === 0xffffffff) {
            sx += x
            n++
          }
      if (!n) continue
      withEyes++
      if (sx / n <= (b.x0 + b.x1) / 2 + 0.5) left++
    }
    expect(withEyes).toBeGreaterThan(20)
    expect(left).toBeGreaterThanOrEqual(Math.floor(withEyes * 0.9))
  })

  it('faces the other way in the back view: its silhouette mirrors the front', () => {
    const profile = (p: Pixels) => {
      const b = bounds(p)
      const bins = new Array(16).fill(0)
      for (let y = b.y0; y <= b.y1; y++)
        for (let x = b.x0; x <= b.x1; x++) if ((getPx(p, x, y) & 255) > 0) bins[Math.min(15, Math.floor(((x - b.x0) / (b.x1 - b.x0 + 1)) * 16))]++
      const sum = bins.reduce((a, c) => a + c, 0)
      return bins.map((v) => v / sum)
    }
    const corr = (a: number[], b: number[]) => {
      const ma = a.reduce((x, y) => x + y) / a.length
      const mb = b.reduce((x, y) => x + y) / b.length
      let num = 0
      let da = 0
      let db = 0
      for (let i = 0; i < a.length; i++) {
        num += (a[i] - ma) * (b[i] - mb)
        da += (a[i] - ma) ** 2
        db += (b[i] - mb) ** 2
      }
      return num / Math.sqrt(da * db)
    }
    let mirrored = 0
    for (const id of SPECIES_IDS) {
      const f = profile(creatureFront(id))
      const b = profile(creatureBack(id))
      if (corr(f, [...b].reverse()) > corr(f, b)) mirrored++
    }
    expect(mirrored).toBeGreaterThanOrEqual(Math.floor(SPECIES_IDS.length * 0.8))
  })

  it('renders quickly enough to draw at load', () => {
    const t0 = performance.now()
    for (const id of SPECIES_IDS) {
      creatureIcon(id, 0)
      creatureBack(id, true)
    }
    const per = (performance.now() - t0) / SPECIES_IDS.length
    expect(per).toBeLessThan(60)
  })
})

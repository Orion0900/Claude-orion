import { describe, expect, it } from 'vitest'
import { colourCount, getPx, opaqueCount, type Pixels } from '../../core/pixels'
import { Rng } from '../../core/rng'
import { ITEM_IDS } from '../../data/items'
import { BUILDING_KINDS, BUILDING_SIZE, TERRAIN_KINDS, type TerrainKind } from '../../world/terrain'
import { PLAYER_LOOKS, type Facing, type Look } from '../look'
import {
  FIELD_EFFECT_FRAMES,
  TILE,
  battleBackground,
  battlePlatform,
  buildingSprite,
  characterSprite,
  emote,
  fieldEffect,
  groundItemSprite,
  itemIcon,
  orbSprite,
  playerBack,
  surfSprite,
  terrainFrames,
  terrainOverlay,
  terrainTile,
  titleArt,
  trainerPortrait,
  type BattleBg,
  type EmoteKind,
  type FieldEffect,
  type OrbKind,
} from './index'
import { ACCS, BODIES, HAIRS, HATS, OUTFITS, SAMPLE_LOOKS, variedLook } from './samples'

function fullyOpaque(p: Pixels): boolean {
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 255) return false
  return true
}

function hasClear(p: Pixels): boolean {
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] === 0) return true
  return false
}

function onlyOpaqueOrClear(p: Pixels): boolean {
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 0 && p.data[i] !== 255) return false
  return true
}

function same(a: Pixels, b: Pixels): boolean {
  if (a.w !== b.w || a.h !== b.h) return false
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false
  return true
}

function mirrored(a: Pixels, b: Pixels): boolean {
  if (a.w !== b.w || a.h !== b.h) return false
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) if (getPx(a, x, y) !== getPx(b, a.w - 1 - x, y)) return false
  return true
}

const G: TerrainKind = 'grass'

/** A few neighbour layouts per kind: alone in grass, surrounded, edges, off-map. */
function configs(k: TerrainKind): (TerrainKind | null)[][] {
  const others: TerrainKind[] = ['grass', 'sand', 'water', 'path', 'cliff', 'floor', 'caveFloor', 'tree', 'wall']
  return [
    [G, G, G, G, G, G, G, G],
    [k, k, k, k, k, k, k, k],
    [null, null, null, null, null, null, null, null],
    [k, G, k, 'water', 'sand', 'water', k, null],
    [G, k, k, k, G, G, G, k],
    ...others.map((o, i) => [o, k, others[(i + 1) % others.length], k, o, null, k, others[(i + 3) % others.length]]),
  ]
}

describe('terrain tiles', () => {
  it('every kind has a sane frame count', () => {
    for (const k of TERRAIN_KINDS) {
      const n = terrainFrames(k)
      expect(Number.isInteger(n), k).toBe(true)
      expect(n, k).toBeGreaterThanOrEqual(1)
      expect(n, k).toBeLessThanOrEqual(8)
    }
  })

  it('every kind × neighbour config × frame is an opaque 16×16 tile', () => {
    for (const k of TERRAIN_KINDS)
      for (const n of configs(k))
        for (let f = 0; f < terrainFrames(k); f++) {
          const t = terrainTile(k, n, 3, 7, f)
          expect(t.w, k).toBe(TILE)
          expect(t.h, k).toBe(TILE)
          expect(fullyOpaque(t), `${k} ${n.join(',')} f${f}`).toBe(true)
        }
  })

  it('tiles are shaded, not flat fills (except the void)', () => {
    for (const k of TERRAIN_KINDS) {
      if (k === 'void') continue
      const nb = [G, G, G, G, G, G, G, G]
      const tiles = [0, 1, 2, 3].map((i) => terrainTile(k, nb, i, 2 * i, 0))
      for (const t of tiles) expect(colourCount(t), k).toBeGreaterThanOrEqual(2)
      expect(Math.max(...tiles.map(colourCount)), k).toBeGreaterThanOrEqual(3)
    }
  })

  it('animated kinds change between frames', () => {
    for (const k of TERRAIN_KINDS) {
      const n = terrainFrames(k)
      if (n < 2) continue
      // animated kinds are water or have something moving; show them beside water
      const nb: TerrainKind[] = ['water', 'water', k, 'water', 'water', 'water', k, 'water']
      const frames = Array.from({ length: n }, (_, f) => terrainTile(k, nb, 5, 5, f))
      expect(frames.some((f) => !same(f, frames[0])), k).toBe(true)
    }
  })

  it('grass varies with position but is deterministic', () => {
    const nb = [G, G, G, G, G, G, G, G]
    const tiles = Array.from({ length: 16 }, (_, i) => terrainTile('grass', nb, i % 4, Math.floor(i / 4), 0))
    const distinct = new Set(tiles.map((t) => t.data.join(',')))
    expect(distinct.size).toBeGreaterThan(3)
    expect(same(terrainTile('grass', nb, 2, 9, 0), terrainTile('grass', nb, 2, 9, 0))).toBe(true)
  })

  it('shorelines differ from open water', () => {
    const open = terrainTile('water', ['water', 'water', 'water', 'water', 'water', 'water', 'water', 'water'], 1, 1, 0)
    const shore = terrainTile('water', ['sand', 'sand', 'water', 'water', 'water', 'water', 'water', 'sand'], 1, 1, 0)
    expect(same(open, shore)).toBe(false)
  })

  it('fences and trees join with their neighbours', () => {
    const lone = terrainTile('fence', [G, G, G, G, G, G, G, G], 0, 0, 0)
    const run = terrainTile('fence', [G, G, 'fence', G, G, G, 'fence', G], 0, 0, 0)
    expect(same(lone, run)).toBe(false)
    const tree = terrainTile('tree', [G, G, G, G, G, G, G, G], 0, 0, 0)
    const forest = terrainTile('tree', ['tree', 'tree', 'tree', 'tree', 'tree', 'tree', 'tree', 'tree'], 0, 0, 0)
    expect(same(tree, forest)).toBe(false)
  })

  it('only tall grass has an overlay, 16×16 with transparency', () => {
    for (const k of TERRAIN_KINDS) {
      for (let f = 0; f < Math.max(2, terrainFrames(k)); f++) {
        const o = terrainOverlay(k, f)
        if (k === 'tallgrass') {
          expect(o).not.toBeNull()
          expect(o!.w).toBe(16)
          expect(o!.h).toBe(16)
          expect(hasClear(o!)).toBe(true)
          expect(opaqueCount(o!)).toBeGreaterThan(20)
          expect(onlyOpaqueOrClear(o!)).toBe(true)
          // it covers the lower half, where feet stand
          let bottomRow = 0
          for (let x = 0; x < 16; x++) if ((getPx(o!, x, 15) & 255) !== 0) bottomRow++
          expect(bottomRow).toBe(16)
        } else expect(o, k).toBeNull()
      }
    }
  })
})

describe('buildings', () => {
  it('match BUILDING_SIZE, with clear ground and a drawn door', () => {
    for (const k of BUILDING_KINDS)
      for (let v = 0; v < 4; v++) {
        const b = buildingSprite(k, v)
        const s = BUILDING_SIZE[k]
        expect(b.w, k).toBe(s.w * 16)
        expect(b.h, k).toBe(s.h * 16)
        expect(onlyOpaqueOrClear(b), k).toBe(true)
        expect(opaqueCount(b), k).toBeGreaterThan(b.w * b.h * 0.4)
        expect(colourCount(b), k).toBeGreaterThan(8)
        // the door cell is drawn on
        let door = 0
        for (let y = s.door.y * 16; y < s.door.y * 16 + 16; y++)
          for (let x = s.door.x * 16; x < s.door.x * 16 + 16; x++) if ((getPx(b, x, y) & 255) !== 0) door++
        expect(door, `${k} door`).toBeGreaterThan(100)
      }
  })

  it('house and hut roofs change with the variant, halls with the Warden', () => {
    for (const k of ['house', 'hut'] as const) {
      const vs = [0, 1, 2, 3].map((v) => buildingSprite(k, v).data.join(','))
      expect(new Set(vs).size, k).toBe(4)
    }
    const halls = [0, 1, 2].map((v) => buildingSprite('hall', v).data.join(','))
    expect(new Set(halls).size).toBe(3)
  })

  it('is deterministic', () => {
    for (const k of BUILDING_KINDS) expect(same(buildingSprite(k, 1), buildingSprite(k, 1)), k).toBe(true)
  })
})

function randomLook(rng: Rng): Look {
  const col = (): string => '#' + Array.from({ length: 3 }, () => rng.int(0, 255).toString(16).padStart(2, '0')).join('')
  return {
    body: rng.pick(BODIES),
    sex: rng.pick(['m', 'f'] as const),
    skin: rng.int(0, 4) as Look['skin'],
    hair: rng.pick(HAIRS),
    hairColor: col(),
    headwear: rng.pick(HATS),
    headwearColor: col(),
    outfit: rng.pick(OUTFITS),
    top: col(),
    bottom: col(),
    accessory: rng.pick(ACCS),
  }
}

const FACINGS: Facing[] = ['down', 'up', 'left', 'right']

describe('people', () => {
  const rng = new Rng(20260929)
  const looks: Look[] = [...PLAYER_LOOKS, ...Object.values(SAMPLE_LOOKS), ...Array.from({ length: 40 }, (_, i) => variedLook(i)), ...Array.from({ length: 150 }, () => randomLook(rng))]

  it('draws any look in every facing and frame at 16×32', () => {
    for (const look of looks)
      for (const f of FACINGS)
        for (const fr of [0, 1, 2] as const) {
          const s = characterSprite(look, f, fr)
          expect(s.w).toBe(16)
          expect(s.h).toBe(32)
          expect(onlyOpaqueOrClear(s)).toBe(true)
          expect(opaqueCount(s)).toBeGreaterThan(120)
          expect(colourCount(s)).toBeGreaterThan(6)
          // stands on the bottom row, head within the cell above
          let feet = 0
          for (let x = 0; x < 16; x++) if ((getPx(s, x, 31) & 255) !== 0) feet++
          expect(feet, `${JSON.stringify(look)} ${f} ${fr}`).toBeGreaterThan(0)
        }
  })

  it('covers every hair, hat, outfit, body and accessory', () => {
    for (const hair of HAIRS)
      for (const headwear of HATS)
        for (const f of FACINGS) {
          const s = characterSprite({ ...PLAYER_LOOKS[0], hair, headwear }, f, 0)
          expect(opaqueCount(s)).toBeGreaterThan(120)
        }
    for (const body of BODIES)
      for (const outfit of OUTFITS)
        for (const accessory of ACCS)
          for (const sex of ['m', 'f'] as const) {
            const s = characterSprite({ ...PLAYER_LOOKS[1], body, outfit, accessory, sex }, 'down', 1)
            expect(opaqueCount(s)).toBeGreaterThan(120)
          }
  })

  it('faces right as the mirror of left', () => {
    for (const look of looks.slice(0, 60))
      for (const fr of [0, 1, 2] as const) expect(mirrored(characterSprite(look, 'left', fr), characterSprite(look, 'right', fr))).toBe(true)
  })

  it('walking frames differ from standing', () => {
    for (const f of FACINGS) {
      const stand = characterSprite(PLAYER_LOOKS[0], f, 0)
      expect(same(stand, characterSprite(PLAYER_LOOKS[0], f, 1)), f).toBe(false)
      expect(same(stand, characterSprite(PLAYER_LOOKS[0], f, 2)), f).toBe(false)
    }
  })

  it('shows eyes facing down and sideways but not from behind', () => {
    const look = { ...PLAYER_LOOKS[0], headwear: 'none' as const }
    const eye = 0x28202cff
    const count = (p: Pixels): number => {
      let n = 0
      for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) if (getPx(p, x, y) === eye) n++
      return n
    }
    expect(count(characterSprite(look, 'down', 0))).toBeGreaterThanOrEqual(4)
    expect(count(characterSprite(look, 'left', 0))).toBeGreaterThanOrEqual(2)
    expect(count(characterSprite(look, 'up', 0))).toBe(0)
  })

  it('tolerates malformed colours in a look', () => {
    const odd = { ...PLAYER_LOOKS[0], top: 'nonsense', hairColor: '#12345', bottom: '', headwearColor: 'blue' }
    for (const f of FACINGS) expect(opaqueCount(characterSprite(odd, f, 0))).toBeGreaterThan(120)
    expect(opaqueCount(trainerPortrait(odd))).toBeGreaterThan(900)
  })

  it('returns fresh buffers (callers may mutate them)', () => {
    const a = characterSprite(PLAYER_LOOKS[0], 'down', 0)
    a.data.fill(0)
    expect(opaqueCount(characterSprite(PLAYER_LOOKS[0], 'down', 0))).toBeGreaterThan(100)
  })

  it('surfs at 32×32 in every facing, bobbing', () => {
    for (const look of looks.slice(0, 20))
      for (const f of FACINGS)
        for (const fr of [0, 1] as const) {
          const s = surfSprite(look, f, fr)
          expect(s.w).toBe(32)
          expect(s.h).toBe(32)
          expect(opaqueCount(s)).toBeGreaterThan(200)
        }
    expect(same(surfSprite(PLAYER_LOOKS[0], 'down', 0), surfSprite(PLAYER_LOOKS[0], 'down', 1))).toBe(false)
    expect(mirrored(surfSprite(PLAYER_LOOKS[0], 'left', 0), surfSprite(PLAYER_LOOKS[0], 'right', 0))).toBe(true)
  })

  it('draws 64×64 portraits and back views', () => {
    for (const look of looks.slice(0, 80)) {
      const p = trainerPortrait(look)
      expect(p.w).toBe(64)
      expect(p.h).toBe(64)
      expect(onlyOpaqueOrClear(p)).toBe(true)
      expect(opaqueCount(p)).toBeGreaterThan(900)
      expect(colourCount(p)).toBeGreaterThan(10)
    }
    for (const look of looks.slice(0, 30)) {
      const frames = ([0, 1, 2, 3] as const).map((f) => playerBack(look, f))
      for (const b of frames) {
        expect(b.w).toBe(64)
        expect(b.h).toBe(64)
        expect(opaqueCount(b)).toBeGreaterThan(900)
      }
      expect(new Set(frames.map((b) => b.data.join(','))).size).toBe(4)
    }
  })
})

describe('battle stage', () => {
  const bgs: BattleBg[] = ['grass', 'cave', 'beach', 'water', 'indoor', 'wreck', 'night']

  it('backgrounds are opaque 240×112 and distinct', () => {
    const seen = new Set<string>()
    for (const k of bgs) {
      const b = battleBackground(k)
      expect(b.w).toBe(240)
      expect(b.h).toBe(112)
      expect(fullyOpaque(b), k).toBe(true)
      expect(colourCount(b), k).toBeGreaterThan(8)
      seen.add(b.data.join(','))
    }
    expect(seen.size).toBe(bgs.length)
  })

  it('platforms are ovals with clear corners at the documented sizes', () => {
    for (const k of bgs) {
      const me = battlePlatform(k, 'player')
      const foe = battlePlatform(k, 'foe')
      expect([me.w, me.h]).toEqual([128, 32])
      expect([foe.w, foe.h]).toEqual([96, 24])
      for (const p of [me, foe]) {
        expect(onlyOpaqueOrClear(p)).toBe(true)
        expect(getPx(p, 0, 0) & 255).toBe(0)
        expect(getPx(p, p.w - 1, p.h - 1) & 255).toBe(0)
        expect(getPx(p, p.w >> 1, p.h >> 1) & 255).toBe(255)
      }
    }
  })
})

describe('small sprites', () => {
  it('orbs: 16×16, five frames, distinct kinds', () => {
    const kinds: OrbKind[] = ['orb', 'superOrb', 'hyperOrb', 'tideOrb', 'duskOrb']
    const closed = new Set<string>()
    for (const k of kinds) {
      const frames = ([0, 1, 2, 3, 4] as const).map((f) => orbSprite(k, f))
      for (const f of frames) {
        expect([f.w, f.h]).toEqual([16, 16])
        expect(opaqueCount(f)).toBeGreaterThan(60)
        expect(onlyOpaqueOrClear(f)).toBe(true)
      }
      expect(new Set(frames.map((f) => f.data.join(','))).size).toBe(5)
      closed.add(frames[0].data.join(','))
    }
    expect(closed.size).toBe(kinds.length)
  })

  it('ground item, emotes and effects are 16×16', () => {
    const g = groundItemSprite()
    expect([g.w, g.h]).toEqual([16, 16])
    expect(opaqueCount(g)).toBeGreaterThan(40)
    const emotes: EmoteKind[] = ['exclaim', 'question', 'heart', 'note', 'dots', 'angry']
    const seen = new Set<string>()
    for (const e of emotes) {
      const p = emote(e)
      expect([p.w, p.h]).toEqual([16, 16])
      expect(hasClear(p)).toBe(true)
      seen.add(p.data.join(','))
    }
    expect(seen.size).toBe(emotes.length)
    for (const fx of Object.keys(FIELD_EFFECT_FRAMES) as FieldEffect[])
      for (let f = 0; f < FIELD_EFFECT_FRAMES[fx]; f++) {
        const p = fieldEffect(fx, f)
        expect([p.w, p.h]).toEqual([16, 16])
        expect(opaqueCount(p), `${fx} ${f}`).toBeGreaterThan(3)
        expect(onlyOpaqueOrClear(p)).toBe(true)
      }
  })

  it('every item has a distinct 24×24 icon', () => {
    const seen = new Set<string>()
    for (const id of ITEM_IDS) {
      const p = itemIcon(id)
      expect([p.w, p.h], id).toEqual([24, 24])
      expect(opaqueCount(p), id).toBeGreaterThan(80)
      expect(colourCount(p), id).toBeGreaterThan(4)
      seen.add(p.data.join(','))
    }
    expect(seen.size).toBe(ITEM_IDS.length)
  })
})

describe('title', () => {
  it('has a wordmark within 224×64 and an opaque 240×160 backdrop', () => {
    const { logo, backdrop } = titleArt()
    expect(logo.w).toBeLessThanOrEqual(224)
    expect(logo.h).toBeLessThanOrEqual(64)
    expect(hasClear(logo)).toBe(true)
    expect(opaqueCount(logo)).toBeGreaterThan(2000)
    expect([backdrop.w, backdrop.h]).toEqual([240, 160])
    expect(fullyOpaque(backdrop)).toBe(true)
    expect(same(titleArt().logo, logo)).toBe(true)
  })
})

describe('speed', () => {
  it('renders a 40×40 map of mixed tiles quickly', () => {
    const kinds = TERRAIN_KINDS
    const t0 = performance.now()
    for (let y = 0; y < 40; y++)
      for (let x = 0; x < 40; x++) {
        const k = kinds[(x * 7 + y * 3) % kinds.length]
        const n = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => kinds[(x + y + i) % kinds.length])
        terrainTile(k, n, x, y, 0)
      }
    expect(performance.now() - t0).toBeLessThan(4000)
  })
})

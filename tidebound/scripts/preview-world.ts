/**
 * Renders previews of the world art into preview/world/ for eyeballing:
 * tile sheets, mock map scenes, characters, buildings, battle stages, small
 * sprites, item icons, the title and portraits.
 *
 *   npx vite-node scripts/preview-world.ts [zoom]
 */
import { blit, createPixels, fillRect, hex, type Pixels } from '../src/core/pixels'
import { TERRAIN_KINDS, BUILDING_KINDS, BUILDING_SIZE, type BuildingKind, type TerrainKind } from '../src/world/terrain'
import type { Look, Facing } from '../src/art/look'
import { ITEM_IDS } from '../src/data/items'
import * as A from '../src/art/world'
import { sheet, writePng } from './png'
import { ACCS, BODIES, HAIRS, HATS, OUTFITS, SAMPLE_LOOKS as CAST, variedLook } from '../src/art/world/samples'

const ZOOM = Number(process.argv[2] ?? 3)
const OUT = 'preview/world'

function tryDraw<T>(label: string, f: () => T): T | null {
  try {
    return f()
  } catch (e) {
    console.warn(`  ! ${label}: ${(e as Error).message}`)
    return null
  }
}

function save(name: string, p: Pixels | null, zoom = ZOOM): void {
  if (!p) return
  writePng(`${OUT}/${name}.png`, p, zoom)
  console.log(`wrote ${OUT}/${name}.png (${p.w}×${p.h} @${zoom})`)
}

// ---------------------------------------------------------------- maps

const LEGEND: Record<string, TerrainKind> = {
  '.': 'grass',
  ',': 'tallgrass',
  '*': 'flowers',
  '=': 'path',
  ':': 'sand',
  '~': 'water',
  v: 'ledgeS',
  '>': 'ledgeE',
  '<': 'ledgeW',
  T: 'tree',
  P: 'palm',
  b: 'bush',
  o: 'rock',
  f: 'fence',
  s: 'sign',
  m: 'mailbox',
  C: 'cliff',
  H: 'stairs',
  '-': 'bridgeH',
  '|': 'bridgeV',
  '#': 'pier',
  O: 'waterRock',
  A: 'caveEntrance',
  _: 'caveFloor',
  X: 'caveWall',
  r: 'caveRock',
  L: 'caveLadder',
  w: 'caveWater',
  F: 'floor',
  G: 'floorTile',
  W: 'wall',
  N: 'window',
  M: 'mat',
  R: 'rug',
  U: 'stairsUp',
  D: 'stairsDown',
  t: 'table',
  B: 'bed',
  V: 'tv',
  K: 'bookshelf',
  p: 'plant',
  c: 'counter',
  Q: 'pc',
  h: 'healer',
  S: 'shelf',
  Y: 'machine',
  x: 'crate',
  y: 'barrel',
  Z: 'statue',
  ' ': 'void',
  k: 'deck',
  u: 'hull',
}

interface Placed {
  kind: BuildingKind
  variant: number
  x: number
  y: number
}

interface Person {
  look: Look
  facing: Facing
  frame: 0 | 1 | 2
  x: number
  y: number
  emote?: A.EmoteKind
}

function parseMap(rows: readonly string[]): TerrainKind[][] {
  return rows.map((r) =>
    [...r].map((ch) => {
      const k = LEGEND[ch]
      if (!k) throw new Error(`no terrain for '${ch}'`)
      return k
    }),
  )
}

const DXS = [0, 1, 1, 1, 0, -1, -1, -1]
const DYS = [-1, -1, 0, 1, 1, 1, 0, -1]

function renderMap(rows: readonly string[], frame = 0, buildings: Placed[] = [], people: Person[] = [], items: [number, number][] = [], surfers: { look: Look; facing: Facing; x: number; y: number }[] = []): Pixels {
  const m = parseMap(rows)
  const H = m.length
  const Wd = Math.max(...m.map((r) => r.length))
  const at = (x: number, y: number): TerrainKind | null => (y >= 0 && y < H && x >= 0 && x < m[y].length ? m[y][x] : null)
  const out = createPixels(Wd * 16, H * 16)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < m[y].length; x++) {
      const k = m[y][x]
      const n = DXS.map((dx, i) => at(x + dx, y + DYS[i]))
      const t = tryDraw(`tile ${k}`, () => A.terrainTile(k, n, x, y, frame % A.terrainFrames(k)))
      if (t) blit(out, t, x * 16, y * 16)
    }
  for (const [x, y] of items) {
    const g = tryDraw('ground item', () => A.groundItemSprite())
    if (g) blit(out, g, x * 16, y * 16)
  }
  // Buildings and people sorted by their bottom edge, like the engine would.
  type Drawable = { bottom: number; draw: () => void }
  const list: Drawable[] = []
  for (const b of buildings) {
    const size = BUILDING_SIZE[b.kind]
    list.push({
      bottom: (b.y + size.h) * 16,
      draw: () => {
        const s = tryDraw(`building ${b.kind}`, () => A.buildingSprite(b.kind, b.variant))
        if (s) blit(out, s, b.x * 16, b.y * 16)
      },
    })
  }
  for (const p of people) {
    list.push({
      bottom: (p.y + 1) * 16 + 0.5,
      draw: () => {
        const s = tryDraw('character', () => A.characterSprite(p.look, p.facing, p.frame))
        if (s) blit(out, s, p.x * 16, p.y * 16 - 16)
        const ov = A.terrainOverlay(at(p.x, p.y) ?? 'grass', frame)
        if (ov) blit(out, ov, p.x * 16, p.y * 16)
        if (p.emote) {
          const e = tryDraw('emote', () => A.emote(p.emote!))
          if (e) blit(out, e, p.x * 16, p.y * 16 - 32)
        }
      },
    })
  }
  for (const sf of surfers)
    list.push({
      bottom: (sf.y + 1) * 16,
      draw: () => {
        const sp = tryDraw('surf', () => A.surfSprite(sf.look, sf.facing, (frame % 2) as 0 | 1))
        if (sp) blit(out, sp, sf.x * 16 - 8, sf.y * 16 - 16)
      },
    })
  list.sort((a, b) => a.bottom - b.bottom)
  for (const d of list) d.draw()
  return out
}

function crop(p: Pixels, x: number, y: number, w: number, h: number): Pixels {
  const out = createPixels(w, h)
  blit(out, { w: p.w, h: p.h, data: p.data }, -x, -y)
  return out
}

// ---------------------------------------------------------------- looks

// ---------------------------------------------------------------- scenes


const ROUTE = [
  'CCCCCCCCCCHCCCCCCCCCCC',
  'CCCCCCCCCCHCCCCCCCCCCC',
  '.T.......==....,,,,,..',
  '.......*.==....,,,,,..',
  ',,,,,....==.......T...',
  ',,,,,,...==...o.......',
  'vvvvvvvvv==vvvvvvvv...',
  '.........==......>....',
  '...bbb...==......>..~~',
  'T........====....>.~~~',
  'TT...,,,,,,,=........~',
  'TTT..,,,,,,,=....s...~',
  'TTTT.,,,,,,,=........~',
]

const CAVE = [
  'XXXXXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXX',
  'XX______XXXXXX___LXX',
  'XX_______XXXX______X',
  'X____r_____________X',
  'X_______wwww_______X',
  'X______wwwwww___r__X',
  'XX_____wwwww_______X',
  'XXX_______________XX',
  'XXXX____XXXX_____XXX',
  'XXXXX__XXXXXX___XXXX',
  'XXXXXXXXXXXXXXXXXXXX',
]

const ROOM = [
  '               ',
  ' WWWNWWWWWNWWW ',
  ' KKFFFFFFFFVFU ',
  ' FFFFRRRRFFFFF ',
  ' pFFFRRRRFFttF ',
  ' FFFFRRRRFFttF ',
  ' BFFFFFFFFFFFp ',
  ' BFFFFFFFFFFFF ',
  ' FFFFFFMFFFFFF ',
  '               ',
]

const HAVEN_ROOM = [
  '               ',
  ' WWWWNWWWNWWWW ',
  ' GGGGGhQGGGGGG ',
  ' GGGcccccccGGS ',
  ' pGGGGGGGGGGGS ',
  ' GGGGGGGGGGGGG ',
  ' GGGGGGGGGGGGG ',
  ' ZGGGGGGGGGGYx ',
  ' GGGGGGMGGGGGy ',
  '               ',
]

const WRECK_ROOM = [
  'uuuuuuuuuuuuuuu',
  'uuuuuuuuuuuuuuu',
  'ukkkkkkkkkkkkxu',
  'ukkyykkkkkkkkku',
  'ukkkkkkkkkkxxku',
  'ukkkkkkkkkkkkku',
  'ukkkkkkkkDkkkku',
  'uuuukkkkkkkkkku',
  '    ukkkkkkkkyu',
  '    uuuuuuuuuuu',
]

/** A little map builder: start from one kind, paint rectangles, read back rows. */
class MapBuilder {
  cells: string[][]
  constructor(
    public w: number,
    public h: number,
    fill: string,
  ) {
    this.cells = Array.from({ length: h }, () => Array.from({ length: w }, () => fill))
  }
  rect(x: number, y: number, w: number, h: number, ch: string): this {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (yy >= 0 && yy < this.h && xx >= 0 && xx < this.w) this.cells[yy][xx] = ch
    return this
  }
  set(x: number, y: number, ch: string): this {
    return this.rect(x, y, 1, 1, ch)
  }
  rows(): string[] {
    return this.cells.map((r) => r.join(''))
  }
}

/** The showcase: a beach village with everything the overworld has. */
function beachVillage(): { rows: string[]; buildings: Placed[]; people: Person[]; items: [number, number][]; surfers: { look: Look; facing: Facing; x: number; y: number }[] } {
  const m = new MapBuilder(34, 25, '.')
  // tree border with a path out to the north
  m.rect(0, 0, 34, 2, 'T').rect(0, 0, 2, 17, 'T').rect(32, 0, 2, 17, 'T').rect(2, 2, 1, 3, 'T').rect(31, 2, 1, 3, 'T')
  m.rect(18, 0, 2, 13, '=')
  // wild grass and ledges on the north meadow
  m.rect(4, 2, 7, 3, ',').rect(23, 2, 7, 3, ',').rect(12, 3, 3, 2, ',')
  m.rect(3, 5, 13, 1, 'v').rect(22, 5, 9, 1, 'v')
  m.rect(16, 3, 1, 3, '>')
  m.set(21, 2, '*').set(21, 3, '*').set(14, 2, '*').set(3, 2, 'b')
  // main street and door paths
  m.rect(3, 12, 29, 1, '=').rect(5, 11, 1, 1, '=').rect(12, 11, 1, 1, '=').rect(23, 11, 1, 1, '=').rect(29, 11, 1, 1, '=')
  m.rect(18, 12, 2, 6, '=')
  // yards: fences, flowers, mailboxes, a sign, bushes
  m.rect(3, 14, 7, 1, 'f').rect(3, 15, 1, 2, 'f').set(9, 15, 'f').set(9, 16, 'f')
  m.rect(4, 15, 5, 2, '*')
  m.set(4, 11, 'm').set(28, 11, 'm').set(17, 11, 's').set(21, 13, 's')
  m.rect(22, 14, 6, 1, 'b').set(12, 14, 'T').set(14, 15, 'T').set(30, 14, 'T')
  m.rect(11, 16, 2, 1, ',')
  // beach, palms and the sea
  m.rect(0, 17, 34, 3, ':').rect(0, 15, 2, 2, ':').rect(32, 15, 2, 2, ':')
  m.rect(18, 17, 2, 2, '=')
  m.set(3, 17, 'P').set(10, 18, 'P').set(26, 17, 'P').set(31, 18, 'P').set(0, 16, 'P').set(33, 15, 'P')
  m.set(14, 18, 'o').set(29, 19, 'o')
  m.rect(0, 20, 34, 5, '~').rect(0, 19, 5, 1, '~').rect(27, 20, 7, 1, ':').rect(29, 21, 5, 1, ':')
  m.rect(18, 19, 2, 5, '#')
  m.set(8, 22, 'O').set(25, 23, 'O')
  const buildings: Placed[] = [
    { kind: 'house', variant: 0, x: 3, y: 8 },
    { kind: 'haven', variant: 0, x: 9, y: 7 },
    { kind: 'market', variant: 0, x: 21, y: 8 },
    { kind: 'house', variant: 1, x: 27, y: 8 },
  ]
  const people: Person[] = [
    { look: CAST.player, facing: 'down', frame: 0, x: 18, y: 13 },
    { look: CAST.rival, facing: 'left', frame: 0, x: 20, y: 13, emote: 'exclaim' },
    { look: CAST.mum, facing: 'right', frame: 0, x: 6, y: 13 },
    { look: CAST.kid, facing: 'down', frame: 1, x: 6, y: 3 },
    { look: CAST.lass, facing: 'up', frame: 0, x: 12, y: 13, emote: 'heart' },
    { look: CAST.fisher, facing: 'down', frame: 0, x: 19, y: 22 },
    { look: CAST.swimmer, facing: 'left', frame: 2, x: 24, y: 18 },
    { look: CAST.elder, facing: 'down', frame: 0, x: 25, y: 13 },
    { look: CAST.hiker, facing: 'down', frame: 2, x: 27, y: 3 },
  ]
  return { rows: m.rows(), buildings, people, items: [[15, 16], [8, 3]], surfers: [{ look: CAST.player2, facing: 'right', x: 11, y: 21 }] }
}

/** A second showcase: Beacon Isle's shore with the lighthouse, shrine, wreck and harbour. */
function beaconIsle(): { rows: string[]; buildings: Placed[]; people: Person[]; items: [number, number][] } {
  const m = new MapBuilder(32, 22, '.')
  // plateau with trees, the cliff band with stairs and a cave
  m.rect(0, 0, 32, 1, 'T').rect(0, 0, 3, 5, 'T').rect(12, 1, 3, 1, 'T')
  m.rect(0, 5, 32, 2, 'C').set(10, 5, 'H').set(10, 6, 'H').set(18, 6, 'A').rect(29, 5, 3, 2, 'C')
  m.rect(7, 2, 3, 2, ',').set(16, 2, '*').set(17, 3, '*').set(21, 2, 'b').set(22, 2, 'b')
  m.rect(10, 1, 1, 4, '=').rect(10, 4, 15, 1, '=')
  // shore below the cliffs
  m.rect(0, 7, 32, 4, ':').rect(10, 7, 1, 2, '=').rect(10, 9, 12, 1, '=').set(18, 7, '=').set(18, 8, '=')
  m.set(2, 8, 'P').set(14, 7, 'P').set(26, 8, 'P').set(30, 10, 'P').set(5, 10, 'o')
  m.rect(0, 11, 32, 11, '~').rect(0, 11, 3, 1, ':')
  // the harbour pier with cargo
  m.rect(6, 11, 3, 6, '#').set(6, 12, 'x').set(8, 12, 'y').set(6, 13, 'y')
  // an inlet with a bridge
  m.rect(24, 7, 2, 4, '~').rect(24, 8, 2, 1, '-')
  // the wreck on a sandbar
  m.rect(12, 19, 11, 2, ':').rect(15, 18, 4, 1, ':')
  m.set(27, 15, 'O').set(3, 17, 'O')
  const buildings: Placed[] = [
    { kind: 'lighthouse', variant: 0, x: 25, y: -3 },
    { kind: 'shrine', variant: 0, x: 4, y: 1 },
    { kind: 'wreck', variant: 0, x: 13, y: 13 },
  ]
  const people: Person[] = [
    { look: CAST.player, facing: 'up', frame: 1, x: 10, y: 8 },
    { look: CAST.sailor, facing: 'down', frame: 0, x: 7, y: 14 },
    { look: CAST.grunt, facing: 'left', frame: 0, x: 17, y: 19, emote: 'angry' },
    { look: CAST.mystic, facing: 'down', frame: 0, x: 6, y: 4 },
    { look: CAST.worker, facing: 'right', frame: 2, x: 21, y: 9 },
    { look: CAST.nerissa, facing: 'down', frame: 0, x: 27, y: 5 - 1, emote: 'dots' },
  ]
  return { rows: m.rows(), buildings, people, items: [[12, 3]] }
}

function tileSheet(): Pixels {
  const imgs: Pixels[] = []
  const g = 'grass' as TerrainKind
  for (const k of TERRAIN_KINDS) {
    const frames = A.terrainFrames(k)
    // alone in grass, then surrounded by itself
    const alone = [g, g, g, g, g, g, g, g]
    const self = [k, k, k, k, k, k, k, k]
    for (let f = 0; f < Math.min(frames, 2); f++) {
      const a = tryDraw(k, () => A.terrainTile(k, alone, 3, 5, f))
      if (a) imgs.push(a)
    }
    const s = tryDraw(k, () => A.terrainTile(k, self, 4, 5, 0))
    if (s) imgs.push(s)
  }
  return sheet(imgs, 12, 3)
}

/** Each ground kind as a blob inside grass (or sand for water), to judge its edges. */
function patchSheet(): Pixels {
  const blob = (inner: string, outer: string): string[] => [
    `${outer}${outer}${outer}${outer}${outer}${outer}${outer}`,
    `${outer}${outer}${inner}${inner}${inner}${outer}${outer}`,
    `${outer}${inner}${inner}${inner}${inner}${inner}${outer}`,
    `${outer}${inner}${inner}${outer}${inner}${inner}${outer}`,
    `${outer}${inner}${inner}${inner}${inner}${outer}${outer}`,
    `${outer}${outer}${inner}${outer}${outer}${outer}${outer}`,
    `${outer}${outer}${outer}${outer}${outer}${outer}${outer}`,
  ]
  const cases: [string, string][] = [
    ['=', '.'],
    [':', '.'],
    ['~', ':'],
    ['~', '.'],
    [',', '.'],
    ['T', '.'],
    ['b', '.'],
    ['f', '.'],
    ['C', '.'],
    ['X', '_'],
    ['w', '_'],
    ['R', 'F'],
    ['=', ':'],
    ['t', 'F'],
    ['#', '~'],
    ['P', ':'],
  ]
  return sheet(
    cases.map(([i, o]) => renderMap(blob(i, o))),
    4,
    4,
  )
}

function main(): void {
  save('tiles', tileSheet())
  save('patches', patchSheet(), 2)

  const bv = beachVillage()
  for (let f = 0; f < 2; f++) {
    const v = renderMap(bv.rows, f, bv.buildings, bv.people, bv.items, bv.surfers)
    if (f === 0) {
      save('scene-village', v, 2)
      save('screen-village', crop(v, 11 * 16 + 8, 6 * 16, 240, 160), ZOOM)
      save('screen-beach', crop(v, 9 * 16, 14 * 16, 240, 160), ZOOM)
      save('screen-meadow', crop(v, 2 * 16, 0, 240, 160), ZOOM)
    }
  }
  const routePeople: Person[] = [
    { look: CAST.player2, facing: 'up', frame: 0, x: 9, y: 9 },
    { look: CAST.hiker, facing: 'left', frame: 0, x: 16, y: 5 },
    { look: CAST.lass, facing: 'down', frame: 0, x: 7, y: 11 },
  ]
  save('scene-route', renderMap(ROUTE, 0, [], routePeople), ZOOM)
  const bi = beaconIsle()
  const isle = renderMap(bi.rows, 1, bi.buildings, bi.people, bi.items)
  save('scene-isle', isle, 2)
  save('screen-isle', crop(isle, 8 * 16, 0, 240, 160), ZOOM)
  save('screen-wreck', crop(isle, 8 * 16, 10 * 16, 240, 160), ZOOM)
  save(
    'scene-cave',
    renderMap(CAVE, 0, [], [
      { look: CAST.player, facing: 'right', frame: 1, x: 5, y: 5 },
      { look: CAST.hiker, facing: 'down', frame: 0, x: 12, y: 3 },
    ]),
    ZOOM,
  )
  save(
    'scene-room',
    renderMap(ROOM, 0, [], [
      { look: CAST.mum, facing: 'down', frame: 0, x: 11, y: 6 },
      { look: CAST.player, facing: 'up', frame: 0, x: 7, y: 7 },
    ]),
    ZOOM,
  )
  save(
    'scene-haven',
    renderMap(HAVEN_ROOM, 0, [], [
      { look: { ...CAST.mum, outfit: 'uniform', top: '#f8a0b0', hair: 'bun', hairColor: '#e05878' }, facing: 'down', frame: 0, x: 7, y: 2 },
      { look: CAST.player2, facing: 'up', frame: 0, x: 7, y: 4 },
      { look: CAST.worker, facing: 'left', frame: 0, x: 11, y: 6 },
    ]),
    ZOOM,
  )
  save(
    'scene-wreck',
    renderMap(WRECK_ROOM, 0, [], [
      { look: CAST.grunt, facing: 'down', frame: 0, x: 7, y: 3 },
      { look: CAST.captain, facing: 'down', frame: 0, x: 10, y: 5, emote: 'angry' },
      { look: CAST.player, facing: 'up', frame: 2, x: 8, y: 7 },
    ]),
    ZOOM,
  )

  // characters: the cast in every facing and frame, then many varied looks
  const facings: Facing[] = ['down', 'up', 'left', 'right']
  const castImgs: Pixels[] = []
  for (const look of Object.values(CAST))
    for (const f of facings)
      for (const fr of [0, 1, 2] as const) {
        const s = tryDraw('character', () => A.characterSprite(look, f, fr))
        if (s) castImgs.push(s)
      }
  save('chars-cast', sheet(castImgs, 12, 2, hex('#98c878')))
  const varied: Pixels[] = []
  for (let i = 0; i < 60; i++)
    for (const f of ['down', 'left', 'up'] as Facing[]) {
      const s = tryDraw('character', () => A.characterSprite(variedLook(i), f, 0))
      if (s) varied.push(s)
    }
  save('chars-varied', sheet(varied, 18, 2, hex('#98c878')))
  const full: Pixels[] = []
  for (let i = 0; i < 36; i++)
    for (const f of facings)
      for (const fr of [0, 1, 2] as const) {
        const s = tryDraw('character', () => A.characterSprite(variedLook(i * 3 + 1), f, fr))
        if (s) full.push(s)
      }
  save('chars-varied-full', sheet(full, 24, 2, hex('#98c878')), 2)
  // every hair × headwear facing down, and every outfit
  const combos: Pixels[] = []
  for (const hair of HAIRS)
    for (const hw of HATS) {
      const s = tryDraw('character', () => A.characterSprite({ ...CAST.player, hair, headwear: hw, headwearColor: '#e05050' }, 'down', 0))
      if (s) combos.push(s)
    }
  save('chars-hair-hats', sheet(combos, HATS.length, 2, hex('#98c878')))
  const outfitImgs: Pixels[] = []
  for (const body of BODIES)
    for (const outfit of OUTFITS)
      for (const sex of ['m', 'f'] as const) {
        const s = tryDraw('character', () => A.characterSprite({ ...CAST.player, body, outfit, sex, headwear: 'none', accessory: 'none' }, 'down', 0))
        if (s) outfitImgs.push(s)
      }
  save('chars-outfits', sheet(outfitImgs, 20, 2, hex('#98c878')))
  const accImgs: Pixels[] = []
  for (const acc of ACCS)
    for (const f of facings) {
      const s = tryDraw('character', () => A.characterSprite({ ...CAST.player2, accessory: acc }, f, 0))
      if (s) accImgs.push(s)
    }
  save('chars-accessories', sheet(accImgs, 8, 2, hex('#98c878')))
  const surf: Pixels[] = []
  for (const f of facings)
    for (const fr of [0, 1] as const) {
      const s = tryDraw('surf', () => A.surfSprite(CAST.player, f, fr))
      if (s) surf.push(s)
    }
  save('surf', sheet(surf, 8, 2, hex('#4890f0')))

  // buildings
  const bimgs: Pixels[] = []
  for (const k of BUILDING_KINDS) {
    const variants = k === 'house' || k === 'hut' ? 4 : k === 'hall' ? 3 : 1
    for (let v = 0; v < variants; v++) {
      const s = tryDraw(`building ${k}`, () => A.buildingSprite(k, v))
      if (s) bimgs.push(s)
    }
  }
  save('buildings', sheet(bimgs, 6, 6, hex('#68c050')), 2)

  // battle stages
  const bgs: A.BattleBg[] = ['grass', 'cave', 'beach', 'water', 'indoor', 'wreck', 'night']
  const stages: Pixels[] = []
  for (const bg of bgs) {
    const b = tryDraw(`bg ${bg}`, () => A.battleBackground(bg))
    if (!b) continue
    const stage = createPixels(240, 160)
    blit(stage, b, 0, 0)
    const foe = tryDraw('platform', () => A.battlePlatform(bg, 'foe'))
    const me = tryDraw('platform', () => A.battlePlatform(bg, 'player'))
    if (foe) blit(stage, foe, 144 - 8, 64)
    if (me) blit(stage, me, -8, 100)
    fillRect(stage, 0, 112, 240, 48, hex('#283848'))
    fillRect(stage, 4, 116, 232, 40, hex('#f8f8f8'))
    const back = tryDraw('playerBack', () => A.playerBack(CAST.player, 0))
    if (back) blit(stage, back, 40, 48)
    stages.push(stage)
  }
  save('battle', sheet(stages, 2, 4), 2)

  // small sprites
  const orbs: Pixels[] = []
  for (const k of ['orb', 'superOrb', 'hyperOrb', 'tideOrb', 'duskOrb'] as A.OrbKind[])
    for (const f of [0, 1, 2, 3, 4] as const) {
      const s = tryDraw('orb', () => A.orbSprite(k, f))
      if (s) orbs.push(s)
    }
  save('orbs', sheet(orbs, 5, 2), 4)
  const smalls: Pixels[] = []
  for (const e of ['exclaim', 'question', 'heart', 'note', 'dots', 'angry'] as A.EmoteKind[]) {
    const s = tryDraw('emote', () => A.emote(e))
    if (s) smalls.push(s)
  }
  const gi = tryDraw('groundItem', () => A.groundItemSprite())
  if (gi) smalls.push(gi)
  for (const fx of Object.keys(A.FIELD_EFFECT_FRAMES) as A.FieldEffect[])
    for (let f = 0; f < A.FIELD_EFFECT_FRAMES[fx]; f++) {
      const s = tryDraw('effect', () => A.fieldEffect(fx, f))
      if (s) smalls.push(s)
    }
  save('small', sheet(smalls, 8, 2, hex('#68c050')), 4)
  const icons: Pixels[] = []
  for (const id of ITEM_IDS) {
    const s = tryDraw(`icon ${id}`, () => A.itemIcon(id))
    if (s) icons.push(s)
  }
  save('items', sheet(icons, 10, 2, hex('#f8f8f8')), 4)

  // portraits and backs
  const ports: Pixels[] = []
  for (const look of Object.values(CAST)) {
    const s = tryDraw('portrait', () => A.trainerPortrait(look))
    if (s) ports.push(s)
  }
  save('portraits', sheet(ports, 8, 2, hex('#e8f0f8')), 2)
  const backs: Pixels[] = []
  for (const look of [CAST.player, CAST.player2])
    for (const f of [0, 1, 2, 3] as const) {
      const s = tryDraw('back', () => A.playerBack(look, f))
      if (s) backs.push(s)
    }
  save('player-back', sheet(backs, 4, 2, hex('#e8f0f8')), 3)

  // title
  const t = tryDraw('title', () => A.titleArt())
  if (t) {
    const screen = createPixels(240, 160)
    blit(screen, t.backdrop, 0, 0)
    blit(screen, t.logo, Math.floor((240 - t.logo.w) / 2), 14)
    save('title', screen, ZOOM)
    save('title-logo', t.logo, ZOOM)
  }
}

main()

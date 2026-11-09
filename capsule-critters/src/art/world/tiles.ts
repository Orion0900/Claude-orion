/**
 * The overworld's 16×16 cells, in four shades. Each cell is drawn as one or
 * two layers, each with a palette slot (see SLOT), so a tree stands on grass
 * and keeps its own greens. Animated cells have several frames.
 */
import { CLEAR, type Sprite } from '../../engine/gfx'
import type { TerrainKind } from '../../world/terrain'
import { lit, Pen, rows, shifted } from './draw'

/** Overworld palette slots: what each slot holds (maps can recolour them). */
export const SLOT = {
  land: 0,
  tree: 1,
  water: 2,
  roof: 3,
  wood: 4,
  roofRed: 5,
  roofBlue: 6,
  stone: 7,
  flower: 8,
  sand: 9,
  people: 10,
  peopleBlue: 11,
  peopleGreen: 12,
  peoplePurple: 13,
  fx: 14,
} as const

export interface Layer {
  /** One sprite, or animation frames shown in turn. */
  frames: Sprite[]
  slot: number
}

export interface TileArt {
  layers: Layer[]
  /** Frames per animation step. */
  speed?: number
  /** For tall grass: the front blades drawn over feet. */
  overlay?: Layer
}

const one = (s: Sprite, slot: number): Layer => ({ frames: [s], slot })

// ─── Ground ───────────────────────────────────────────────────────────────

const GRASS = rows([
  'oooooooooooooooo',
  'oooooooooooxoooo',
  'ooxooooooooxoxoo',
  'oxoxoooooooooooo',
  'oooooooooooooooo',
  'oooooooooooooooo',
  'oooooooxoooooooo',
  'ooooooxoxooooooo',
  'oooooooooooooxoo',
  'ooooooooooooxoxo',
  'oxoooooooooooooo',
  'xoxooooooooooooo',
  'oooooooooooooooo',
  'ooooooooxooooooo',
  'oooooooxoxoooooo',
  'oooooooooooooooo',
])

const PATH = rows([
  '................',
  '.......o........',
  '................',
  '..............o.',
  '...o............',
  '................',
  '..........o.....',
  '................',
  '.o..............',
  '................',
  '.......o........',
  '...............o',
  '...........o....',
  '................',
  '..o.............',
  '................',
])

const TALL = rows([
  'o#oo#ooo#oo#oooo',
  '#x##x#o#x##x#ooo',
  'xxxxxx#xxxxxx#oo',
  'x#xx#xxx#xx#xx#o',
  'xxxxxxxxxxxxxxxx',
  'oxxxxxxoxxxxxxxo',
  'oooooooooooooooo',
  'ooooo#oo#ooo#oo#',
  'ooo#o#x##x#o#x##',
  'oo#xx#xxxxxx#xxx',
  'o#xxx#xx#xx#xx#x',
  '#xxxxxxxxxxxxxxx',
  'xxxxxxxoxxxxxxxx',
  'ooooxoooooooxooo',
  'oooooooooooooooo',
  'oooooooooooooooo',
])

/** The blades in front of whoever stands in tall grass. */
const TALL_FRONT = rows([
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '________________',
  '_____#__#___#__#',
  '___#_#x##x#_#x##',
  '__#xx#xxxxxx#xxx',
  '_#xxx#xx#xx#xx#x',
  '#xxxxxxxxxxxxxxx',
  'xxxxxxxoxxxxxxxx',
  '____x_______x___',
  '________________',
  '________________',
])

const WATER = rows([
  'oooooooooooooooo',
  'oooooooooooooooo',
  'oo..oooooooooooo',
  'o.oo.ooooooo..oo',
  'oooooooooooo.oo.',
  'oooooooooooooooo',
  'oooooooxoooooooo',
  'oooooooooooooooo',
  'ooooooo..ooooooo',
  'oooooo.oo.oooooo',
  'oooooooooooooooo',
  'oooooooooooooxoo',
  'o..ooooooooooooo',
  '.oo.oooooooooooo',
  'oooooooooo..oooo',
  'ooooooooo.oo.ooo',
])

const SAND = rows([
  '................',
  '..o.............',
  '...........o....',
  '................',
  '......o.........',
  '................',
  '.............o..',
  '...o............',
  '................',
  '..........o.....',
  '................',
  '.o..............',
  '.......o........',
  '..............o.',
  '................',
  '....o...........',
])

const SNOW = rows([
  '................',
  '................',
  '......o.........',
  '................',
  '...........o....',
  '................',
  '..o.............',
  '................',
  '................',
  '.........o......',
  '................',
  '................',
  '....o...........',
  '..............o.',
  '................',
  '................',
])

const ASH = rows([
  'oooooooooooooooo',
  'ooxooooooxoooooo',
  'oooooooooooooxoo',
  'oooooxoooooooooo',
  'oxoooooooxoooooo',
  'oooooooooooooooo',
  'ooooooxoooooxooo',
  'oooxoooooooooooo',
  'oooooooooxoooooo',
  'oooooooooooooooo',
  'oxooooxooooooxoo',
  'oooooooooooooooo',
  'ooooooooxooooooo',
  'oooxoooooooooooo',
  'oooooooooooooxoo',
  'oooooooooooooooo',
])

// ─── Things that stand on the ground ──────────────────────────────────────

const TREE = lit(16, 16, (c, p) => {
  const leaf = p.ramp('WLDK')
  c.limb(8, 11, 1.6, 8, 14.5, 1.8, p.ramp('LDDK'), { g: 'trunk' })
  c.circle(8, 6.5, 5.4, leaf, { g: 'crown' })
  c.circle(4.5, 8.5, 3.4, leaf, { g: 'crown' })
  c.circle(11.5, 8.5, 3.4, leaf, { g: 'crown' })
})

const BUSH = lit(16, 16, (c, p) => {
  const leaf = p.ramp('LLDK')
  c.circle(8, 9, 5.5, leaf, { g: 'b' })
  c.circle(5, 10.5, 3.4, leaf, { g: 'b' })
  c.circle(11, 10.5, 3.4, leaf, { g: 'b' })
  c.pxs([6, 6, 10, 7, 4, 10, 12, 11, 8, 12], p.c('K'))
})

const ROCK = lit(16, 16, (c, p) => {
  c.blob(
    [
      [2, 13],
      [3, 7],
      [7, 3.5],
      [12, 4.5],
      [14, 9],
      [13.5, 14],
    ],
    p.ramp('WLDK'),
    { g: 'r', bevel: 2 },
  )
  c.line(6, 9, 9, 7, p.c('D'))
})

const HEDGE = lit(16, 16, (c, p) => {
  c.squircle(8, 8.5, 7, 6.5, 3, p.ramp('LLDK'), { g: 'h' })
  c.pxs([4, 6, 9, 5, 12, 8, 6, 10, 10, 11], p.c('D'))
})

const FENCE = rows([
  '________________',
  '________________',
  '__##________##__',
  '_#..#______#..#_',
  '_#.o#######.o#__',
  '_#.o........o#__',
  '_#.oxxxxxxxx.o#_',
  '_#.o########.o#_',
  '_#.o#______#.o#_',
  '_#.o#######.o#__',
  '_#.o........o#__',
  '_#.oxxxxxxxx.o#_',
  '_#.o########.o#_',
  '_#xo#______#xo#_',
  '__##________##__',
  '________________',
])

const SIGN = rows([
  '________________',
  '________________',
  '_##############_',
  '#..............#',
  '#.oooooooooooo.#',
  '#.o##o###o##oo.#',
  '#.oooooooooooo.#',
  '#.o###o##o###o.#',
  '#.oooooooooooo.#',
  '#oxxxxxxxxxxxxo#',
  '_######..######_',
  '______#.o#______',
  '______#.o#______',
  '______#.o#______',
  '______#xx#______',
  '_______##_______',
])

const MAILBOX = rows([
  '________________',
  '________________',
  '________________',
  '____#######_____',
  '___#.......#____',
  '__#.ooooooo.#___',
  '__#.o#####o.##__',
  '__#.ooooooo.#x#_',
  '__#xxxxxxxxx##__',
  '__###########___',
  '______#.#_______',
  '______#o#_______',
  '______#o#_______',
  '______#x#_______',
  '_____#####______',
  '________________',
])

const LAMP = rows([
  '______###_______',
  '_____#...#______',
  '____#.....#_____',
  '____#.....#_____',
  '_____#...#______',
  '______###_______',
  '______#o#_______',
  '______#o#_______',
  '______#o#_______',
  '______#o#_______',
  '______#o#_______',
  '______#o#_______',
  '______#x#_______',
  '_____#ooo#______',
  '____#xxxxx#_____',
  '_____#####______',
])

const GRAVE = rows([
  '________________',
  '____######______',
  '___#......#_____',
  '__#..oooo..#____',
  '__#.oooooo.#____',
  '__#.o#oo#o.#____',
  '__#.oo##oo.#____',
  '__#.o#oo#o.#____',
  '__#.oooooo.#____',
  '__#.oooooo.#____',
  '__#.oooooo.#____',
  '__#ooooooox#____',
  '_##xxxxxxxx##___',
  '#oxxxxxxxxxxo#__',
  '_############___',
  '________________',
])

/** Flowers sway in two frames. */
const FLOWER_A = rows([
  '________________',
  '__#_____________',
  '_#.#______#_____',
  '__#______#.#____',
  '__x_______#_____',
  '__________x_____',
  '________________',
  '____#___________',
  '___#.#_______#__',
  '____#_______#.#_',
  '____x________#__',
  '_____________x__',
  '________________',
  '________#_______',
  '_______#.#______',
  '________#_______',
])
const FLOWER_B = shifted(FLOWER_A, 1, 0)

/** A ledge: the grass drops away along one edge. */
function ledge(side: 'S' | 'E' | 'W'): Sprite {
  const p = Pen.from(GRASS)
  if (side === 'S') {
    p.rect(0, 11, 16, 1, 2).rect(0, 12, 16, 2, 3).rect(0, 14, 16, 2, 1)
    for (let x = 1; x < 16; x += 4) p.px(x, 11, 3)
  } else {
    const x0 = side === 'E' ? 11 : 4
    const x1 = side === 'E' ? 12 : 3
    p.rect(x0, 0, 1, 16, 2).rect(Math.min(x1, x1 + (side === 'E' ? 0 : -1)), 0, 2, 16, 3)
    p.rect(side === 'E' ? 14 : 0, 0, 2, 16, 1)
  }
  return p.s
}

const STAIRS = rows([
  'xxxxxxxxxxxxxxxx',
  '................',
  'oooooooooooooooo',
  '################',
  'xxxxxxxxxxxxxxxx',
  '................',
  'oooooooooooooooo',
  '################',
  'xxxxxxxxxxxxxxxx',
  '................',
  'oooooooooooooooo',
  '################',
  'xxxxxxxxxxxxxxxx',
  '................',
  'oooooooooooooooo',
  '################',
])

const BRIDGE_H = rows([
  '################',
  'xxxxxxxxxxxxxxxx',
  '##o##o##o##o##o#',
  '.o#.o#.o#.o#.o#.',
  '.o#.o#.o#.o#.o#.',
  '.o#.o#.o#.o#.o#.',
  '.o#.o#.o#.o#.o#.',
  '.o#.o#.o#.o#.o#.',
  '.o#.o#.o#.o#.o#.',
  '.o#.o#.o#.o#.o#.',
  '.o#.o#.o#.o#.o#.',
  '.o#.o#.o#.o#.o#.',
  '.o#.o#.o#.o#.o#.',
  '##o##o##o##o##o#',
  'xxxxxxxxxxxxxxxx',
  '################',
])

const BRIDGE_V = rows([
  '#x.oo.oo.oo.oox#',
  '#x############x#',
  '#x............x#',
  '#xoooooooooooox#',
  '#x############x#',
  '#x............x#',
  '#xoooooooooooox#',
  '#x############x#',
  '#x............x#',
  '#xoooooooooooox#',
  '#x############x#',
  '#x............x#',
  '#xoooooooooooox#',
  '#x############x#',
  '#x............x#',
  '#xoooooooooooox#',
])

const PIER = rows([
  '..o..o..o..o..o.',
  '..o..o..o..o..o.',
  'xx#xx#xx#xx#xx#x',
  '..o..o..o..o..o.',
  '..o..o..o..o..o.',
  '..o..o..o..o..o.',
  'xx#xx#xx#xx#xx#x',
  '..o..o..o..o..o.',
  '..o..o..o..o..o.',
  '..o..o..o..o..o.',
  'xx#xx#xx#xx#xx#x',
  '..o..o..o..o..o.',
  '..o..o..o..o..o.',
  '..o..o..o..o..o.',
  'xx#xx#xx#xx#xx#x',
  '..o..o..o..o..o.',
])

const CAVE_MOUTH = rows([
  'xxxxxxxxxxxxxxxx',
  'xx#xxxxxxxxx#xxx',
  'x#ooxxxxxxxxoo#x',
  'x#o##########o#x',
  '#o##########o#xx',
  '#o############o#',
  '#o############o#',
  '#o############o#',
  '#o############o#',
  '#o############o#',
  '#o############o#',
  '#o############o#',
  '#o############o#',
  'xo############ox',
  'xx############xx',
  'xx############xx',
])

const LAVA = rows([
  'oooooooooooooooo',
  'o..ooooooooooooo',
  '.oo.oooooo..oooo',
  'oooooooooo.oo.oo',
  'ooooooxooooooooo',
  'oooooooooooooooo',
  'ooooo..ooooooooo',
  'oooo.oo.oooooo.o',
  'ooooooooooooo.o.',
  'oxoooooooooooooo',
  'oooooooooo..oooo',
  'ooooooooo.oo.ooo',
  'oo..oooooooooooo',
  'o.oo.ooooooooooo',
  'oooooooooooooxoo',
  'oooooooooooooooo',
])

// ─── Caves ────────────────────────────────────────────────────────────────

const CAVE_FLOOR = rows([
  'oooooooooooooooo',
  'oooooooxoooooooo',
  'oooooooooooooooo',
  'ooxooooooooooooo',
  'oooooooooooooxoo',
  'oooooooooooooooo',
  'oooooxoooooooooo',
  'oooooooooooooooo',
  'ooooooooooxooooo',
  'oxoooooooooooooo',
  'oooooooooooooooo',
  'oooooooooooooxoo',
  'ooooxooooooooooo',
  'oooooooooooooooo',
  'ooooooooooxooooo',
  'oooooooooooooooo',
])

const CAVE_WALL = rows([
  'xxxxx#xxxxxxx#xx',
  'xoxx#xxxoxxx#xxx',
  'xxx#xxxxxxx#oxxx',
  '####oxxxx###xxxx',
  'xxxxxx###xxxxx#x',
  'xoxxx#xxxxxoxx#x',
  'xxxx#xxxxxxxx#xx',
  '###xxxxoxx####xx',
  'xxx#xxxxx#xxxxx#',
  'xxxx#####xxxoxx#',
  'xoxxxxxx#xxxxx#x',
  'xxxxxxxx#xxx###x',
  '####xxx#xxx#xxxx',
  'xxxx###xxx#xxoxx',
  'xxoxxxxxxx#xxxxx',
  'xxxxxxxxxx#xxxxx',
])

const CAVE_ROCK = lit(16, 16, (c, p) => {
  c.blob(
    [
      [2, 14],
      [2.5, 8],
      [6, 3.5],
      [11, 3],
      [14, 8],
      [14, 14],
    ],
    p.ramp('LLDK'),
    { g: 'r', bevel: 2.5 },
  )
  c.line(5, 10, 8, 7, p.c('D'))
  c.line(10, 11, 12, 9, p.c('D'))
})

const LADDER_UP = rows([
  '################',
  '#xxxxxxxxxxxxxx#',
  '#x#o########o#x#',
  '#x#o#xxxxxx#o#x#',
  '#x#o.oooooo.o#x#',
  '#x#o########o#x#',
  '#x#o#xxxxxx#o#x#',
  '#x#o.oooooo.o#x#',
  '#x#o########o#x#',
  '#x#o#xxxxxx#o#x#',
  '#x#o.oooooo.o#x#',
  '#x#o########o#x#',
  '#x#o#xxxxxx#o#x#',
  '#x#o.oooooo.o#x#',
  '#xxxxxxxxxxxxxx#',
  '################',
])

const LADDER_DOWN = rows([
  'oooooooooooooooo',
  'oo############oo',
  'o##############o',
  'o###o######o###o',
  'o###o######o###o',
  'o###o.oooo.o###o',
  'o###o######o###o',
  'o###o######o###o',
  'o###o.oooo.o###o',
  'o###o######o###o',
  'o###o######o###o',
  'o###o.oooo.o###o',
  'o##############o',
  'oo############oo',
  'oooooooooooooooo',
  'oooooooooooooooo',
])

// ─── Indoors ──────────────────────────────────────────────────────────────

const FLOOR = rows([
  '.......o.......o',
  '.......o.......o',
  '.......o.......o',
  'oooooooxoooooooo',
  '...o.......o....',
  '...o.......o....',
  '...o.......o....',
  'oooxoooooooxoooo',
  '.......o.......o',
  '.......o.......o',
  '.......o.......o',
  'oooooooxoooooooo',
  '...o.......o....',
  '...o.......o....',
  '...o.......o....',
  'oooxoooooooxoooo',
])

const FLOOR_TILE = rows([
  '........oooooooo',
  '........oooooooo',
  '........oooooooo',
  '........oooooooo',
  '........oooooooo',
  '........oooooooo',
  '........oooooooo',
  '.......xoooooooo',
  'oooooooo........',
  'oooooooo........',
  'oooooooo........',
  'oooooooo........',
  'oooooooo........',
  'oooooooo........',
  'oooooooo........',
  'ooooooox.......x',
])

const WALL = rows([
  'oooooooooooooooo',
  'oooooooooooooooo',
  'o.oooooooo.ooooo',
  'oooooooooooooooo',
  'oooooooooooooooo',
  'oooooo.ooooooooo',
  'oooooooooooooo.o',
  'oooooooooooooooo',
  'oooooooooooooooo',
  'oo.ooooooo.ooooo',
  'oooooooooooooooo',
  'xxxxxxxxxxxxxxxx',
  '################',
  'xxxxxxxxxxxxxxxx',
  'xxxxxxxxxxxxxxxx',
  '################',
])

const WINDOW = (() => {
  const p = Pen.from(WALL)
  p.rect(2, 1, 12, 9, 3).rect(3, 2, 10, 7, 0).rect(3, 2, 10, 2, 1).vline(8, 2, 7, 3).hline(3, 5, 10, 3)
  p.px(4, 3, 0).px(5, 3, 0)
  return p.s
})()

const MAT = rows([
  '................',
  '................',
  '..############..',
  '..#xoxoxoxoxo#..',
  '..#oxoxoxoxox#..',
  '..#xoxoxoxoxo#..',
  '..#oxoxoxoxox#..',
  '..#xoxoxoxoxo#..',
  '..#oxoxoxoxox#..',
  '..#xoxoxoxoxo#..',
  '..#oxoxoxoxox#..',
  '..#xoxoxoxoxo#..',
  '..############..',
  '................',
  '................',
  '................',
])

const RUG = rows([
  'oooooooooooooooo',
  'oxxxxxxxxxxxxxxo',
  'ox............xo',
  'ox.oooooooooo.xo',
  'ox.o........o.xo',
  'ox.o.xxxxxx.o.xo',
  'ox.o.x....x.o.xo',
  'ox.o.x.##.x.o.xo',
  'ox.o.x.##.x.o.xo',
  'ox.o.x....x.o.xo',
  'ox.o.xxxxxx.o.xo',
  'ox.o........o.xo',
  'ox.oooooooooo.xo',
  'ox............xo',
  'oxxxxxxxxxxxxxxo',
  'oooooooooooooooo',
])

const STAIRS_UP = rows([
  '################',
  '#xxxxxxxxxxxxxx#',
  '#x############x#',
  '#x#..........#x#',
  '#x#oooooooooo#x#',
  '#x############x#',
  '#x#..........#x#',
  '#x#oooooooooo#x#',
  '#x############x#',
  '#x#..........#x#',
  '#x#oooooooooo#x#',
  '#x############x#',
  '#x#..........#x#',
  '#x#oooooooooo#x#',
  '#xxxxxxxxxxxxxx#',
  '################',
])

const STAIRS_DOWN = rows([
  '................',
  '.##############.',
  '.#xxxxxxxxxxxx#.',
  '.#############..',
  '.#oooooooooooo#.',
  '.#############..',
  '.##xxxxxxxxxx##.',
  '.##############.',
  '.###oooooooo###.',
  '.##############.',
  '.####xxxxxx####.',
  '.##############.',
  '.##############.',
  '.##############.',
  '................',
  '................',
])

const TABLE = rows([
  '________________',
  '________________',
  '________________',
  '_##############_',
  '#..............#',
  '#.oooooooooooo.#',
  '#.oooooooooooo.#',
  '#.oooooooooooo.#',
  '#.oooooooooooo.#',
  '#oxxxxxxxxxxxxo#',
  '################',
  '_#xo#______#xo#_',
  '_#xo#______#xo#_',
  '_#xo#______#xo#_',
  '_####______####_',
  '________________',
])

const BED = rows([
  '_##############_',
  '#..............#',
  '#.############.#',
  '#.#..........#.#',
  '#.#.oooooooo.#.#',
  '#.############.#',
  '#oooooooooooooo#',
  '#o.o.o.o.o.o.oo#',
  '#oo.o.o.o.o.o.o#',
  '#o.o.o.o.o.o.oo#',
  '#oo.o.o.o.o.o.o#',
  '#o.o.o.o.o.o.oo#',
  '#xxxxxxxxxxxxxx#',
  '################',
  '_#x#________#x#_',
  '_###________###_',
])

const TV = rows([
  '________________',
  '__#####__#####__',
  '______#__#______',
  '_______##_______',
  '_##############_',
  '#oooooooooooooo#',
  '#o##########o#o#',
  '#o#..xxxxxx#o#o#',
  '#o#.xxxxxxx#ooo#',
  '#o#xxxxxxxx#o#o#',
  '#o#xxxxxxxx#ooo#',
  '#o##########o#o#',
  '#oooooooooooooo#',
  '#xxxxxxxxxxxxxx#',
  '_##############_',
  '__##________##__',
])

const BOOKSHELF = rows([
  '################',
  '#xxxxxxxxxxxxxx#',
  '#x#o#.#x#o#o##x#',
  '#x#o#.#x#o#o#.x#',
  '#x#o#.#x#o#o#.x#',
  '#x#o#.#x#o#o#.x#',
  '#xxxxxxxxxxxxxx#',
  '################',
  '#xxxxxxxxxxxxxx#',
  '#x#.#o#o##x#.#x#',
  '#x#.#o#o#.x#.#x#',
  '#x#.#o#o#.x#.#x#',
  '#x#.#o#o#.x#.#x#',
  '#xxxxxxxxxxxxxx#',
  '################',
  '_#x#________#x#_',
])

const PLANT = lit(16, 16, (c, p) => {
  const leaf = p.ramp('WLDK')
  c.leaf(8, 9, 3, 2, 3, leaf, { g: 'l1' }, 0.3)
  c.leaf(8, 9, 13, 2, 3, leaf, { g: 'l2' }, -0.3)
  c.leaf(8, 9, 8, 0.5, 3, leaf, { g: 'l3' })
  c.squircle(8, 12.5, 4.5, 3, 2.4, p.ramp('LDDK'), { g: 'pot' })
})

const COUNTER = rows([
  '################',
  '#..............#',
  '#.oooooooooooo.#',
  '#oxxxxxxxxxxxxo#',
  '################',
  '#xxxxxxxxxxxxxx#',
  '#xoooooooooooox#',
  '#xoooooooooooox#',
  '#xoooooooooooox#',
  '#xoooooooooooox#',
  '#xoooooooooooox#',
  '#xoooooooooooox#',
  '#xoooooooooooox#',
  '#xxxxxxxxxxxxxx#',
  '################',
  '________________',
])

const PC = rows([
  '________________',
  '_##############_',
  '#oooooooooooooo#',
  '#o############o#',
  '#o#..........#o#',
  '#o#.o..o.o...#o#',
  '#o#..........#o#',
  '#o#.oo.o..o..#o#',
  '#o############o#',
  '#oooooooooooooo#',
  '################',
  '#xxxxxxxxxxxxxx#',
  '#x.o.o.o.o.o.ox#',
  '#xxxxxxxxxxxxxx#',
  '################',
  '________________',
])

const HEALER = rows([
  '________________',
  '_##############_',
  '#oooooooooooooo#',
  '#o###o####o###o#',
  '#o#.#o#..#o#.#o#',
  '#o###o####o###o#',
  '#oooooooooooooo#',
  '#oooooo##oooooo#',
  '#ooooo#..#ooooo#',
  '#oooo#....#oooo#',
  '#ooooo#..#ooooo#',
  '#oooooo##oooooo#',
  '#xxxxxxxxxxxxxx#',
  '################',
  '#xxxxxxxxxxxxxx#',
  '################',
])

const SHELF = rows([
  '################',
  '#xxxxxxxxxxxxxx#',
  '#x##.#.##o#.##x#',
  '#x#o.#.#oo#.#ox#',
  '#x###########xx#',
  '#xxxxxxxxxxxxxx#',
  '#x#.##o#.##o##x#',
  '#x#.#oo#.#oo#ox#',
  '#x###########xx#',
  '#xxxxxxxxxxxxxx#',
  '#x##o##.#o#.##x#',
  '#x#oo#..#o#..#x#',
  '#x###########xx#',
  '#xxxxxxxxxxxxxx#',
  '################',
  '_##__________##_',
])

const MACHINE = rows([
  '################',
  '#oooooooooooooo#',
  '#o############o#',
  '#o#.x.x...x..#o#',
  '#o#..x.x.x.x.#o#',
  '#o#x...x...x.#o#',
  '#o############o#',
  '#oooooooooooooo#',
  '#o.#o.#o#.o#.oo#',
  '#oooooooooooooo#',
  '#o##o##o##o##oo#',
  '#o##o##o##o##oo#',
  '#oooooooooooooo#',
  '#xxxxxxxxxxxxxx#',
  '################',
  '________________',
])

const CRATE = rows([
  '________________',
  '_##############_',
  '#oooooooooooooo#',
  '#o#xxxxxxxxxx#o#',
  '#ox#xxxxxxxx#xo#',
  '#oxx#xxxxxx#xxo#',
  '#oxxx#xxxx#xxxo#',
  '#oxxxx#xx#xxxxo#',
  '#oxxxx#xx#xxxxo#',
  '#oxxx#xxxx#xxxo#',
  '#oxx#xxxxxx#xxo#',
  '#ox#xxxxxxxx#xo#',
  '#o#xxxxxxxxxx#o#',
  '#oooooooooooooo#',
  '_##############_',
  '________________',
])

const STATUE = lit(16, 16, (c, p) => {
  const stone = p.ramp('WLDK')
  c.squircle(8, 13.5, 6, 2.2, 2.5, p.ramp('LDDK'), { g: 'base' })
  c.ellipse(8, 9, 3.6, 3.6, stone, { g: 'body' })
  c.circle(8, 4.5, 2.8, stone, { g: 'head' })
  c.circle(5.5, 2.2, 1.2, stone, { g: 'ear1' })
  c.circle(10.5, 2.2, 1.2, stone, { g: 'ear2' })
})

const PILLAR = rows([
  '_##############_',
  '#..............#',
  '#oooooooooooooo#',
  '_##############_',
  '__#.oo.oo.oox#__',
  '__#.oo.oo.oox#__',
  '__#.oo.oo.oox#__',
  '__#.oo.oo.oox#__',
  '__#.oo.oo.oox#__',
  '__#.oo.oo.oox#__',
  '__#.oo.oo.oox#__',
  '__#.oo.oo.oox#__',
  '_##############_',
  '#oooooooooooooo#',
  '#xxxxxxxxxxxxxx#',
  '################',
])

const ARENA = rows([
  '..............o.',
  '.oooooooooooooo.',
  '.o............x.',
  '.o............x.',
  '.o............x.',
  '.o............x.',
  '.o............x.',
  '.o............x.',
  '.o............x.',
  '.o............x.',
  '.o............x.',
  '.o............x.',
  '.o............x.',
  '.o............x.',
  '.xxxxxxxxxxxxxx.',
  'o...............',
])

const VOID = rows(Array.from({ length: 16 }, () => '################'))

// ─── The table ────────────────────────────────────────────────────────────

const onGrass = (s: Sprite, slot: number): TileArt => ({ layers: [one(GRASS, SLOT.land), one(s, slot)] })
const plain = (s: Sprite, slot: number): TileArt => ({ layers: [one(s, slot)] })
const onFloor = (s: Sprite, slot: number): TileArt => ({ layers: [one(FLOOR, SLOT.land), one(s, slot)] })

export const TILE_ART: Readonly<Record<TerrainKind, TileArt>> = {
  grass: plain(GRASS, SLOT.land),
  tall: { layers: [one(TALL, SLOT.tree)], overlay: one(TALL_FRONT, SLOT.tree) },
  flowers: { layers: [one(GRASS, SLOT.land), { frames: [FLOWER_A, FLOWER_B], slot: SLOT.flower }], speed: 40 },
  path: plain(PATH, SLOT.land),
  sand: plain(SAND, SLOT.sand),
  water: { layers: [{ frames: [WATER, shifted(WATER, 1, 0), shifted(WATER, 2, 0), shifted(WATER, 1, 0)], slot: SLOT.water }], speed: 24 },
  ledgeS: plain(ledge('S'), SLOT.land),
  ledgeE: plain(ledge('E'), SLOT.land),
  ledgeW: plain(ledge('W'), SLOT.land),
  tree: onGrass(TREE, SLOT.tree),
  bush: onGrass(BUSH, SLOT.tree),
  rock: onGrass(ROCK, SLOT.stone),
  fence: onGrass(FENCE, SLOT.wood),
  sign: onGrass(SIGN, SLOT.wood),
  mailbox: onGrass(MAILBOX, SLOT.wood),
  stairs: plain(STAIRS, SLOT.stone),
  bridgeH: plain(BRIDGE_H, SLOT.wood),
  bridgeV: plain(BRIDGE_V, SLOT.wood),
  pier: plain(PIER, SLOT.wood),
  caveEntrance: plain(CAVE_MOUTH, SLOT.stone),
  hedge: onGrass(HEDGE, SLOT.tree),
  lamp: { layers: [one(PATH, SLOT.land), one(LAMP, SLOT.stone)] },
  snow: plain(SNOW, SLOT.land),
  ash: plain(ASH, SLOT.land),
  lava: { layers: [{ frames: [LAVA, shifted(LAVA, 1, 0), shifted(LAVA, 2, 1), shifted(LAVA, 1, 1)], slot: SLOT.flower }], speed: 30 },
  graves: onGrass(GRAVE, SLOT.stone),
  caveFloor: plain(CAVE_FLOOR, SLOT.land),
  caveWall: plain(CAVE_WALL, SLOT.stone),
  caveRock: { layers: [one(CAVE_FLOOR, SLOT.land), one(CAVE_ROCK, SLOT.stone)] },
  ladderUp: plain(LADDER_UP, SLOT.wood),
  ladderDown: { layers: [one(CAVE_FLOOR, SLOT.land), one(LADDER_DOWN, SLOT.wood)] },
  caveWater: { layers: [{ frames: [WATER, shifted(WATER, 1, 0), shifted(WATER, 2, 0), shifted(WATER, 1, 0)], slot: SLOT.water }], speed: 24 },
  floor: plain(FLOOR, SLOT.land),
  floorTile: plain(FLOOR_TILE, SLOT.land),
  wall: plain(WALL, SLOT.wood),
  window: plain(WINDOW, SLOT.wood),
  mat: { layers: [one(FLOOR, SLOT.land), one(MAT, SLOT.roof)] },
  rug: plain(RUG, SLOT.roof),
  stairsUp: plain(STAIRS_UP, SLOT.wood),
  stairsDown: plain(STAIRS_DOWN, SLOT.wood),
  table: onFloor(TABLE, SLOT.wood),
  bed: onFloor(BED, SLOT.roof),
  tv: onFloor(TV, SLOT.stone),
  bookshelf: onFloor(BOOKSHELF, SLOT.wood),
  plant: onFloor(PLANT, SLOT.tree),
  counter: plain(COUNTER, SLOT.wood),
  pc: onFloor(PC, SLOT.stone),
  healer: plain(HEALER, SLOT.roofRed),
  shelf: onFloor(SHELF, SLOT.wood),
  machine: onFloor(MACHINE, SLOT.stone),
  crate: onFloor(CRATE, SLOT.wood),
  statue: { layers: [one(ARENA, SLOT.land), one(STATUE, SLOT.stone)] },
  pillar: { layers: [one(ARENA, SLOT.land), one(PILLAR, SLOT.stone)] },
  arenaFloor: plain(ARENA, SLOT.land),
  void: plain(VOID, SLOT.land),
}

/** The frame of a layer to show at a game tick. */
export function layerFrame(l: Layer, frame: number, speed = 30): Sprite {
  return l.frames.length === 1 ? l.frames[0] : l.frames[Math.floor(frame / speed) % l.frames.length]
}

export { CLEAR }

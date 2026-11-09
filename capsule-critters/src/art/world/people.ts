/**
 * People on the overworld: 16×16 sprites in four shades, built from a body
 * template per direction and walking frame, then dressed with a hairstyle or
 * hat and extras. Colour comes from the palette slot the person is drawn
 * with (red, blue, green or purple clothes over the same skin tones).
 *
 * Template letters: '#' outline, 'E' eye, 'S' skin, 'H' hair, 'C' clothes,
 * 'P' legs, '.' clear.
 */
import { CLEAR, flipped, makeSprite, type Sprite } from '../../engine/gfx'
import type { Facing } from '../../game/state'

type Grid = string[]

const DOWN: Grid = [
  '................',
  '.....######.....',
  '....#HHHHHH#....',
  '...#HHHHHHHH#...',
  '...#HHHHHHHH#...',
  '...#HSSSSSSH#...',
  '...#SESSSSES#...',
  '...#SSSSSSSS#...',
  '....#SSSSSS#....',
  '...##CCCCCC##...',
  '..#SCCCCCCCCS#..',
  '..#SCCCCCCCCS#..',
  '...##CCCCCC##...',
  '....#PPPPPP#....',
  '....#PP##PP#....',
  '....###..###....',
]

const DOWN_WALK: Grid = [
  '................',
  '.....######.....',
  '....#HHHHHH#....',
  '...#HHHHHHHH#...',
  '...#HHHHHHHH#...',
  '...#HSSSSSSH#...',
  '...#SESSSSES#...',
  '...#SSSSSSSS#...',
  '....#SSSSSS#....',
  '...##CCCCCC##...',
  '..#SCCCCCCCCS#..',
  '..#SCCCCCCCC##..',
  '...##CCCCCC#....',
  '....#PPPPPP#....',
  '....#PP##P#.....',
  '....###..##.....',
]

const UP: Grid = [
  '................',
  '.....######.....',
  '....#HHHHHH#....',
  '...#HHHHHHHH#...',
  '...#HHHHHHHH#...',
  '...#HHHHHHHH#...',
  '...#HHHHHHHH#...',
  '...#SHHHHHHS#...',
  '....#SSSSSS#....',
  '...##CCCCCC##...',
  '..#SCCCCCCCCS#..',
  '..#SCCCCCCCCS#..',
  '...##CCCCCC##...',
  '....#PPPPPP#....',
  '....#PP##PP#....',
  '....###..###....',
]

const UP_WALK: Grid = [
  '................',
  '.....######.....',
  '....#HHHHHH#....',
  '...#HHHHHHHH#...',
  '...#HHHHHHHH#...',
  '...#HHHHHHHH#...',
  '...#HHHHHHHH#...',
  '...#SHHHHHHS#...',
  '....#SSSSSS#....',
  '...##CCCCCC##...',
  '..#SCCCCCCCCS#..',
  '..##CCCCCCCCS#..',
  '....#CCCCCC##...',
  '....#PPPPPP#....',
  '.....#P##PP#....',
  '.....##..###....',
]

const LEFT: Grid = [
  '................',
  '.....######.....',
  '....#HHHHHH#....',
  '...#HHHHHHHH#...',
  '...#HHHHHHHH#...',
  '...#SSHHHHHH#...',
  '..#SESSHHHHH#...',
  '...#SSSSSSSH#...',
  '....#SSSSSS#....',
  '.....#CCCC#.....',
  '....#CCSCCC#....',
  '....#CCSCCC#....',
  '.....#CCCC#.....',
  '.....#PPPP#.....',
  '.....#PPPP#.....',
  '.....##..##.....',
]

const LEFT_WALK: Grid = [
  '................',
  '.....######.....',
  '....#HHHHHH#....',
  '...#HHHHHHHH#...',
  '...#HHHHHHHH#...',
  '...#SSHHHHHH#...',
  '..#SESSHHHHH#...',
  '...#SSSSSSSH#...',
  '....#SSSSSS#....',
  '.....#CCCC#.....',
  '....#CSCCCC#....',
  '...#SCCCCCC#....',
  '....##CCCC#.....',
  '....#PPPPP#.....',
  '...#PP#.#PP#....',
  '...##....##.....',
]

export type HairStyle = 'short' | 'spiky' | 'long' | 'bald' | 'bun' | 'cap' | 'beanie' | 'hood' | 'helmet' | 'bow' | 'hat'

export interface Look {
  hair: HairStyle
  /** Hair or hat shade, 2 or 3. */
  hairShade?: number
  /** Clothes shade: 0 white, 1 skin-light, 2 colour, 3 black. */
  clothes?: number
  legs?: number
  /** Extras drawn on top. */
  extras?: readonly ('bag' | 'glasses' | 'beard' | 'scarf' | 'apron' | 'cane' | 'coat' | 'net' | 'pack')[]
  /** Palette slot offset: 0 red, 1 blue, 2 green, 3 purple. */
  tint?: 0 | 1 | 2 | 3
}

function shadeOf(ch: string, look: Look): number {
  switch (ch) {
    case '#':
    case 'E':
      return 3
    case 'S':
      return 1
    case 'H':
      return look.hairShade ?? 3
    case 'C':
      return look.clothes ?? 2
    case 'P':
      return look.legs ?? 3
    default:
      return CLEAR
  }
}

type View = 'down' | 'up' | 'left'

/** Rewrites the head rows of a template for a hairstyle. */
function styleHead(g: Grid, style: HairStyle, view: View): Grid {
  const r = g.map((row) => row.split(''))
  const set = (x: number, y: number, c: string) => {
    if (y >= 0 && y < 16 && x >= 0 && x < 16) r[y][x] = c
  }
  const row = (y: number, s: string) => {
    r[y] = s.split('')
  }
  switch (style) {
    case 'short':
      break
    case 'spiky':
      row(0, '....#.#..#.#....')
      row(1, '...#H#H##H#H#...')
      break
    case 'long':
      for (const y of [6, 7, 8, 9]) {
        if (view !== 'left') {
          set(3, y, 'H')
          set(12, y, 'H')
          set(2, y, '#')
          set(13, y, '#')
        } else {
          set(11, y, 'H')
          set(12, y, 'H')
          set(13, y, '#')
        }
      }
      break
    case 'bald':
      for (let y = 2; y <= 7; y++) for (let x = 0; x < 16; x++) if (r[y][x] === 'H') r[y][x] = y <= 2 ? 'S' : 'S'
      if (view === 'up') for (let x = 4; x <= 11; x++) set(x, 6, 'H')
      break
    case 'bun':
      row(0, '......####......')
      set(6, 1, '#')
      set(9, 1, '#')
      for (let x = 7; x <= 8; x++) set(x, 1, 'H')
      break
    case 'cap':
      row(1, '.....######.....')
      row(2, '....#CCCCCC#....')
      row(3, '...#CCCCCCCC#...')
      if (view === 'down') row(4, '..##########....'.replace(/^(..)/, '..'))
      if (view === 'down') row(4, '..############..')
      if (view === 'left') row(4, '.#########HH#...')
      if (view === 'up') row(4, '...#CCCCCCCC#...')
      break
    case 'beanie':
      row(0, '.......##.......')
      row(1, '.....##CC##.....')
      row(2, '....#CCCCCC#....')
      row(3, '...#CCCCCCCC#...')
      row(4, '...#CxCxCxCx#...'.replace(/x/g, 'C'))
      if (view !== 'up') row(4, '...##########...')
      break
    case 'hood':
      row(1, '.....######.....')
      row(2, '....#CCCCCC#....')
      row(3, '...#CCCCCCCC#...')
      for (const y of [4, 5, 6, 7]) {
        if (view === 'up') {
          for (let x = 4; x <= 11; x++) set(x, y, 'C')
        } else if (view === 'down') {
          set(4, y, 'C')
          set(11, y, 'C')
        } else {
          for (let x = 7; x <= 11; x++) set(x, y, 'C')
        }
      }
      break
    case 'helmet':
      row(1, '....########....')
      row(2, '...#........#...')
      row(3, '...#........#...')
      row(4, '...##########...')
      break
    case 'bow':
      row(0, '..##........##..')
      row(1, '..#C#######C#...'.slice(0, 16))
      row(1, '.#CC#######CC#..')
      break
    case 'hat':
      row(0, '.....######.....')
      row(1, '....#CCCCCC#....')
      row(2, '....#CCCCCC#....')
      row(3, '.##############.')
      row(4, '...#HHHHHHHH#...')
      break
  }
  return r.map((x) => x.join(''))
}

function render(g: Grid, look: Look): Sprite {
  const s = makeSprite(16, 16)
  g.forEach((row, y) => {
    for (let x = 0; x < 16; x++) s.px[y * 16 + x] = shadeOf(row[x] ?? '.', look)
  })
  return s
}

function addExtras(s: Sprite, look: Look, view: View): void {
  const put = (x: number, y: number, v: number) => {
    if (x >= 0 && y >= 0 && x < 16 && y < 16) s.px[y * 16 + x] = v
  }
  for (const e of look.extras ?? []) {
    switch (e) {
      case 'bag':
      case 'pack':
        if (view === 'up') for (let y = 9; y <= 13; y++) for (let x = 5; x <= 10; x++) put(x, y, y === 9 || y === 13 || x === 5 || x === 10 ? 3 : e === 'pack' ? 1 : 0)
        if (view === 'left') for (let y = 9; y <= 13; y++) for (let x = 10; x <= 12; x++) put(x, y, x === 12 || y === 9 || y === 13 ? 3 : 0)
        if (view === 'down') {
          put(4, 9, 3)
          put(11, 9, 3)
        }
        break
      case 'glasses':
        if (view === 'down') {
          for (const x of [4, 5, 6, 9, 10, 11]) put(x, 6, 3)
          put(5, 6, 0)
          put(10, 6, 0)
        } else if (view === 'left') {
          for (const x of [3, 4, 5]) put(x, 6, 3)
          put(4, 6, 0)
        }
        break
      case 'beard':
        if (view === 'down') for (let x = 5; x <= 10; x++) put(x, 8, 0)
        if (view === 'down') for (let x = 6; x <= 9; x++) put(x, 9, 0)
        if (view === 'left') for (let x = 4; x <= 7; x++) put(x, 8, 0)
        break
      case 'scarf':
        if (view !== 'up') for (let x = 5; x <= 10; x++) put(x, 9, 2)
        if (view === 'up') for (let x = 4; x <= 11; x++) put(x, 9, 2)
        if (view === 'left') {
          put(11, 10, 2)
          put(11, 11, 2)
        }
        break
      case 'apron':
        if (view === 'down') for (let y = 10; y <= 13; y++) for (let x = 6; x <= 9; x++) put(x, y, 0)
        break
      case 'coat':
        if (view === 'down') for (let y = 10; y <= 14; y++) {
          put(4, y, 0)
          put(11, y, 0)
          if (y >= 13) {
            put(3, y, 3)
            put(12, y, 3)
          }
        }
        if (view === 'up') for (let y = 10; y <= 14; y++) for (let x = 4; x <= 11; x++) put(x, y, y === 14 ? 3 : 0)
        break
      case 'cane':
        if (view === 'down') for (let y = 9; y <= 15; y++) put(13, y, 3)
        if (view === 'left') for (let y = 9; y <= 15; y++) put(3, y, 3)
        break
      case 'net':
        if (view === 'down') {
          for (let y = 3; y <= 12; y++) put(14, y, 3)
          for (const [x, y] of [[13, 1], [14, 1], [15, 1], [12, 2], [15, 2], [12, 3], [15, 3], [13, 4], [14, 4]]) put(x, y, 3)
        }
        if (view === 'left') for (let y = 4; y <= 12; y++) put(2, y, 3)
        break
    }
  }
}

export interface PersonSprites {
  /** [standing, walking] per facing; right is the mirrored left. */
  frames: Record<Facing, [Sprite, Sprite, Sprite]>
}

const cache = new Map<string, PersonSprites>()

/** All the frames for a look. Walking alternates frames 1 and 2 with 0 between. */
export function person(look: Look): PersonSprites {
  const key = JSON.stringify(look)
  const hit = cache.get(key)
  if (hit) return hit
  const make = (g: Grid, view: View) => {
    const s = render(styleHead(g, look.hair, view), look)
    addExtras(s, look, view)
    return s
  }
  const down = make(DOWN, 'down')
  const downW = make(DOWN_WALK, 'down')
  const up = make(UP, 'up')
  const upW = make(UP_WALK, 'up')
  const left = make(LEFT, 'left')
  const leftW = make(LEFT_WALK, 'left')
  const out: PersonSprites = {
    frames: {
      down: [down, downW, flipped(downW)],
      up: [up, upW, flipped(upW)],
      left: [left, leftW, leftW],
      right: [flipped(left), flipped(leftW), flipped(leftW)],
    },
  }
  cache.set(key, out)
  return out
}

/** The cast. Each look pairs with a palette tint for its clothes. */
export const PEOPLE = {
  player: { hair: 'beanie', hairShade: 2, clothes: 2, legs: 3, extras: ['pack', 'scarf'], tint: 0 },
  rival: { hair: 'spiky', hairShade: 3, clothes: 2, legs: 3, tint: 1 },
  prof: { hair: 'bun', hairShade: 0, clothes: 0, legs: 3, extras: ['coat', 'glasses'], tint: 3 },
  mom: { hair: 'long', hairShade: 2, clothes: 2, legs: 2, extras: ['apron'], tint: 0 },
  nurse: { hair: 'cap', hairShade: 2, clothes: 0, legs: 0, tint: 0 },
  clerk: { hair: 'short', hairShade: 2, clothes: 2, legs: 3, extras: ['apron'], tint: 1 },
  boy: { hair: 'short', hairShade: 3, clothes: 2, legs: 3, tint: 1 },
  girl: { hair: 'long', hairShade: 2, clothes: 2, legs: 2, tint: 0 },
  lass: { hair: 'bow', hairShade: 2, clothes: 2, legs: 2, tint: 3 },
  youngster: { hair: 'cap', hairShade: 3, clothes: 2, legs: 3, tint: 2 },
  oldMan: { hair: 'bald', hairShade: 2, clothes: 2, legs: 3, extras: ['beard', 'cane'], tint: 2 },
  oldWoman: { hair: 'bun', hairShade: 1, clothes: 2, legs: 2, extras: ['cane'], tint: 3 },
  man: { hair: 'short', hairShade: 3, clothes: 2, legs: 3, tint: 2 },
  woman: { hair: 'long', hairShade: 3, clothes: 2, legs: 2, tint: 1 },
  scientist: { hair: 'short', hairShade: 2, clothes: 0, legs: 3, extras: ['coat', 'glasses'], tint: 1 },
  hiker: { hair: 'hat', hairShade: 2, clothes: 2, legs: 3, extras: ['pack', 'beard'], tint: 2 },
  bugKid: { hair: 'cap', hairShade: 2, clothes: 2, legs: 3, extras: ['net'], tint: 2 },
  fisher: { hair: 'hat', hairShade: 2, clothes: 2, legs: 3, tint: 1 },
  sailor: { hair: 'cap', hairShade: 0, clothes: 0, legs: 2, tint: 1 },
  grunt: { hair: 'hood', hairShade: 3, clothes: 3, legs: 3, extras: ['scarf'], tint: 3 },
  boss: { hair: 'short', hairShade: 3, clothes: 3, legs: 3, extras: ['coat'], tint: 3 },
  medium: { hair: 'long', hairShade: 3, clothes: 3, legs: 3, tint: 3 },
  brawler: { hair: 'bald', hairShade: 2, clothes: 0, legs: 3, tint: 0 },
  biker: { hair: 'helmet', hairShade: 2, clothes: 3, legs: 3, tint: 0 },
  gentleman: { hair: 'hat', hairShade: 3, clothes: 3, legs: 3, extras: ['beard'], tint: 1 },
  beauty: { hair: 'long', hairShade: 2, clothes: 2, legs: 2, tint: 3 },
  swimmer: { hair: 'bald', hairShade: 2, clothes: 1, legs: 1, tint: 1 },
  guard: { hair: 'helmet', hairShade: 2, clothes: 2, legs: 3, tint: 1 },
  ace: { hair: 'spiky', hairShade: 2, clothes: 2, legs: 3, extras: ['coat'], tint: 0 },
} as const satisfies Record<string, Look>

export type PersonId = keyof typeof PEOPLE

/** A capsule lying on the ground: an item to pick up. */
export const ITEM_BALL: Sprite = (() => {
  const g = [
    '................',
    '................',
    '................',
    '................',
    '.....######.....',
    '....#......#....',
    '...#.oo.....#...',
    '...#.o......#...',
    '...##########...',
    '...#xxxx#xxx#...',
    '...#xxx#.#xx#...',
    '...#xxxx#xxx#...',
    '....#xxxxxx#....',
    '.....######.....',
    '................',
    '................',
  ]
  const s = makeSprite(16, 16)
  g.forEach((row, y) => {
    for (let x = 0; x < 16; x++) s.px[y * 16 + x] = row[x] === '#' ? 3 : row[x] === 'x' ? 2 : row[x] === 'o' ? 1 : row[x] === '.' && y >= 4 && y <= 13 && x >= 3 && x <= 12 && inside(g, x, y) ? 0 : CLEAR
  })
  return s
})()

function inside(g: string[], x: number, y: number): boolean {
  const row = g[y]
  const l = row.indexOf('#')
  const r = row.lastIndexOf('#')
  return l >= 0 && x > l && x < r
}

/** The "!" a trainer shows on spotting you. */
export const EMOTE: Sprite = (() => {
  const g = ['..####..', '.#....#.', '.#.##.#.', '.#.##.#.', '.#.##.#.', '.#....#.', '.#.##.#.', '..####..']
  const s = makeSprite(8, 8)
  g.forEach((row, y) => {
    for (let x = 0; x < 8; x++) s.px[y * 8 + x] = row[x] === '#' ? 3 : row[x] === '.' && x > 0 && x < 7 && y > 0 && y < 7 ? 0 : CLEAR
  })
  return s
})()

/** A small round shadow under a hopping person. */
export const SHADOW: Sprite = (() => {
  const s = makeSprite(16, 4)
  for (let x = 4; x < 12; x++) {
    s.px[1 * 16 + x] = 2
    s.px[2 * 16 + x] = 2
  }
  for (const x of [5, 6, 7, 8, 9, 10]) s.px[3 * 16 + x] = 2
  for (const x of [5, 6, 7, 8, 9, 10]) s.px[x] = 2
  return s
})()

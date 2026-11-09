/**
 * Four-colour palettes. Everything on screen is drawn in four shades —
 * 0 lightest, 3 darkest — like a handheld LCD, and a palette decides what
 * those shades look like. In COLOR mode each part of the screen gets its own
 * palette (trees green, water blue, a fire critter red), the way colour
 * handhelds tinted monochrome games; in the mono modes one palette paints
 * everything.
 */

/** Lightest to darkest, as 0xRRGGBB. */
export type Palette = readonly [number, number, number, number]

/** The screen-wide display modes the player can pick in OPTIONS. */
export const DISPLAY_MODES = ['COLOR', 'CLASSIC', 'POCKET', 'SEPIA'] as const
export type DisplayMode = (typeof DISPLAY_MODES)[number]

/** The single palettes the mono modes use for everything. */
export const MONO: Readonly<Record<Exclude<DisplayMode, 'COLOR'>, Palette>> = {
  CLASSIC: [0xd8f0b0, 0x88b858, 0x386848, 0x102818],
  POCKET: [0xf0f0e8, 0xa8a8a0, 0x585860, 0x181820],
  SEPIA: [0xf8ecd0, 0xc8a878, 0x7c5838, 0x281810],
}

/** Named palettes for COLOR mode. */
export const PAL = {
  // Interface.
  ui: [0xf8f8f8, 0xa8c8f0, 0x4870b0, 0x101820],
  uiWarm: [0xfcf8f0, 0xf0c890, 0xa86838, 0x201810],
  black: [0xf8f8f8, 0x909098, 0x404048, 0x000000],
  title: [0xf8f8f8, 0xf8d058, 0xd04830, 0x181030],

  // Health bar: green while healthy, then amber, then red.
  hpGreen: [0xf8f8f8, 0x70d850, 0x309030, 0x101810],
  hpAmber: [0xf8f8f8, 0xf8c840, 0xb88010, 0x201808],
  hpRed: [0xf8f8f8, 0xf87050, 0xb82820, 0x201010],
  xp: [0xf8f8f8, 0x88b8f8, 0x3060d0, 0x101820],

  // Critters, by their main colour.
  red: [0xf8f8f8, 0xf8a070, 0xc83828, 0x200c0c],
  orange: [0xf8f8f0, 0xf8c070, 0xd06818, 0x201008],
  yellow: [0xf8f8f0, 0xf8e070, 0xb88c18, 0x201808],
  green: [0xf8f8f0, 0x98d870, 0x388038, 0x102010],
  teal: [0xf0f8f8, 0x80d8c8, 0x28887c, 0x081818],
  blue: [0xf8f8f8, 0x88b8f8, 0x3058c0, 0x0c1020],
  purple: [0xf8f8f8, 0xc8a8f0, 0x7048a8, 0x180c24],
  pink: [0xf8f8f8, 0xf8b0d0, 0xc04880, 0x200818],
  brown: [0xf8f8f0, 0xd8a878, 0x885030, 0x201008],
  gray: [0xf8f8f8, 0xb8b8c8, 0x686878, 0x101018],
  gold: [0xf8f8e8, 0xf0d070, 0xa87818, 0x281808],
  ice: [0xf8f8ff, 0xb0e0f8, 0x5890c8, 0x101828],
  night: [0xe8e0f8, 0x9888c8, 0x403870, 0x080818],

  // The overworld.
  land: [0xf8f8e0, 0xc8e098, 0x78a858, 0x203820],
  sand: [0xf8f8e8, 0xf0d8a0, 0xb08858, 0x302010],
  tree: [0xf0f8d8, 0x88c860, 0x307838, 0x082010],
  water: [0xf0f8ff, 0x88c0f8, 0x3870c8, 0x081030],
  roofRed: [0xf8f0e8, 0xf09878, 0xb83830, 0x281010],
  roofBlue: [0xf0f8ff, 0x90b8f0, 0x3858b0, 0x101028],
  roofGreen: [0xf0f8e8, 0xa0d888, 0x387848, 0x102018],
  roofPurple: [0xf8f0ff, 0xc8a8e8, 0x684898, 0x180c28],
  roofTeal: [0xf0fff8, 0x88d8c8, 0x287870, 0x081818],
  roofOrange: [0xfff8e8, 0xf8c070, 0xc06818, 0x281408],
  wall: [0xf8f8f0, 0xd8d0c0, 0x887868, 0x201810],
  wood: [0xf8f0e0, 0xd8a870, 0x805830, 0x201008],
  stone: [0xf0f0f0, 0xb0b0b8, 0x686870, 0x101018],
  cave: [0xf0e8d8, 0xb89878, 0x684830, 0x180c08],
  caveDark: [0xb0a090, 0x705840, 0x382818, 0x080404],
  floor: [0xf8f8f0, 0xe0d0b0, 0x987858, 0x201810],
  floorCool: [0xf8f8f8, 0xc8d0e0, 0x707890, 0x101018],
  lava: [0xfff0c0, 0xf8a040, 0xc03020, 0x200808],
  snow: [0xffffff, 0xd8e8f8, 0x8098b8, 0x182030],
  ghost: [0xf0e8f8, 0xb8a0d0, 0x584878, 0x100818],
  flower: [0xfff8f8, 0xf8b0b0, 0xd04858, 0x201010],

  // People.
  skin: [0xf8f8f8, 0xf8c8a0, 0xc06040, 0x181010],
  skinBlue: [0xf8f8f8, 0xf8c8a0, 0x3858b8, 0x101018],
  skinGreen: [0xf8f8f8, 0xf8c8a0, 0x388840, 0x101810],
  skinPurple: [0xf8f8f8, 0xf8c8a0, 0x7040a0, 0x180c20],
} as const satisfies Record<string, Palette>

export type PalId = keyof typeof PAL

/**
 * Slots: every pixel on screen remembers which of these sixteen palettes it
 * was drawn with. Scenes fill the slots they use; the last is always the
 * interface palette, so text boxes look the same over any scene.
 */
export const SLOTS = 16
export const UI_SLOT = 15

/** A palette by name, or the mono one when the display mode has one. */
export function resolve(id: PalId, mode: DisplayMode): Palette {
  return mode === 'COLOR' ? PAL[id] : MONO[mode]
}

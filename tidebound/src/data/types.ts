/**
 * The seventeen elemental types. Names are the game's own; the matchup table
 * lives in src/battle/typechart.ts and is written out in docs/DESIGN.md.
 */
export const TYPES = [
  'normal',
  'flame',
  'tide',
  'leaf',
  'volt',
  'frost',
  'brawl',
  'toxic',
  'earth',
  'gale',
  'mind',
  'bug',
  'stone',
  'spirit',
  'wyrm',
  'metal',
  'shade',
] as const

export type TypeId = (typeof TYPES)[number]

/** Upper-case label as the UI prints it; six letters at most. */
export const TYPE_NAME: Record<TypeId, string> = {
  normal: 'NORMAL',
  flame: 'FLAME',
  tide: 'TIDE',
  leaf: 'LEAF',
  volt: 'VOLT',
  frost: 'FROST',
  brawl: 'BRAWL',
  toxic: 'TOXIC',
  earth: 'EARTH',
  gale: 'GALE',
  mind: 'MIND',
  bug: 'BUG',
  stone: 'STONE',
  spirit: 'SPIRIT',
  wyrm: 'WYRM',
  metal: 'METAL',
  shade: 'SHADE',
}

/** Badge colours for type labels and move-type tints: [fill, dark edge]. */
export const TYPE_COLOR: Record<TypeId, readonly [string, string]> = {
  normal: ['#a8a490', '#6c6858'],
  flame: ['#f07830', '#a83c10'],
  tide: ['#4890f0', '#205cb0'],
  leaf: ['#58b848', '#2c7424'],
  volt: ['#f8c828', '#a88010'],
  frost: ['#78d8e8', '#3890a8'],
  brawl: ['#c04830', '#782418'],
  toxic: ['#a050b8', '#602878'],
  earth: ['#d0a050', '#886428'],
  gale: ['#98a8f0', '#5868b8'],
  mind: ['#f05888', '#a82850'],
  bug: ['#a8b820', '#687410'],
  stone: ['#b8a058', '#786430'],
  spirit: ['#7060a8', '#403470'],
  wyrm: ['#6848e8', '#3820a0'],
  metal: ['#b0b8c8', '#687080'],
  shade: ['#685848', '#382c20'],
}

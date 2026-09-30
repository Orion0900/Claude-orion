import type { MoveId, Stats } from '../battle/types'
import { dex, SPECIES_IDS, type SpeciesId } from './dex'
import type { TypeId } from './types'

/**
 * Battle numbers for every species: base stats, growth curve, catch rate,
 * experience yield and level-up moves. Who a beast is (name, types,
 * evolution, looks) lives in src/data/dex.ts.
 *
 * Stat budgets (sum of base stats) follow docs/DESIGN.md: first stages
 * 290–320, middle stages 400–430, final starters 525–535, other finals
 * 440–500, BRANDGER about 450, TEMPESTWYRM 560, ATOLLUS 600.
 */

/** Experience curves: fast 0.8·n³, medium n³, slow 1.25·n³. */
export type Growth = 'fast' | 'medium' | 'slow'

export interface LearnsetEntry {
  level: number
  move: MoveId
}

export interface SpeciesData {
  id: SpeciesId
  /** From the dex, for convenience. */
  types: readonly TypeId[]
  base: Stats
  growth: Growth
  /** 3 (legendary) to 255 (very common). */
  catchRate: number
  /** Base experience yield when defeated. */
  xpYield: number
  /** Level-up moves in level order. Level 1 entries are known from the start. */
  learnset: readonly LearnsetEntry[]
}

type Row = {
  base: [hp: number, atk: number, def: number, spa: number, spd: number, spe: number]
  growth: Growth
  catchRate: number
  xpYield: number
  moves: [number, MoveId][]
}

const DATA: Record<SpeciesId, Row> = {
  // Starters: LEAFOLIN bulky and defensive, KINDLET attacking, NARLET special and sturdy.
  leafolin: {
    base: [50, 49, 60, 45, 55, 43], growth: 'medium', catchRate: 45, xpYield: 64,
    moves: [[1, 'bump'], [1, 'chirrup'], [5, 'seedFlick'], [9, 'sapSip'], [13, 'dozeDust'], [17, 'frondSlash'], [21, 'sunbathe'], [25, 'deepRoots'], [30, 'dirtRake'], [35, 'digIn'], [40, 'thornStorm'], [46, 'timberDrop']],
  },
  frondolin: {
    base: [68, 70, 80, 58, 72, 62], growth: 'medium', catchRate: 45, xpYield: 142,
    moves: [[1, 'bump'], [1, 'chirrup'], [5, 'seedFlick'], [9, 'sapSip'], [13, 'dozeDust'], [16, 'frondSlash'], [20, 'dirtRake'], [24, 'sunbathe'], [28, 'deepRoots'], [33, 'digIn'], [38, 'thornStorm'], [44, 'timberDrop'], [50, 'fullTilt']],
  },
  canopangol: {
    base: [95, 100, 115, 70, 95, 55], growth: 'medium', catchRate: 45, xpYield: 236,
    moves: [[1, 'bump'], [1, 'chirrup'], [1, 'seedFlick'], [1, 'sapSip'], [13, 'dozeDust'], [16, 'frondSlash'], [20, 'dirtRake'], [24, 'sunbathe'], [28, 'deepRoots'], [32, 'tremor'], [36, 'digIn'], [41, 'thornStorm'], [46, 'upheaval'], [52, 'timberDrop'], [58, 'cragCrush']],
  },
  kindlet: {
    base: [44, 62, 45, 55, 43, 61], growth: 'medium', catchRate: 45, xpYield: 64,
    moves: [[1, 'bump'], [1, 'scowl'], [5, 'cinderSpit'], [9, 'quickNip'], [13, 'smoulder'], [17, 'hotCharge'], [21, 'warmUp'], [26, 'kilnBlast'], [31, 'rockfall'], [36, 'moltenRam'], [42, 'magmaSurge']],
  },
  cinderam: {
    base: [60, 85, 60, 70, 58, 80], growth: 'medium', catchRate: 45, xpYield: 142,
    moves: [[1, 'bump'], [1, 'scowl'], [5, 'cinderSpit'], [9, 'quickNip'], [13, 'smoulder'], [16, 'hotCharge'], [20, 'warmUp'], [25, 'rockfall'], [29, 'kilnBlast'], [34, 'moltenRam'], [40, 'magmaSurge'], [46, 'fullTilt']],
  },
  volcaram: {
    base: [80, 118, 90, 85, 72, 85], growth: 'medium', catchRate: 45, xpYield: 240,
    moves: [[1, 'bump'], [1, 'scowl'], [1, 'cinderSpit'], [1, 'quickNip'], [13, 'smoulder'], [16, 'hotCharge'], [20, 'warmUp'], [25, 'rockfall'], [29, 'kilnBlast'], [32, 'bellyFlop'], [36, 'moltenRam'], [41, 'bedrock'], [45, 'magmaSurge'], [50, 'cragCrush'], [56, 'upheaval']],
  },
  narlet: {
    base: [55, 45, 55, 58, 55, 42], growth: 'medium', catchRate: 45, xpYield: 64,
    moves: [[1, 'bump'], [1, 'chirrup'], [5, 'spritz'], [9, 'slipstream'], [13, 'sleetSpray'], [17, 'riptide'], [21, 'tidepool'], [26, 'breaker'], [31, 'coldSnap'], [36, 'stillness'], [42, 'maelstrom']],
  },
  narwhelm: {
    base: [72, 60, 70, 80, 75, 58], growth: 'medium', catchRate: 45, xpYield: 142,
    moves: [[1, 'bump'], [1, 'chirrup'], [5, 'spritz'], [9, 'slipstream'], [13, 'sleetSpray'], [16, 'riptide'], [20, 'tidepool'], [25, 'breaker'], [30, 'coldSnap'], [35, 'stillness'], [41, 'maelstrom'], [47, 'bigBellow']],
  },
  tidelance: {
    base: [92, 80, 88, 110, 95, 65], growth: 'medium', catchRate: 45, xpYield: 239,
    moves: [[1, 'bump'], [1, 'chirrup'], [1, 'spritz'], [1, 'slipstream'], [13, 'sleetSpray'], [16, 'riptide'], [20, 'tidepool'], [25, 'breaker'], [30, 'coldSnap'], [32, 'rimeLance'], [36, 'stillness'], [39, 'brainwave'], [42, 'maelstrom'], [48, 'whiteout'], [54, 'shiver']],
  },

  // Routes 1–2 and the cave.
  tubbara: {
    base: [75, 50, 55, 35, 50, 30], growth: 'medium', catchRate: 255, xpYield: 55,
    moves: [[1, 'bump'], [4, 'chirrup'], [8, 'spritz'], [12, 'siesta'], [16, 'bellyFlop'], [21, 'lickWounds'], [26, 'bigBellow'], [32, 'fullTilt']],
  },
  capybaron: {
    base: [110, 70, 80, 60, 90, 40], growth: 'medium', catchRate: 90, xpYield: 165,
    moves: [[1, 'bump'], [4, 'chirrup'], [8, 'spritz'], [12, 'siesta'], [16, 'bellyFlop'], [18, 'riptide'], [23, 'lickWounds'], [28, 'bigBellow'], [34, 'breaker'], [37, 'deepRoots'], [40, 'digIn'], [46, 'fullTilt'], [52, 'maelstrom']],
  },
  pufflet: {
    base: [42, 50, 40, 38, 40, 85], growth: 'medium', catchRate: 255, xpYield: 52,
    moves: [[1, 'bump'], [1, 'chirrup'], [5, 'wingSlap'], [9, 'quickNip'], [11, 'spritz'], [13, 'updraft'], [18, 'squall'], [23, 'preen'], [28, 'diveBomb'], [34, 'skyPlunge']],
  },
  puffinaut: {
    base: [65, 90, 65, 70, 65, 115], growth: 'medium', catchRate: 90, xpYield: 168,
    moves: [[1, 'bump'], [1, 'chirrup'], [5, 'wingSlap'], [9, 'quickNip'], [11, 'spritz'], [13, 'updraft'], [17, 'slipstream'], [21, 'squall'], [25, 'preen'], [30, 'diveBomb'], [35, 'breaker'], [38, 'rockfall'], [41, 'howlingGale'], [47, 'skyPlunge']],
  },
  twigling: {
    base: [45, 55, 50, 25, 40, 75], growth: 'fast', catchRate: 255, xpYield: 50,
    moves: [[1, 'nibble'], [1, 'silkSnare'], [6, 'needleRain'], [10, 'seedFlick'], [15, 'mantisChop'], [20, 'frondSlash'], [26, 'locustLeap']],
  },
  timberwalk: {
    base: [70, 105, 80, 50, 70, 85], growth: 'fast', catchRate: 90, xpYield: 160,
    moves: [[1, 'nibble'], [1, 'silkSnare'], [6, 'needleRain'], [10, 'seedFlick'], [14, 'frondSlash'], [18, 'mantisChop'], [22, 'whet'], [27, 'nettleDust'], [32, 'locustLeap'], [35, 'sawtooth'], [38, 'timberDrop'], [44, 'sunbathe']],
  },
  lumigrub: {
    base: [45, 35, 45, 60, 55, 60], growth: 'fast', catchRate: 255, xpYield: 52,
    moves: [[1, 'nibble'], [1, 'silkSnare'], [5, 'staticPop'], [9, 'needleRain'], [13, 'scaleDust'], [18, 'tingle'], [23, 'swarmSurge'], [29, 'arcFlash']],
  },
  lanterwing: {
    base: [65, 50, 60, 105, 85, 100], growth: 'fast', catchRate: 90, xpYield: 166,
    moves: [[1, 'nibble'], [1, 'silkSnare'], [5, 'staticPop'], [9, 'needleRain'], [13, 'scaleDust'], [15, 'wingSlap'], [18, 'tingle'], [22, 'arcFlash'], [27, 'dreamsong'], [32, 'swarmSurge'], [37, 'updraft'], [43, 'skybolt'], [49, 'howlingGale']],
  },
  zappet: {
    base: [40, 45, 35, 65, 45, 85], growth: 'medium', catchRate: 190, xpYield: 60,
    moves: [[1, 'bump'], [1, 'chirrup'], [4, 'staticPop'], [8, 'quickNip'], [12, 'tingle'], [16, 'pawFlurry'], [21, 'springSnap'], [24, 'brainwave'], [26, 'arcFlash'], [31, 'overclock'], [37, 'skybolt']],
  },
  lemurge: {
    base: [65, 75, 55, 105, 70, 120], growth: 'medium', catchRate: 75, xpYield: 172,
    moves: [[1, 'bump'], [1, 'chirrup'], [4, 'staticPop'], [8, 'quickNip'], [12, 'tingle'], [16, 'pawFlurry'], [20, 'springSnap'], [24, 'overclock'], [28, 'arcFlash'], [33, 'brainwave'], [38, 'skybolt'], [44, 'bigBellow']],
  },
  pebblit: {
    base: [50, 65, 85, 30, 45, 25], growth: 'slow', catchRate: 190, xpYield: 58,
    moves: [[1, 'bump'], [1, 'scowl'], [5, 'pebblePelt'], [9, 'bedrock'], [13, 'mudFling'], [17, 'rockfall'], [21, 'wingSlap'], [26, 'quartzBeam'], [31, 'cragCrush']],
  },
  cragoyle: {
    base: [80, 110, 115, 50, 70, 70], growth: 'slow', catchRate: 60, xpYield: 175,
    moves: [[1, 'bump'], [1, 'scowl'], [5, 'pebblePelt'], [9, 'bedrock'], [13, 'mudFling'], [17, 'rockfall'], [21, 'wingSlap'], [25, 'diveBomb'], [29, 'whet'], [34, 'cragCrush'], [39, 'upheaval'], [45, 'skyPlunge']],
  },
  wombit: {
    base: [60, 65, 70, 30, 45, 40], growth: 'medium', catchRate: 190, xpYield: 58,
    moves: [[1, 'bump'], [1, 'chirrup'], [5, 'mudFling'], [9, 'dirtRake'], [13, 'digIn'], [17, 'tremor'], [20, 'pebblePelt'], [24, 'bellyFlop'], [28, 'upheaval']],
  },
  wombastion: {
    base: [95, 100, 130, 45, 75, 45], growth: 'medium', catchRate: 60, xpYield: 175,
    moves: [[1, 'bump'], [1, 'chirrup'], [5, 'mudFling'], [9, 'dirtRake'], [13, 'digIn'], [17, 'tremor'], [20, 'pebblePelt'], [22, 'rockfall'], [26, 'bedrock'], [29, 'gnash'], [33, 'bellyFlop'], [37, 'upheaval'], [42, 'cragCrush'], [48, 'fullTilt']],
  },

  // The coast and the open sea.
  spinefin: {
    base: [45, 50, 50, 55, 50, 60], growth: 'medium', catchRate: 190, xpYield: 60,
    moves: [[1, 'spritz'], [1, 'scowl'], [5, 'spinePrick'], [9, 'slipstream'], [13, 'venomFan'], [17, 'foulMiasma'], [21, 'riptide'], [23, 'blackwater'], [27, 'bilgeBlast']],
  },
  lionspire: {
    base: [75, 80, 75, 100, 80, 75], growth: 'medium', catchRate: 60, xpYield: 172,
    moves: [[1, 'spritz'], [1, 'scowl'], [5, 'spinePrick'], [9, 'slipstream'], [13, 'venomFan'], [17, 'foulMiasma'], [21, 'riptide'], [24, 'blackwater'], [29, 'stillness'], [34, 'bilgeBlast'], [40, 'maelstrom'], [46, 'coldSnap']],
  },
  jabshrimp: {
    base: [45, 75, 45, 30, 40, 70], growth: 'medium', catchRate: 190, xpYield: 60,
    moves: [[1, 'quickJab'], [1, 'scowl'], [5, 'oneTwo'], [9, 'slipstream'], [13, 'warmUp'], [17, 'knuckleBash'], [22, 'cavitation'], [28, 'haymaker']],
  },
  clobberclaw: {
    base: [80, 125, 85, 55, 65, 80], growth: 'medium', catchRate: 60, xpYield: 175,
    moves: [[1, 'quickJab'], [1, 'scowl'], [5, 'oneTwo'], [9, 'slipstream'], [13, 'warmUp'], [17, 'knuckleBash'], [22, 'cavitation'], [26, 'breaker'], [31, 'rockfall'], [36, 'haymaker'], [42, 'undertow'], [48, 'cragCrush']],
  },
  clionette: {
    base: [50, 30, 45, 65, 65, 55], growth: 'fast', catchRate: 190, xpYield: 60,
    moves: [[1, 'glint'], [1, 'spritz'], [5, 'chirrup'], [9, 'dreamsong'], [13, 'riptide'], [17, 'brainwave'], [19, 'sleetSpray'], [22, 'tidepool'], [27, 'stillness'], [33, 'haloBurst']],
  },
  serafin: {
    base: [80, 50, 70, 110, 110, 70], growth: 'fast', catchRate: 60, xpYield: 172,
    moves: [[1, 'glint'], [1, 'spritz'], [5, 'chirrup'], [9, 'dreamsong'], [13, 'riptide'], [17, 'brainwave'], [19, 'sleetSpray'], [22, 'tidepool'], [27, 'stillness'], [28, 'haloBurst'], [34, 'coldSnap'], [40, 'maelstrom'], [46, 'shiver']],
  },
  tatterling: {
    base: [40, 45, 40, 70, 55, 65], growth: 'medium', catchRate: 190, xpYield: 62,
    moves: [[1, 'spook'], [1, 'scowl'], [6, 'reckoning'], [9, 'wingSlap'], [11, 'fogbank'], [16, 'ghostlight'], [21, 'dreamsong'], [27, 'doldrums']],
  },
  sailwraith: {
    base: [60, 70, 60, 110, 85, 100], growth: 'medium', catchRate: 60, xpYield: 172,
    moves: [[1, 'spook'], [1, 'scowl'], [6, 'reckoning'], [9, 'wingSlap'], [11, 'fogbank'], [16, 'ghostlight'], [21, 'squall'], [27, 'scheme'], [32, 'doldrums'], [38, 'howlingGale'], [44, 'blackwater'], [50, 'updraft']],
  },
  murkeel: {
    base: [50, 70, 45, 45, 45, 60], growth: 'medium', catchRate: 190, xpYield: 62,
    moves: [[1, 'ambush'], [1, 'scowl'], [5, 'spritz'], [9, 'gnash'], [14, 'blackwater'], [19, 'whet'], [24, 'breaker'], [27, 'coilCrush'], [30, 'abyssJaws']],
  },
  moraynight: {
    base: [85, 115, 70, 70, 70, 85], growth: 'medium', catchRate: 60, xpYield: 175,
    moves: [[1, 'ambush'], [1, 'scowl'], [5, 'spritz'], [9, 'gnash'], [14, 'blackwater'], [19, 'whet'], [24, 'breaker'], [27, 'coilCrush'], [30, 'abyssJaws'], [36, 'undertow'], [42, 'rockfall'], [48, 'fullTilt']],
  },
  dugling: {
    base: [80, 40, 60, 45, 55, 30], growth: 'medium', catchRate: 190, xpYield: 62,
    moves: [[1, 'bump'], [1, 'chirrup'], [5, 'spritz'], [9, 'puppyEyes'], [13, 'riptide'], [16, 'seedFlick'], [18, 'tidepool'], [23, 'bellyFlop'], [29, 'breaker']],
  },
  manatide: {
    base: [130, 70, 90, 80, 95, 30], growth: 'medium', catchRate: 60, xpYield: 175,
    moves: [[1, 'bump'], [1, 'chirrup'], [5, 'spritz'], [9, 'puppyEyes'], [13, 'riptide'], [16, 'seedFlick'], [18, 'tidepool'], [23, 'bellyFlop'], [29, 'breaker'], [30, 'sunbathe'], [35, 'bigBellow'], [38, 'deepRoots'], [41, 'maelstrom'], [47, 'fullTilt']],
  },
  cocrab: {
    base: [45, 70, 80, 30, 40, 40], growth: 'medium', catchRate: 190, xpYield: 60,
    moves: [[1, 'bump'], [1, 'scowl'], [5, 'pebblePelt'], [9, 'seedFlick'], [13, 'bedrock'], [17, 'frondSlash'], [21, 'rockfall'], [23, 'knuckleBash'], [27, 'cragCrush']],
  },
  coconclaw: {
    base: [75, 115, 115, 50, 65, 60], growth: 'medium', catchRate: 75, xpYield: 170,
    moves: [[1, 'bump'], [1, 'scowl'], [5, 'pebblePelt'], [9, 'seedFlick'], [13, 'bedrock'], [17, 'frondSlash'], [21, 'rockfall'], [23, 'knuckleBash'], [25, 'whet'], [30, 'timberDrop'], [35, 'cragCrush'], [41, 'upheaval'], [47, 'haymaker']],
  },
  brandger: {
    base: [70, 105, 60, 70, 60, 90], growth: 'slow', catchRate: 75, xpYield: 165,
    moves: [[1, 'cinderSpit'], [1, 'scowl'], [5, 'quickJab'], [9, 'gnash'], [13, 'hotCharge'], [17, 'warmUp'], [21, 'knuckleBash'], [26, 'smoulder'], [31, 'moltenRam'], [37, 'haymaker'], [43, 'magmaSurge'], [50, 'fullTilt']],
  },
  sawfry: {
    base: [45, 70, 65, 35, 40, 55], growth: 'slow', catchRate: 190, xpYield: 62,
    moves: [[1, 'bump'], [1, 'scowl'], [5, 'spritz'], [9, 'rivetShot'], [13, 'sawtooth'], [16, 'mudFling'], [18, 'whet'], [23, 'breaker'], [28, 'chromeRay']],
  },
  sawbladon: {
    base: [75, 120, 110, 55, 65, 70], growth: 'slow', catchRate: 60, xpYield: 178,
    moves: [[1, 'bump'], [1, 'scowl'], [5, 'spritz'], [9, 'rivetShot'], [13, 'sawtooth'], [16, 'mudFling'], [18, 'whet'], [23, 'breaker'], [28, 'chromeRay'], [30, 'buzzsaw'], [36, 'undertow'], [42, 'upheaval'], [48, 'fullTilt']],
  },
  driftwyrm: {
    base: [50, 60, 50, 60, 50, 50], growth: 'slow', catchRate: 45, xpYield: 67,
    moves: [[1, 'scaleFlick'], [1, 'scowl'], [5, 'slipstream'], [10, 'staticPop'], [15, 'riptide'], [20, 'coilCrush'], [25, 'ascend'], [30, 'wyrmWrath'], [35, 'squall'], [40, 'arcFlash']],
  },
  tempestwyrm: {
    base: [90, 115, 80, 115, 80, 80], growth: 'slow', catchRate: 45, xpYield: 270,
    moves: [[1, 'scaleFlick'], [1, 'scowl'], [5, 'slipstream'], [10, 'staticPop'], [15, 'riptide'], [20, 'coilCrush'], [25, 'ascend'], [30, 'wyrmWrath'], [35, 'howlingGale'], [40, 'arcFlash'], [45, 'skyPlunge'], [50, 'skybolt'], [56, 'maelstrom']],
  },
  atollus: {
    base: [120, 100, 130, 100, 100, 50], growth: 'slow', catchRate: 3, xpYield: 300,
    moves: [[1, 'spritz'], [1, 'pebblePelt'], [10, 'bedrock'], [20, 'riptide'], [30, 'quartzBeam'], [38, 'tidepool'], [44, 'maelstrom'], [50, 'cragCrush'], [55, 'upheaval'], [60, 'whiteout']],
  },
}

function build(id: SpeciesId): SpeciesData {
  const r = DATA[id]
  const [hp, atk, def, spa, spd, spe] = r.base
  return {
    id,
    types: dex(id).types,
    base: { hp, atk, def, spa, spd, spe },
    growth: r.growth,
    catchRate: r.catchRate,
    xpYield: r.xpYield,
    learnset: r.moves
      .map(([level, move]) => ({ level, move }))
      .sort((a, b) => a.level - b.level),
  }
}

export const SPECIES: readonly SpeciesData[] = SPECIES_IDS.map(build)

const BY_ID = new Map<SpeciesId, SpeciesData>(SPECIES.map((s) => [s.id, s]))

/** Battle data for a species; throws on an unknown id (a data bug). */
export function species(id: SpeciesId): SpeciesData {
  const s = BY_ID.get(id)
  if (!s) throw new Error(`unknown species ${id}`)
  return s
}

/** Sum of base stats. */
export function baseStatTotal(id: SpeciesId): number {
  const b = species(id).base
  return b.hp + b.atk + b.def + b.spa + b.spd + b.spe
}

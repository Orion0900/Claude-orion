/**
 * The critters of the ARGENT region: 85 species, every one original to
 * Capsule Critters. Stats follow the classic five — HP, ATTACK, DEFENSE,
 * SPEED, SPECIAL — and each species has a learnset by level, how it evolves,
 * how easy it is to catch, how much experience it gives, and its ALMANAC
 * entry.
 */
import type { PalId } from '../engine/palettes'
import type { MoveId } from './moves'
import type { TypeId } from './types'

export type Growth = 'fast' | 'mediumFast' | 'mediumSlow' | 'slow'

export interface BaseStats {
  readonly hp: number
  readonly atk: number
  readonly def: number
  readonly spd: number
  readonly spc: number
}

export interface Evolution {
  readonly to: SpeciesId
  /** Evolves on reaching this level… */
  readonly level?: number
  /** …or when this coin is used on it. */
  readonly item?: 'moonCoin' | 'tideCoin' | 'sparkCoin' | 'sunCoin'
}

export interface SpeciesData {
  readonly id: SpeciesId
  /** ALMANAC number, from 1. */
  readonly num: number
  readonly name: string
  readonly types: readonly [TypeId] | readonly [TypeId, TypeId]
  readonly base: BaseStats
  /** 3 (legend) to 255 (easy). */
  readonly catchRate: number
  /** Experience yield. */
  readonly exp: number
  readonly growth: Growth
  /** [level, move]; level 1 moves are known from the start. */
  readonly learn: readonly (readonly [number, MoveId])[]
  readonly evolves?: readonly Evolution[]
  /** Extra skill discs beyond the ones its types allow. */
  readonly discs?: readonly MoveId[]
  /** The ALMANAC category, e.g. "EMBER CUB". */
  readonly kind: string
  /** Metres and kilograms. */
  readonly height: number
  readonly weight: number
  readonly dex: string
  /** Its colour in COLOR mode. */
  readonly pal: PalId
  /** The rare colouring's palette. */
  readonly shinyPal: PalId
  /** One of a kind: the legends. */
  readonly legend?: boolean
}

type Def = Omit<SpeciesData, 'id' | 'num' | 'name' | 'types' | 'base'>

const list: [string, string, SpeciesData['types'], [number, number, number, number, number], Def][] = []

function S(id: string, name: string, types: SpeciesData['types'], base: [number, number, number, number, number], d: Def): void {
  list.push([id, name, types, base, d])
}

// ─── Starters ─────────────────────────────────────────────────────────────
S('pandle', 'PANDLE', ['FIRE'], [41, 54, 40, 64, 56], {
  catchRate: 45, exp: 63, growth: 'mediumSlow', pal: 'red', shinyPal: 'gold',
  learn: [[1, 'swipe'], [1, 'snarl'], [7, 'cinder'], [12, 'quickDash'], [18, 'chomp'], [24, 'fireRing'], [30, 'blazeFist'], [37, 'flameJet'], [44, 'pumpUp']],
  evolves: [{ to: 'flarepaw', level: 16 }],
  discs: ['bodyThrow', 'burrow', 'chop'],
  kind: 'EMBER CUB', height: 0.5, weight: 5.9,
  dex: 'Its ringed tail smoulders like a banked fire. On cold nights it curls the tail around itself to keep warm.',
})
S('flarepaw', 'FLAREPAW', ['FIRE'], [58, 68, 56, 80, 72], {
  catchRate: 45, exp: 142, growth: 'mediumSlow', pal: 'red', shinyPal: 'gold',
  learn: [[1, 'swipe'], [1, 'snarl'], [1, 'cinder'], [12, 'quickDash'], [20, 'chomp'], [27, 'fireRing'], [34, 'blazeFist'], [41, 'flameJet'], [48, 'pumpUp']],
  evolves: [{ to: 'pyronda', level: 36 }],
  discs: ['bodyThrow', 'burrow', 'chop', 'suplex'],
  kind: 'FIRE PAW', height: 1.0, weight: 21.5,
  dex: 'Flames lick between the pads of its paws, leaving scorched prints wherever it walks.',
})
S('pyronda', 'PYRONDA', ['FIRE'], [78, 90, 74, 100, 96], {
  catchRate: 45, exp: 209, growth: 'mediumSlow', pal: 'red', shinyPal: 'gold',
  learn: [[1, 'swipe'], [1, 'snarl'], [1, 'cinder'], [1, 'quickDash'], [20, 'chomp'], [27, 'fireRing'], [34, 'blazeFist'], [44, 'flameJet'], [52, 'inferno'], [58, 'pumpUp']],
  discs: ['bodyThrow', 'burrow', 'chop', 'suplex', 'quake', 'heave'],
  kind: 'BLAZE PANDA', height: 1.8, weight: 88.0,
  dex: 'When it roars, the rings of its tail flare white-hot. It guards its mountain forest from any who would burn it.',
})
S('dipple', 'DIPPLE', ['WATER'], [46, 48, 58, 42, 52], {
  catchRate: 45, exp: 64, growth: 'mediumSlow', pal: 'blue', shinyPal: 'teal',
  learn: [[1, 'bump'], [1, 'stare'], [7, 'squirt'], [13, 'mudSplat'], [19, 'froth'], [26, 'undertow'], [33, 'tidalClaw'], [40, 'deluge']],
  evolves: [{ to: 'billow', level: 16 }],
  discs: ['burrow', 'quake'],
  kind: 'DUCKBILL', height: 0.4, weight: 4.4,
  dex: 'It sniffs out shrimp in the mud with its rubbery bill. Its webbed feet make it clumsy on land.',
})
S('billow', 'BILLOW', ['WATER'], [62, 64, 76, 58, 68], {
  catchRate: 45, exp: 143, growth: 'mediumSlow', pal: 'blue', shinyPal: 'teal',
  learn: [[1, 'bump'], [1, 'stare'], [1, 'squirt'], [13, 'mudSplat'], [21, 'froth'], [29, 'undertow'], [37, 'tidalClaw'], [45, 'deluge']],
  evolves: [{ to: 'platyphoon', level: 36 }],
  discs: ['burrow', 'quake', 'bodyThrow'],
  kind: 'DUCKBILL', height: 1.0, weight: 26.0,
  dex: 'It spins in the water to whip up whirlpools, then scoops up whatever gets caught.',
})
S('platyphoon', 'PLATYPHOON', ['WATER', 'VENOM'], [82, 88, 96, 76, 90], {
  catchRate: 45, exp: 210, growth: 'mediumSlow', pal: 'blue', shinyPal: 'teal',
  learn: [[1, 'bump'], [1, 'stare'], [1, 'squirt'], [1, 'mudSplat'], [21, 'froth'], [29, 'undertow'], [36, 'barb'], [41, 'tidalClaw'], [49, 'deluge'], [56, 'noxious']],
  discs: ['burrow', 'quake', 'bodyThrow', 'heave'],
  kind: 'STORMBILL', height: 1.7, weight: 90.5,
  dex: 'The spurs on its hind legs carry a venom that numbs. It can call up a squall by slapping its tail on the water.',
})
S('sproth', 'SPROTH', ['PLANT'], [50, 46, 52, 38, 56], {
  catchRate: 45, exp: 64, growth: 'mediumSlow', pal: 'green', shinyPal: 'teal',
  learn: [[1, 'bump'], [1, 'snarl'], [7, 'vineLash'], [13, 'sap'], [18, 'stunPollen'], [22, 'leechVine'], [28, 'sharpLeaf'], [34, 'dozeDust'], [40, 'siphon'], [46, 'sunbeam']],
  evolves: [{ to: 'mossloth', level: 16 }],
  discs: ['bodyThrow'],
  kind: 'SPROUT', height: 0.6, weight: 7.8,
  dex: 'It sleeps twenty hours a day. Moss grows on its back so fast that birds nest in it.',
})
S('mossloth', 'MOSSLOTH', ['PLANT'], [68, 62, 70, 48, 74], {
  catchRate: 45, exp: 141, growth: 'mediumSlow', pal: 'green', shinyPal: 'teal',
  learn: [[1, 'bump'], [1, 'snarl'], [1, 'vineLash'], [13, 'sap'], [20, 'stunPollen'], [25, 'leechVine'], [31, 'sharpLeaf'], [37, 'dozeDust'], [43, 'siphon'], [50, 'sunbeam']],
  evolves: [{ to: 'groveloth', level: 32 }],
  discs: ['bodyThrow', 'heave'],
  kind: 'MOSS SLOTH', height: 1.2, weight: 38.0,
  dex: 'Flowers bloom on its fur when it is happy. It hangs from branches by its vines and can go a week without moving.',
})
S('groveloth', 'GROVELOTH', ['PLANT', 'EARTH'], [90, 86, 94, 56, 98], {
  catchRate: 45, exp: 208, growth: 'mediumSlow', pal: 'green', shinyPal: 'teal',
  learn: [[1, 'bump'], [1, 'snarl'], [1, 'vineLash'], [1, 'sap'], [20, 'stunPollen'], [25, 'leechVine'], [31, 'sharpLeaf'], [32, 'tremor'], [38, 'dozeDust'], [44, 'siphon'], [50, 'bloomBurst'], [56, 'sunbeam'], [62, 'quake']],
  discs: ['bodyThrow', 'heave'],
  kind: 'GROVE', height: 2.1, weight: 160.0,
  dex: 'A whole grove grows on its back. When it finally stands up, the ground shakes and the trees sway.',
})

// ─── Early routes ─────────────────────────────────────────────────────────
S('rooklet', 'ROOKLET', ['NORMAL', 'SKY'], [38, 42, 36, 54, 34], {
  catchRate: 255, exp: 55, growth: 'mediumSlow', pal: 'gray', shinyPal: 'purple',
  learn: [[1, 'beakJab'], [5, 'stare'], [9, 'flap'], [15, 'quickDash'], [21, 'blur'], [27, 'wingCut'], [33, 'haste'], [39, 'spiralBeak']],
  evolves: [{ to: 'rookard', level: 18 }],
  kind: 'ROOK', height: 0.3, weight: 1.6,
  dex: 'Flocks of ROOKLET squabble in the fields at dawn. They are clever enough to drop nuts on roads to crack them.',
})
S('rookard', 'ROOKARD', ['NORMAL', 'SKY'], [60, 62, 56, 72, 52], {
  catchRate: 120, exp: 113, growth: 'mediumSlow', pal: 'gray', shinyPal: 'purple',
  learn: [[1, 'beakJab'], [1, 'stare'], [1, 'flap'], [15, 'quickDash'], [23, 'blur'], [30, 'wingCut'], [37, 'haste'], [44, 'spiralBeak']],
  evolves: [{ to: 'corvalier', level: 36 }],
  kind: 'ROOK', height: 0.9, weight: 18.0,
  dex: 'It guards its territory from a high perch and dives at intruders with a harsh caw.',
})
S('corvalier', 'CORVALIER', ['SKY', 'BRAWL'], [80, 92, 76, 94, 68], {
  catchRate: 45, exp: 186, growth: 'mediumSlow', pal: 'gray', shinyPal: 'purple',
  learn: [[1, 'beakJab'], [1, 'stare'], [1, 'flap'], [1, 'quickDash'], [23, 'blur'], [30, 'wingCut'], [36, 'sweep'], [44, 'spiralBeak'], [52, 'diveBomb']],
  discs: ['heave'],
  kind: 'WAR RAVEN', height: 1.6, weight: 52.0,
  dex: 'Its feathers are as hard as plate armour. It lets only a trainer who has bested it in a duel ride on its back.',
})
S('marmlet', 'MARMLET', ['NORMAL'], [32, 50, 34, 68, 28], {
  catchRate: 255, exp: 57, growth: 'mediumFast', pal: 'brown', shinyPal: 'gold',
  learn: [[1, 'bump'], [1, 'stare'], [7, 'quickDash'], [14, 'chomp'], [23, 'focus'], [30, 'gnaw'], [37, 'haste']],
  evolves: [{ to: 'marmount', level: 20 }],
  discs: ['burrow', 'arcBolt', 'frostRay'],
  kind: 'MARMOT', height: 0.3, weight: 3.5,
  dex: 'It whistles loudly to warn its family of danger, then dives into its burrow.',
})
S('marmount', 'MARMOUNT', ['NORMAL'], [62, 82, 60, 96, 52], {
  catchRate: 127, exp: 116, growth: 'mediumFast', pal: 'brown', shinyPal: 'gold',
  learn: [[1, 'bump'], [1, 'stare'], [1, 'quickDash'], [14, 'chomp'], [20, 'fang'], [27, 'focus'], [34, 'gnaw'], [41, 'haste'], [48, 'stampede']],
  discs: ['burrow', 'arcBolt', 'frostRay', 'lightning', 'quake'],
  kind: 'MARMOT', height: 0.8, weight: 19.0,
  dex: 'It stands on a rock to sun itself. Its teeth never stop growing, so it gnaws on stones.',
})
S('grublet', 'GRUBLET', ['BUG'], [42, 34, 36, 40, 22], {
  catchRate: 255, exp: 53, growth: 'mediumFast', pal: 'green', shinyPal: 'yellow',
  learn: [[1, 'bump'], [1, 'silkSnare']],
  evolves: [{ to: 'caskling', level: 7 }],
  kind: 'GRUB', height: 0.3, weight: 2.9,
  dex: 'It eats its own weight in leaves every day. Birds leave it alone because of its bitter taste.',
})
S('caskling', 'CASKLING', ['BUG'], [50, 22, 62, 28, 26], {
  catchRate: 120, exp: 72, growth: 'mediumFast', pal: 'brown', shinyPal: 'yellow',
  learn: [[1, 'brace']],
  evolves: [{ to: 'staggart', level: 10 }],
  kind: 'PUPA', height: 0.6, weight: 9.0,
  dex: 'Inside its hard casing its body is changing shape. It sways if poked, but never wakes.',
})
S('staggart', 'STAGGART', ['BUG', 'BRAWL'], [64, 88, 70, 68, 42], {
  catchRate: 45, exp: 160, growth: 'mediumFast', pal: 'brown', shinyPal: 'red',
  learn: [[1, 'bump'], [10, 'edgeHand'], [14, 'stare'], [18, 'twinKick'], [23, 'leechBite'], [28, 'shear'], [34, 'flex'], [40, 'bugRush'], [46, 'piledriver']],
  discs: ['heave', 'chop'],
  kind: 'STAG BEETLE', height: 1.1, weight: 32.0,
  dex: 'It locks antlers with rivals in shoving matches that can last all night. The loser must find a new tree.',
})
S('antlet', 'ANTLET', ['BUG'], [36, 46, 42, 52, 26], {
  catchRate: 255, exp: 58, growth: 'mediumFast', pal: 'red', shinyPal: 'gray',
  learn: [[1, 'bump'], [1, 'sting'], [9, 'stare'], [15, 'twinSting'], [19, 'chomp']],
  evolves: [{ to: 'formidant', level: 22 }],
  kind: 'WORKER ANT', height: 0.2, weight: 1.1,
  dex: 'ANTLET live in colonies of thousands. A single one can carry a pebble twenty times its own size.',
})
S('formidant', 'FORMIDANT', ['BUG', 'VENOM'], [64, 88, 82, 78, 52], {
  catchRate: 90, exp: 158, growth: 'mediumFast', pal: 'red', shinyPal: 'gray',
  learn: [[1, 'bump'], [1, 'sting'], [1, 'stare'], [15, 'twinSting'], [22, 'corrode'], [28, 'shear'], [34, 'barb'], [40, 'pumpUp'], [46, 'bugRush']],
  kind: 'SOLDIER ANT', height: 0.9, weight: 26.0,
  dex: 'It sprays burning acid from the tip of its body. A colony\'s soldiers march out to war in neat ranks.',
})
S('glimmet', 'GLIMMET', ['BUG', 'SPARK'], [34, 30, 32, 50, 50], {
  catchRate: 190, exp: 60, growth: 'mediumFast', pal: 'yellow', shinyPal: 'teal',
  learn: [[1, 'zap'], [1, 'silkSnare'], [10, 'glow'], [16, 'leechBite'], [22, 'static']],
  evolves: [{ to: 'lanterfly', level: 24 }],
  kind: 'GLOWWORM', height: 0.2, weight: 0.6,
  dex: 'Clusters of GLIMMET light up cave ceilings like stars. Bugs drawn to the glow get stuck in their silk.',
})
S('lanterfly', 'LANTERFLY', ['BUG', 'SPARK'], [62, 52, 56, 88, 92], {
  catchRate: 75, exp: 158, growth: 'mediumFast', pal: 'yellow', shinyPal: 'teal',
  learn: [[1, 'zap'], [1, 'silkSnare'], [1, 'glow'], [16, 'leechBite'], [22, 'static'], [24, 'dazzleBeam'], [30, 'arcBolt'], [36, 'haste'], [42, 'needleRain'], [48, 'lightning']],
  kind: 'LANTERNFLY', height: 0.9, weight: 8.0,
  dex: 'Its body glows brighter the more electricity it stores. Sailors once followed its light to safe harbours.',
})
S('spudling', 'SPUDLING', ['PLANT'], [52, 48, 58, 22, 44], {
  catchRate: 190, exp: 64, growth: 'mediumFast', pal: 'brown', shinyPal: 'pink',
  learn: [[1, 'bump'], [1, 'brace'], [7, 'sap'], [12, 'dustKick'], [18, 'vineLash'], [24, 'stunPollen']],
  evolves: [{ to: 'tuberus', level: 26 }],
  discs: ['burrow', 'quake'],
  kind: 'POTATO', height: 0.3, weight: 4.0,
  dex: 'It buries itself in soft soil to nap. Farmers who dig one up by mistake are always very surprised.',
})
S('tuberus', 'TUBERUS', ['PLANT', 'EARTH'], [86, 82, 94, 32, 68], {
  catchRate: 75, exp: 163, growth: 'mediumFast', pal: 'brown', shinyPal: 'pink',
  learn: [[1, 'bump'], [1, 'brace'], [1, 'sap'], [12, 'dustKick'], [18, 'vineLash'], [24, 'stunPollen'], [26, 'tremor'], [32, 'leechVine'], [38, 'siphon'], [44, 'heave'], [50, 'quake']],
  kind: 'TUBER', height: 1.2, weight: 95.0,
  dex: 'It sprouts eyes all over its body to watch for danger. In winter it sleeps underground for months.',
})
S('puffspore', 'PUFFSPORE', ['PLANT', 'VENOM'], [40, 44, 46, 28, 60], {
  catchRate: 190, exp: 64, growth: 'mediumFast', pal: 'purple', shinyPal: 'red',
  learn: [[1, 'sap'], [5, 'miasma'], [11, 'stunPollen'], [17, 'corrode'], [23, 'dozeDust']],
  evolves: [{ to: 'mycoloss', level: 28 }],
  kind: 'PUFFBALL', height: 0.4, weight: 3.2,
  dex: 'Squeezing it releases a cloud of spores. It hops along the forest floor on its single foot.',
})
S('mycoloss', 'MYCOLOSS', ['PLANT', 'VENOM'], [72, 70, 80, 42, 98], {
  catchRate: 75, exp: 170, growth: 'mediumFast', pal: 'purple', shinyPal: 'red',
  learn: [[1, 'sap'], [1, 'miasma'], [1, 'stunPollen'], [17, 'corrode'], [23, 'dozeDust'], [28, 'siphon'], [34, 'gunk'], [40, 'noxious'], [46, 'bloomBurst'], [52, 'blight']],
  kind: 'TOADSTOOL', height: 1.5, weight: 52.0,
  dex: 'Its huge cap can be seen from far off. A single puff from it can send a whole forest to sleep.',
})
S('jerbolt', 'JERBOLT', ['SPARK'], [34, 48, 30, 88, 50], {
  catchRate: 190, exp: 62, growth: 'mediumFast', pal: 'brown', shinyPal: 'teal',
  learn: [[1, 'zap'], [1, 'snarl'], [8, 'quickDash'], [14, 'static'], [20, 'twinKick'], [26, 'shockFist']],
  evolves: [{ to: 'amparoo', level: 28 }],
  discs: ['bodyThrow'],
  kind: 'JERBOA', height: 0.3, weight: 1.9,
  dex: 'Its long ears crackle with static. It can leap ten times its own length to escape a hungry hawk.',
})
S('amparoo', 'AMPAROO', ['SPARK'], [64, 88, 56, 112, 88], {
  catchRate: 75, exp: 164, growth: 'mediumFast', pal: 'brown', shinyPal: 'teal',
  learn: [[1, 'zap'], [1, 'snarl'], [1, 'quickDash'], [14, 'static'], [20, 'twinKick'], [28, 'shockFist'], [34, 'sweep'], [40, 'arcBolt'], [46, 'haste'], [52, 'lightning']],
  discs: ['bodyThrow', 'suplex', 'heave'],
  kind: 'BOUNDER', height: 1.4, weight: 36.0,
  dex: 'Its springy legs store electricity with every hop. A single kick lets loose enough to light a house.',
})
S('corkrab', 'CORKRAB', ['WATER'], [38, 62, 76, 42, 32], {
  catchRate: 190, exp: 66, growth: 'mediumFast', pal: 'orange', shinyPal: 'teal',
  learn: [[1, 'swipe'], [1, 'shellUp'], [8, 'squirt'], [15, 'stare'], [21, 'froth'], [27, 'pummel']],
  evolves: [{ to: 'galleocrab', level: 30 }],
  discs: ['chop'],
  kind: 'BOTTLE CRAB', height: 0.4, weight: 6.5,
  dex: 'It makes its home in a bottle washed up on the beach. It will fight to the end to keep a good bottle.',
})
S('galleocrab', 'GALLEOCRAB', ['WATER', 'STONE'], [64, 98, 116, 56, 52], {
  catchRate: 60, exp: 170, growth: 'mediumFast', pal: 'orange', shinyPal: 'teal',
  learn: [[1, 'swipe'], [1, 'shellUp'], [1, 'squirt'], [15, 'stare'], [21, 'froth'], [27, 'pummel'], [30, 'tidalClaw'], [36, 'rockfall'], [44, 'cragSpike'], [52, 'deluge']],
  discs: ['chop', 'heave'],
  kind: 'WRECK CRAB', height: 1.3, weight: 120.0,
  dex: 'Its shell is the hull of a sunken ship. Divers say it guards a treasure of old gold coins.',
})
S('jellamp', 'JELLAMP', ['WATER', 'SPARK'], [44, 30, 40, 62, 66], {
  catchRate: 190, exp: 66, growth: 'mediumFast', pal: 'teal', shinyPal: 'pink',
  learn: [[1, 'zap'], [1, 'squirt'], [9, 'sting'], [15, 'static'], [22, 'froth'], [27, 'undertow']],
  evolves: [{ to: 'lumedusa', level: 30 }],
  kind: 'LAMP JELLY', height: 0.5, weight: 3.0,
  dex: 'It drifts with the tide, glowing softly. Its light lures small fish close enough to be stung.',
})
S('lumedusa', 'LUMEDUSA', ['WATER', 'SPARK'], [78, 48, 64, 86, 104], {
  catchRate: 60, exp: 168, growth: 'mediumFast', pal: 'teal', shinyPal: 'pink',
  learn: [[1, 'zap'], [1, 'squirt'], [1, 'sting'], [15, 'static'], [22, 'froth'], [27, 'undertow'], [30, 'arcBolt'], [36, 'mindWall'], [42, 'paddle'], [48, 'lightning'], [54, 'deluge']],
  kind: 'LAMP JELLY', height: 1.5, weight: 22.0,
  dex: 'Fishermen follow its glow to find shoals at night. A brush against its trailing threads is a nasty shock.',
})
S('ternlet', 'TERNLET', ['WATER', 'SKY'], [40, 44, 36, 66, 46], {
  catchRate: 190, exp: 62, growth: 'mediumFast', pal: 'blue', shinyPal: 'pink',
  learn: [[1, 'beakJab'], [1, 'squirt'], [9, 'flap'], [15, 'quickDash'], [21, 'froth']],
  evolves: [{ to: 'ternado', level: 25 }],
  kind: 'TERN', height: 0.3, weight: 1.2,
  dex: 'It hovers over the waves, then plunges in to snatch fish. It shrieks at anyone who nears its nest.',
})
S('ternado', 'TERNADO', ['WATER', 'SKY'], [66, 72, 60, 102, 80], {
  catchRate: 75, exp: 166, growth: 'mediumFast', pal: 'blue', shinyPal: 'pink',
  learn: [[1, 'beakJab'], [1, 'squirt'], [1, 'flap'], [15, 'quickDash'], [21, 'froth'], [25, 'wingCut'], [31, 'haste'], [37, 'paddle'], [43, 'spiralBeak'], [49, 'diveBomb']],
  kind: 'STORM TERN', height: 1.0, weight: 9.5,
  dex: 'It rides the winds of storms far out at sea. Its spiralling dive whips the water into a spout.',
})
S('punchrimp', 'PUNCHRIMP', ['WATER', 'BRAWL'], [70, 110, 72, 88, 50], {
  catchRate: 45, exp: 175, growth: 'mediumSlow', pal: 'pink', shinyPal: 'green',
  learn: [[1, 'squirt'], [1, 'edgeHand'], [10, 'pummel'], [18, 'shellUp'], [25, 'tidalClaw'], [33, 'flex'], [41, 'piledriver']],
  discs: ['heave'],
  kind: 'MANTISHRIMP', height: 0.6, weight: 12.0,
  dex: 'Its punch is so fast it makes the water boil. It can crack the shell of a GALLEOCRAB in one blow.',
})
S('pikelet', 'PIKELET', ['WATER'], [30, 50, 30, 70, 24], {
  catchRate: 255, exp: 50, growth: 'mediumFast', pal: 'green', shinyPal: 'gold',
  learn: [[1, 'bump'], [6, 'squirt'], [12, 'chomp'], [18, 'quickDash']],
  evolves: [{ to: 'lancepike', level: 22 }],
  kind: 'PIKE FRY', height: 0.3, weight: 1.0,
  dex: 'Schools of PIKELET hide among reeds. They bite at anything that moves, fishing hooks included.',
})
S('lancepike', 'LANCEPIKE', ['WATER'], [66, 96, 60, 98, 52], {
  catchRate: 90, exp: 168, growth: 'mediumFast', pal: 'green', shinyPal: 'gold',
  learn: [[1, 'bump'], [1, 'squirt'], [1, 'chomp'], [18, 'quickDash'], [22, 'fang'], [28, 'froth'], [34, 'tidalClaw'], [40, 'haste'], [46, 'deluge']],
  kind: 'PIKE', height: 1.5, weight: 30.0,
  dex: 'It lurks as still as a log, then strikes like a thrown spear. Lake fish scatter at its shadow.',
})

// ─── Hearth and hills ─────────────────────────────────────────────────────
S('kettlin', 'KETTLIN', ['FIRE'], [44, 38, 62, 36, 58], {
  catchRate: 190, exp: 65, growth: 'mediumFast', pal: 'orange', shinyPal: 'gray',
  learn: [[1, 'bump'], [1, 'cinder'], [8, 'brace'], [14, 'singe'], [20, 'fireRing'], [26, 'mend']],
  evolves: [{ to: 'samovar', item: 'tideCoin' }],
  kind: 'KETTLE', height: 0.4, weight: 3.6,
  dex: 'It whistles when it gets angry. Tea poured from its spout is said to taste of smoke and honey.',
})
S('samovar', 'SAMOVAR', ['FIRE', 'WATER'], [80, 62, 96, 54, 100], {
  catchRate: 60, exp: 172, growth: 'mediumFast', pal: 'orange', shinyPal: 'gray',
  learn: [[1, 'bump'], [1, 'cinder'], [1, 'brace'], [1, 'froth'], [36, 'flameJet'], [42, 'mend'], [48, 'deluge'], [54, 'inferno']],
  kind: 'TEA URN', height: 1.1, weight: 64.0,
  dex: 'Steam roars from its lid when it fights. Old families keep one by the hearth to boil water for guests.',
})
S('coalpup', 'COALPUP', ['FIRE'], [42, 58, 40, 60, 44], {
  catchRate: 190, exp: 62, growth: 'mediumFast', pal: 'orange', shinyPal: 'gray',
  learn: [[1, 'bump'], [1, 'snarl'], [7, 'cinder'], [13, 'quickDash'], [19, 'chomp'], [25, 'singe']],
  evolves: [{ to: 'coalyote', level: 30 }],
  discs: ['burrow'],
  kind: 'COAL PUP', height: 0.5, weight: 9.0,
  dex: 'It sleeps in the warm ashes of campfires. Its fur is sooty black, but its eyes glow like embers.',
})
S('coalyote', 'COALYOTE', ['FIRE'], [72, 102, 68, 94, 78], {
  catchRate: 75, exp: 175, growth: 'mediumFast', pal: 'orange', shinyPal: 'gray',
  learn: [[1, 'bump'], [1, 'snarl'], [1, 'cinder'], [13, 'quickDash'], [19, 'chomp'], [25, 'singe'], [30, 'fang'], [36, 'flameJet'], [42, 'haste'], [48, 'stampede'], [54, 'inferno']],
  discs: ['burrow'],
  kind: 'EMBER DOG', height: 1.2, weight: 42.0,
  dex: 'Its howl carries for miles across the dry hills. Where it runs, the grass behind it smoulders.',
})
S('brickle', 'BRICKLE', ['STONE'], [46, 62, 82, 22, 26], {
  catchRate: 190, exp: 66, growth: 'mediumFast', pal: 'brown', shinyPal: 'gray',
  learn: [[1, 'bump'], [1, 'brace'], [9, 'pelt'], [16, 'dustKick'], [22, 'ram']],
  evolves: [{ to: 'bulwark', level: 25 }],
  discs: ['burrow', 'quake', 'heave', 'kaboom'],
  kind: 'BRICK', height: 0.4, weight: 18.0,
  dex: 'It looks just like a loose brick from an old wall. Builders who pick one up get a nasty nip.',
})
S('bulwark', 'BULWARK', ['STONE', 'BRAWL'], [76, 96, 124, 32, 46], {
  catchRate: 60, exp: 168, growth: 'mediumFast', pal: 'brown', shinyPal: 'gray',
  learn: [[1, 'bump'], [1, 'brace'], [1, 'pelt'], [16, 'dustKick'], [22, 'ram'], [25, 'edgeHand'], [31, 'rockfall'], [37, 'flex'], [43, 'heave'], [49, 'cragSpike'], [55, 'piledriver']],
  discs: ['burrow', 'quake', 'kaboom'],
  kind: 'RAMPART', height: 1.6, weight: 310.0,
  dex: 'It plants itself in narrow passes and refuses to budge. Armies of old built their castles around it.',
})
S('settling', 'SETTLING', ['EARTH'], [50, 58, 48, 42, 30], {
  catchRate: 190, exp: 62, growth: 'mediumFast', pal: 'gray', shinyPal: 'brown',
  learn: [[1, 'swipe'], [1, 'snarl'], [8, 'dustKick'], [14, 'mudSplat'], [20, 'chomp'], [26, 'burrow']],
  evolves: [{ to: 'badgrapple', level: 30 }],
  discs: ['bodyThrow', 'chop', 'heave'],
  kind: 'BADGER', height: 0.5, weight: 11.0,
  dex: 'A SETTLING family digs a maze of tunnels called a sett. They line their beds with dry leaves.',
})
S('badgrapple', 'BADGRAPPLE', ['EARTH', 'BRAWL'], [84, 104, 80, 68, 48], {
  catchRate: 75, exp: 172, growth: 'mediumFast', pal: 'gray', shinyPal: 'brown',
  learn: [[1, 'swipe'], [1, 'snarl'], [1, 'dustKick'], [14, 'mudSplat'], [20, 'chomp'], [26, 'burrow'], [30, 'suplex'], [36, 'bodyThrow'], [42, 'flex'], [48, 'quake'], [54, 'piledriver']],
  discs: ['chop', 'heave'],
  kind: 'BADGER', height: 1.1, weight: 58.0,
  dex: 'It wrestles bears for their dens and usually wins. Once it gets a grip, it never lets go.',
})
S('womball', 'WOMBALL', ['NORMAL'], [60, 52, 62, 28, 30], {
  catchRate: 190, exp: 65, growth: 'mediumFast', pal: 'brown', shinyPal: 'gray',
  learn: [[1, 'bump'], [1, 'brace'], [9, 'dustKick'], [15, 'ram'], [22, 'nap'], [28, 'burrow']],
  evolves: [{ to: 'wombatank', level: 32 }],
  discs: ['burrow', 'quake', 'rockfall', 'heave', 'bodyThrow'],
  kind: 'WOMBAT', height: 0.6, weight: 26.0,
  dex: 'It curls into a ball and rolls downhill rather than walk. Its rump is as hard as a shield.',
})
S('wombatank', 'WOMBATANK', ['NORMAL', 'STONE'], [110, 92, 108, 30, 50], {
  catchRate: 45, exp: 180, growth: 'mediumFast', pal: 'brown', shinyPal: 'gray',
  learn: [[1, 'bump'], [1, 'brace'], [1, 'dustKick'], [15, 'ram'], [22, 'nap'], [28, 'burrow'], [32, 'flatten'], [38, 'rockfall'], [44, 'heave'], [50, 'stampede']],
  discs: ['burrow', 'quake', 'bodyThrow'],
  kind: 'WOMBAT', height: 1.4, weight: 380.0,
  dex: 'Its back is plated like a castle gate. It charges through walls rather than walk around them.',
})
S('gilagrin', 'GILAGRIN', ['VENOM', 'EARTH'], [72, 82, 74, 58, 62], {
  catchRate: 90, exp: 160, growth: 'mediumFast', pal: 'orange', shinyPal: 'pink',
  learn: [[1, 'chomp'], [1, 'sting'], [10, 'stare'], [18, 'mudSplat'], [26, 'barb'], [34, 'burrow'], [42, 'noxious'], [50, 'blight']],
  discs: ['chop'],
  kind: 'GILA', height: 0.9, weight: 21.0,
  dex: 'It lazes on hot rocks with a smug grin. Its bite is slow, but the venom more than makes up for it.',
})
S('scarabble', 'SCARABBLE', ['BUG'], [44, 56, 60, 34, 30], {
  catchRate: 190, exp: 64, growth: 'mediumFast', pal: 'gold', shinyPal: 'teal',
  learn: [[1, 'bump'], [1, 'brace'], [8, 'dustKick'], [15, 'pelt'], [21, 'twinKick']],
  evolves: [{ to: 'bouldarab', level: 26 }],
  discs: ['heave', 'quake', 'rockfall'],
  kind: 'SCARAB', height: 0.3, weight: 4.5,
  dex: 'It rolls a ball of mud bigger than itself all day long, and nobody knows why.',
})
S('bouldarab', 'BOULDARAB', ['BUG', 'STONE'], [74, 94, 104, 44, 52], {
  catchRate: 75, exp: 168, growth: 'mediumFast', pal: 'gold', shinyPal: 'teal',
  learn: [[1, 'bump'], [1, 'brace'], [1, 'dustKick'], [15, 'pelt'], [21, 'twinKick'], [26, 'rockfall'], [32, 'shear'], [38, 'heave'], [44, 'bugRush'], [50, 'cragSpike']],
  discs: ['quake'],
  kind: 'SCARAB', height: 1.2, weight: 105.0,
  dex: 'It shoves a boulder ahead of it like a battering ram. Old murals show it rolling the sun across the sky.',
})
S('placojaw', 'PLACOJAW', ['STONE', 'WATER'], [40, 80, 90, 40, 42], {
  catchRate: 45, exp: 99, growth: 'mediumFast', pal: 'gray', shinyPal: 'blue',
  learn: [[1, 'chomp'], [1, 'shellUp'], [1, 'squirt'], [30, 'froth'], [36, 'rockfall']],
  evolves: [{ to: 'dunkmaw', level: 40 }],
  kind: 'PLATED FISH', height: 0.7, weight: 30.0,
  dex: 'An armoured fish from an ancient sea, brought back from a fossil. Its jaw is a single sharp plate of bone.',
})
S('dunkmaw', 'DUNKMAW', ['STONE', 'WATER'], [72, 118, 120, 56, 62], {
  catchRate: 45, exp: 199, growth: 'mediumFast', pal: 'gray', shinyPal: 'blue',
  learn: [[1, 'chomp'], [1, 'shellUp'], [1, 'squirt'], [30, 'froth'], [36, 'rockfall'], [40, 'fang'], [46, 'cragSpike'], [52, 'deluge'], [58, 'tidalClaw']],
  kind: 'PLATED FISH', height: 2.4, weight: 230.0,
  dex: 'Its bite could crush a ship\'s hull. It ruled the oceans long before the first critters crawled ashore.',
})

// ─── Mystery and gloom ────────────────────────────────────────────────────
S('musebox', 'MUSEBOX', ['SPOOK'], [40, 30, 58, 42, 72], {
  catchRate: 190, exp: 62, growth: 'mediumFast', pal: 'purple', shinyPal: 'gold',
  learn: [[1, 'lullaby'], [1, 'coldLick'], [12, 'wispLight'], [18, 'haunt'], [24, 'dizzyTone'], [30, 'jinx']],
  evolves: [{ to: 'phantorgan', level: 32 }],
  discs: ['mindBlast', 'nap', 'guardWall', 'mindWall'],
  kind: 'MUSIC BOX', height: 0.3, weight: 2.2,
  dex: 'It plays a tinkling tune all by itself at midnight. Anyone who listens to the end falls fast asleep.',
})
S('phantorgan', 'PHANTORGAN', ['SPOOK', 'MIND'], [68, 52, 86, 62, 112], {
  catchRate: 60, exp: 175, growth: 'mediumFast', pal: 'purple', shinyPal: 'gold',
  learn: [[1, 'lullaby'], [1, 'coldLick'], [1, 'wispLight'], [18, 'haunt'], [24, 'dizzyTone'], [30, 'jinx'], [32, 'mindPulse'], [38, 'shadeBolt'], [44, 'swirlGaze'], [50, 'mindBlast'], [56, 'dreamSip']],
  kind: 'PIPE ORGAN', height: 2.0, weight: 180.0,
  dex: 'It haunts an old chapel. When all its pipes sound at once, the windows rattle and the candles go out.',
})
S('glimwisp', 'GLIMWISP', ['SPOOK', 'FIRE'], [32, 30, 34, 76, 88], {
  catchRate: 190, exp: 62, growth: 'mediumSlow', pal: 'night', shinyPal: 'teal',
  learn: [[1, 'coldLick'], [1, 'wispLight'], [12, 'cinder'], [18, 'haunt']],
  evolves: [{ to: 'gloomwisp', level: 25 }],
  discs: ['mindBlast', 'swirlGaze'],
  kind: 'WISP', height: 0.4, weight: 0.1,
  dex: 'A flickering light that leads travellers off the path. It feeds on the warmth of lanterns.',
})
S('gloomwisp', 'GLOOMWISP', ['SPOOK', 'FIRE'], [46, 46, 44, 92, 104], {
  catchRate: 90, exp: 126, growth: 'mediumSlow', pal: 'night', shinyPal: 'teal',
  learn: [[1, 'coldLick'], [1, 'wispLight'], [1, 'cinder'], [18, 'haunt'], [25, 'swirlGaze'], [31, 'fireRing'], [37, 'jinx']],
  evolves: [{ to: 'grimwisp', level: 40 }],
  discs: ['mindBlast'],
  kind: 'WISP', height: 1.0, weight: 0.2,
  dex: 'On foggy nights it splits into many lights to confuse its prey. Its flame burns cold and blue.',
})
S('grimwisp', 'GRIMWISP', ['SPOOK', 'FIRE'], [62, 62, 58, 108, 122], {
  catchRate: 45, exp: 190, growth: 'mediumSlow', pal: 'night', shinyPal: 'teal',
  learn: [[1, 'coldLick'], [1, 'wispLight'], [1, 'cinder'], [1, 'haunt'], [25, 'swirlGaze'], [31, 'fireRing'], [37, 'jinx'], [40, 'shadeBolt'], [46, 'flameJet'], [52, 'dreamSip'], [58, 'inferno']],
  discs: ['mindBlast', 'kaboom'],
  kind: 'WISP', height: 1.6, weight: 0.4,
  dex: 'It lights the way to the land of shadows. Those who follow its grinning flame are never seen again.',
})
S('dartlet', 'DARTLET', ['VENOM'], [38, 40, 36, 66, 52], {
  catchRate: 190, exp: 60, growth: 'mediumFast', pal: 'yellow', shinyPal: 'blue',
  learn: [[1, 'bump'], [1, 'sting'], [9, 'stare'], [15, 'squirt'], [21, 'corrode']],
  evolves: [{ to: 'dartoad', level: 24 }],
  discs: ['froth', 'paddle'],
  kind: 'DART FROG', height: 0.2, weight: 0.4,
  dex: 'Its bright colours warn others away. Even a lick of its skin can numb a tongue for a day.',
})
S('dartoad', 'DARTOAD', ['VENOM'], [68, 72, 64, 96, 88], {
  catchRate: 75, exp: 164, growth: 'mediumFast', pal: 'yellow', shinyPal: 'blue',
  learn: [[1, 'bump'], [1, 'sting'], [1, 'stare'], [15, 'squirt'], [21, 'corrode'], [24, 'barb'], [30, 'gunk'], [36, 'haste'], [42, 'noxious'], [48, 'blight']],
  discs: ['froth', 'paddle', 'deluge'],
  kind: 'POISON TOAD', height: 0.9, weight: 15.0,
  dex: 'It sits in plain sight on jungle leaves. Hunters once tipped their darts by brushing them on its back.',
})
S('tarsight', 'TARSIGHT', ['MIND'], [36, 30, 34, 66, 70], {
  catchRate: 190, exp: 62, growth: 'mediumFast', pal: 'brown', shinyPal: 'gray',
  learn: [[1, 'mindPulse'], [1, 'stare'], [12, 'swirlGaze'], [16, 'blink'], [22, 'dazzleBeam']],
  evolves: [{ to: 'tarseer', level: 28 }],
  kind: 'TARSIER', height: 0.2, weight: 0.3,
  dex: 'Each of its eyes is bigger than its brain. It sees in the dark and can read the thoughts of moths.',
})
S('tarseer', 'TARSEER', ['MIND'], [66, 50, 60, 100, 118], {
  catchRate: 75, exp: 172, growth: 'mediumFast', pal: 'brown', shinyPal: 'gray',
  learn: [[1, 'mindPulse'], [1, 'stare'], [1, 'swirlGaze'], [16, 'blink'], [22, 'dazzleBeam'], [28, 'mindWall'], [34, 'guardWall'], [40, 'mindBlast'], [46, 'daydream'], [52, 'dreamSip']],
  kind: 'SEER', height: 0.8, weight: 6.0,
  dex: 'It sits motionless for hours, gazing into the future. Its forecasts about the weather are never wrong.',
})
S('nimblamb', 'NIMBLAMB', ['MIND'], [52, 34, 48, 42, 60], {
  catchRate: 190, exp: 64, growth: 'fast', pal: 'pink', shinyPal: 'night',
  learn: [[1, 'bump'], [1, 'lullaby'], [10, 'mindPulse'], [17, 'brace'], [24, 'nap']],
  evolves: [{ to: 'cumulamb', item: 'moonCoin' }],
  kind: 'CLOUD LAMB', height: 0.5, weight: 2.0,
  dex: 'Its wool is as soft as a cloud and nearly as light. Counting the NIMBLAMB in a field makes anyone sleepy.',
})
S('cumulamb', 'CUMULAMB', ['MIND', 'SKY'], [90, 54, 76, 64, 96], {
  catchRate: 75, exp: 168, growth: 'fast', pal: 'pink', shinyPal: 'night',
  learn: [[1, 'bump'], [1, 'lullaby'], [1, 'mindPulse'], [1, 'flap'], [36, 'dazzleBeam'], [42, 'dreamSip'], [48, 'mindBlast'], [54, 'guardWall']],
  kind: 'CLOUD SHEEP', height: 1.3, weight: 4.0,
  dex: 'It floats over the hills on its own fleece. When it is sad its wool turns grey, and then it rains.',
})
S('ermlet', 'ERMLET', ['FROST'], [40, 52, 36, 72, 46], {
  catchRate: 190, exp: 62, growth: 'mediumFast', pal: 'ice', shinyPal: 'brown',
  learn: [[1, 'swipe'], [1, 'stare'], [9, 'flurry'], [15, 'quickDash'], [21, 'chomp'], [27, 'frostFist']],
  evolves: [{ to: 'erminarch', level: 30 }],
  discs: ['burrow'],
  kind: 'STOAT', height: 0.3, weight: 1.4,
  dex: 'Its coat turns from brown to white when the first snow falls. It hunts by diving headfirst into drifts.',
})
S('erminarch', 'ERMINARCH', ['FROST', 'NORMAL'], [70, 86, 62, 104, 84], {
  catchRate: 60, exp: 172, growth: 'mediumFast', pal: 'ice', shinyPal: 'brown',
  learn: [[1, 'swipe'], [1, 'stare'], [1, 'flurry'], [15, 'quickDash'], [21, 'chomp'], [27, 'frostFist'], [30, 'aurora'], [36, 'haste'], [42, 'frostRay'], [48, 'fang'], [54, 'whiteout']],
  discs: ['burrow'],
  kind: 'ERMINE', height: 0.9, weight: 8.0,
  dex: 'It carries itself like royalty. Kings once wore its shed winter coat as a sign of their rule.',
})
S('glaciox', 'GLACIOX', ['FROST', 'STONE'], [90, 96, 104, 42, 70], {
  catchRate: 45, exp: 178, growth: 'slow', pal: 'ice', shinyPal: 'brown',
  learn: [[1, 'bump'], [1, 'flurry'], [1, 'brace'], [20, 'ram'], [28, 'aurora'], [34, 'rockfall'], [40, 'frostRay'], [46, 'stampede'], [52, 'whiteout']],
  discs: ['quake', 'heave'],
  kind: 'MUSK OX', height: 1.6, weight: 340.0,
  dex: 'Herds of GLACIOX form a ring against blizzards with their young inside. Their horns are made of ancient ice.',
})
S('kidgruff', 'KIDGRUFF', ['BRAWL'], [44, 66, 48, 52, 30], {
  catchRate: 190, exp: 62, growth: 'mediumFast', pal: 'gray', shinyPal: 'brown',
  learn: [[1, 'bump'], [1, 'stare'], [8, 'twinKick'], [15, 'sweep'], [22, 'ram'], [26, 'flex']],
  evolves: [{ to: 'billygruff', level: 28 }],
  discs: ['rockfall', 'quake'],
  kind: 'GOAT KID', height: 0.5, weight: 14.0,
  dex: 'It butts heads with anything it meets, trees and trainers included. It only ever wants to play.',
})
S('billygruff', 'BILLYGRUFF', ['BRAWL'], [74, 108, 80, 80, 48], {
  catchRate: 75, exp: 170, growth: 'mediumFast', pal: 'gray', shinyPal: 'brown',
  learn: [[1, 'bump'], [1, 'stare'], [1, 'twinKick'], [15, 'sweep'], [22, 'ram'], [26, 'flex'], [28, 'leapKick'], [36, 'suplex'], [44, 'heave'], [52, 'piledriver']],
  discs: ['rockfall', 'quake'],
  kind: 'GOAT', height: 1.3, weight: 82.0,
  dex: 'It guards mountain bridges and charges anyone who tries to cross. Its horns can split boulders.',
})
S('hoardling', 'HOARDLING', ['DRAKE'], [42, 64, 46, 50, 50], {
  catchRate: 45, exp: 67, growth: 'slow', pal: 'gold', shinyPal: 'pink',
  learn: [[1, 'swipe'], [1, 'snarl'], [10, 'wyrmRage'], [18, 'coinToss'], [25, 'drakeBreath']],
  evolves: [{ to: 'gildrake', level: 30 }],
  discs: ['flameJet', 'arcBolt', 'frostRay', 'chop'],
  kind: 'WHELP', height: 0.6, weight: 9.0,
  dex: 'It sleeps on a pile of shiny coins and growls at anyone who comes near. The pile grows every night.',
})
S('gildrake', 'GILDRAKE', ['DRAKE'], [62, 84, 66, 70, 70], {
  catchRate: 45, exp: 144, growth: 'slow', pal: 'gold', shinyPal: 'pink',
  learn: [[1, 'swipe'], [1, 'snarl'], [1, 'wyrmRage'], [18, 'coinToss'], [25, 'drakeBreath'], [30, 'drakeClaw'], [37, 'focus'], [44, 'drakeDance'], [51, 'drakeFury']],
  evolves: [{ to: 'aurigon', level: 55 }],
  discs: ['flameJet', 'arcBolt', 'frostRay', 'chop', 'paddle'],
  kind: 'GILT DRAKE', height: 2.0, weight: 60.0,
  dex: 'Its scales were said to be pure gold, which is why it was hunted almost to extinction.',
})
S('aurigon', 'AURIGON', ['DRAKE', 'SKY'], [94, 128, 96, 84, 104], {
  catchRate: 45, exp: 218, growth: 'slow', pal: 'gold', shinyPal: 'pink',
  learn: [[1, 'swipe'], [1, 'snarl'], [1, 'wyrmRage'], [1, 'coinToss'], [25, 'drakeBreath'], [30, 'drakeClaw'], [37, 'focus'], [44, 'drakeDance'], [51, 'drakeFury'], [55, 'soar'], [62, 'overdrive']],
  discs: ['flameJet', 'arcBolt', 'frostRay', 'chop', 'paddle', 'heave', 'quake', 'inferno', 'lightning', 'whiteout'],
  kind: 'GOLD DRAKE', height: 2.6, weight: 210.0,
  dex: 'It circles the highest peaks, its scales flashing like a second sun. It is gentle with those who mean no harm.',
})

// ─── Town and country ─────────────────────────────────────────────────────
S('alpacka', 'ALPACKA', ['NORMAL'], [80, 70, 70, 60, 70], {
  catchRate: 45, exp: 160, growth: 'mediumFast', pal: 'yellow', shinyPal: 'pink',
  learn: [[1, 'bump'], [1, 'stare'], [12, 'ram'], [20, 'brace'], [28, 'flatten'], [36, 'nap'], [44, 'stampede']],
  discs: ['heave', 'quake', 'froth'],
  kind: 'PACK ALPACA', height: 1.5, weight: 70.0,
  dex: 'It carries travellers\' bags over high mountain passes. Overload it and it sits down and spits.',
})
S('magpenny', 'MAGPENNY', ['NORMAL', 'SKY'], [40, 50, 40, 70, 40], {
  catchRate: 190, exp: 60, growth: 'mediumFast', pal: 'gray', shinyPal: 'gold',
  learn: [[1, 'beakJab'], [1, 'stare'], [10, 'coinToss'], [17, 'quickDash'], [23, 'blur']],
  evolves: [{ to: 'magpilfer', level: 27 }],
  kind: 'MAGPIE', height: 0.4, weight: 1.0,
  dex: 'It steals anything shiny, coins most of all. A MAGPENNY nest may hold a small fortune.',
})
S('magpilfer', 'MAGPILFER', ['NORMAL', 'SKY'], [65, 80, 62, 100, 68], {
  catchRate: 75, exp: 158, growth: 'mediumFast', pal: 'gray', shinyPal: 'gold',
  learn: [[1, 'beakJab'], [1, 'stare'], [1, 'coinToss'], [17, 'quickDash'], [23, 'blur'], [27, 'wingCut'], [33, 'gnaw'], [39, 'haste'], [45, 'spiralBeak']],
  kind: 'THIEF BIRD', height: 0.9, weight: 7.0,
  dex: 'It snatches coins right out of people\'s hands, then cackles at them from a rooftop.',
})
S('flitter', 'FLITTER', ['SKY', 'MIND'], [40, 44, 34, 60, 40], {
  catchRate: 255, exp: 54, growth: 'mediumFast', pal: 'purple', shinyPal: 'green',
  learn: [[1, 'flap'], [6, 'dizzyTone'], [12, 'mindPulse'], [18, 'leechBite']],
  evolves: [{ to: 'vesperwing', level: 22 }],
  kind: 'BAT', height: 0.4, weight: 3.5,
  dex: 'It flits through caves in total darkness, finding its way by the echoes of its thoughts.',
})
S('vesperwing', 'VESPERWING', ['SKY', 'MIND'], [75, 74, 66, 94, 78], {
  catchRate: 90, exp: 160, growth: 'mediumFast', pal: 'purple', shinyPal: 'green',
  learn: [[1, 'flap'], [1, 'dizzyTone'], [1, 'mindPulse'], [18, 'leechBite'], [22, 'wingCut'], [28, 'dazzleBeam'], [34, 'haste'], [40, 'dreamSip'], [46, 'mindBlast']],
  kind: 'DUSK BAT', height: 1.5, weight: 40.0,
  dex: 'It wakes at evening and fills the sky in great flocks. Its cry is too high for people to hear.',
})
S('coilet', 'COILET', ['SPARK'], [30, 32, 62, 44, 76], {
  catchRate: 190, exp: 64, growth: 'mediumFast', pal: 'orange', shinyPal: 'blue',
  learn: [[1, 'zap'], [1, 'brace'], [9, 'static'], [15, 'glow'], [21, 'seeker'], [27, 'arcBolt']],
  evolves: [{ to: 'tesloom', item: 'sparkCoin' }],
  discs: ['kaboom', 'mindWall', 'guardWall'],
  kind: 'COIL', height: 0.3, weight: 6.0,
  dex: 'A living copper coil that hums when it is happy. It is drawn to power lines and old batteries.',
})
S('tesloom', 'TESLOOM', ['SPARK', 'STONE'], [56, 52, 96, 72, 112], {
  catchRate: 60, exp: 168, growth: 'mediumFast', pal: 'orange', shinyPal: 'blue',
  learn: [[1, 'zap'], [1, 'brace'], [1, 'static'], [1, 'glow'], [21, 'seeker'], [27, 'arcBolt'], [36, 'mindWall'], [42, 'rockfall'], [48, 'lightning'], [54, 'kaboom']],
  discs: ['guardWall'],
  kind: 'TOWER', height: 2.2, weight: 260.0,
  dex: 'Lightning arcs between its coils during storms. Whole towns have run on the power of a single TESLOOM.',
})
S('tulipop', 'TULIPOP', ['PLANT'], [60, 64, 58, 74, 78], {
  catchRate: 75, exp: 150, growth: 'mediumFast', pal: 'pink', shinyPal: 'yellow',
  learn: [[1, 'vineLash'], [1, 'blossom'], [12, 'stunPollen'], [20, 'sharpLeaf'], [28, 'dozeDust'], [36, 'bloomBurst'], [44, 'sunbeam']],
  discs: ['mindBlast', 'mend'],
  kind: 'TULIP', height: 0.6, weight: 5.0,
  dex: 'It pops seeds from its bulb like a cork from a bottle. Fields of TULIPOP bloom every spring.',
})
S('shootling', 'SHOOTLING', ['PLANT'], [46, 58, 50, 48, 32], {
  catchRate: 190, exp: 62, growth: 'mediumFast', pal: 'green', shinyPal: 'yellow',
  learn: [[1, 'bump'], [1, 'vineLash'], [9, 'stare'], [15, 'sharpLeaf'], [21, 'twinKick'], [27, 'flex']],
  evolves: [{ to: 'bambrawl', item: 'sunCoin' }],
  discs: ['bodyThrow', 'suplex', 'chop'],
  kind: 'SHOOT', height: 0.5, weight: 4.0,
  dex: 'It grows a hand\'s width every day. Cut one down and two more sprout from the stump.',
})
S('bambrawl', 'BAMBRAWL', ['PLANT', 'BRAWL'], [76, 104, 80, 70, 56], {
  catchRate: 60, exp: 170, growth: 'mediumFast', pal: 'green', shinyPal: 'yellow',
  learn: [[1, 'bump'], [1, 'vineLash'], [1, 'stare'], [1, 'sharpLeaf'], [30, 'edgeHand'], [36, 'sweep'], [42, 'leapKick'], [48, 'bloomBurst'], [54, 'piledriver']],
  discs: ['chop', 'heave'],
  kind: 'BAMBOO', height: 1.7, weight: 48.0,
  dex: 'It fights with a staff of its own bamboo. Masters of the old dojos trained alongside it.',
})
S('skimmet', 'SKIMMET', ['BUG', 'WATER'], [50, 50, 50, 96, 56], {
  catchRate: 120, exp: 140, growth: 'mediumFast', pal: 'blue', shinyPal: 'red',
  learn: [[1, 'squirt'], [1, 'quickDash'], [18, 'froth'], [26, 'blur'], [34, 'needleRain'], [42, 'haste'], [50, 'bugRush']],
  kind: 'POND SKATER', height: 0.5, weight: 1.5,
  dex: 'It skates over ponds on long, waterproof legs. It can feel a fly land on the water from far away.',
})

// ─── Legends ──────────────────────────────────────────────────────────────
S('cuprion', 'CUPRION', ['SPARK', 'EARTH'], [90, 100, 90, 100, 120], {
  catchRate: 3, exp: 250, growth: 'slow', pal: 'orange', shinyPal: 'teal', legend: true,
  learn: [[1, 'zap'], [1, 'tremor'], [50, 'arcBolt'], [55, 'haste'], [60, 'quake'], [65, 'lightning'], [70, 'mindWall']],
  discs: ['heave', 'rockfall', 'fang'],
  kind: 'COPPER LION', height: 2.0, weight: 400.0,
  dex: 'A lion of living copper said to sleep beneath the old power works. Thunder follows wherever it walks.',
})
S('argentide', 'ARGENTIDE', ['WATER', 'MIND'], [100, 85, 95, 85, 125], {
  catchRate: 3, exp: 250, growth: 'slow', pal: 'ice', shinyPal: 'pink', legend: true,
  learn: [[1, 'squirt'], [1, 'mindPulse'], [50, 'paddle'], [55, 'mindWall'], [60, 'mindBlast'], [65, 'deluge'], [70, 'nap']],
  discs: ['frostRay', 'whiteout'],
  kind: 'MOON SERPENT', height: 6.0, weight: 220.0,
  dex: 'It rises from the sea on moonlit nights, its scales shining like silver. Sailors count its song as a blessing.',
})
S('aurigryph', 'AURIGRYPH', ['FIRE', 'SKY'], [90, 110, 85, 105, 110], {
  catchRate: 3, exp: 250, growth: 'slow', pal: 'gold', shinyPal: 'purple', legend: true,
  learn: [[1, 'cinder'], [1, 'flap'], [50, 'spiralBeak'], [55, 'flameJet'], [60, 'haste'], [65, 'diveBomb'], [70, 'inferno']],
  discs: ['heave'],
  kind: 'SUN GRIFFIN', height: 2.4, weight: 150.0,
  dex: 'A griffin with feathers of beaten gold. Legend says it carries the dawn up over the mountains each morning.',
})
S('solidus', 'SOLIDUS', ['MIND', 'DRAKE'], [100, 110, 100, 120, 140], {
  catchRate: 3, exp: 270, growth: 'slow', pal: 'gold', shinyPal: 'night', legend: true,
  learn: [[1, 'mindPulse'], [1, 'wyrmRage'], [1, 'mend'], [1, 'guardWall'], [60, 'mindBlast'], [65, 'drakeDance'], [70, 'drakeFury'], [75, 'wildcard'], [80, 'overdrive']],
  discs: ['flameJet', 'arcBolt', 'frostRay', 'quake', 'lightning', 'inferno', 'whiteout', 'soar'],
  kind: 'SOVEREIGN', height: 3.0, weight: 300.0,
  dex: 'Its golden scales were said to be the first coins ever made. Few who go looking for it ever return.',
})

export type SpeciesId =
  | 'pandle' | 'flarepaw' | 'pyronda' | 'dipple' | 'billow' | 'platyphoon' | 'sproth' | 'mossloth' | 'groveloth'
  | 'rooklet' | 'rookard' | 'corvalier' | 'marmlet' | 'marmount' | 'grublet' | 'caskling' | 'staggart'
  | 'antlet' | 'formidant' | 'glimmet' | 'lanterfly' | 'spudling' | 'tuberus' | 'puffspore' | 'mycoloss'
  | 'jerbolt' | 'amparoo' | 'corkrab' | 'galleocrab' | 'jellamp' | 'lumedusa' | 'ternlet' | 'ternado'
  | 'punchrimp' | 'pikelet' | 'lancepike' | 'kettlin' | 'samovar' | 'coalpup' | 'coalyote' | 'brickle'
  | 'bulwark' | 'settling' | 'badgrapple' | 'womball' | 'wombatank' | 'gilagrin' | 'scarabble' | 'bouldarab'
  | 'placojaw' | 'dunkmaw' | 'musebox' | 'phantorgan' | 'glimwisp' | 'gloomwisp' | 'grimwisp' | 'dartlet'
  | 'dartoad' | 'tarsight' | 'tarseer' | 'nimblamb' | 'cumulamb' | 'ermlet' | 'erminarch' | 'glaciox'
  | 'kidgruff' | 'billygruff' | 'hoardling' | 'gildrake' | 'aurigon' | 'alpacka' | 'magpenny' | 'magpilfer'
  | 'flitter' | 'vesperwing' | 'coilet' | 'tesloom' | 'tulipop' | 'shootling' | 'bambrawl' | 'skimmet'
  | 'cuprion' | 'argentide' | 'aurigryph' | 'solidus'

export const SPECIES: Readonly<Record<SpeciesId, SpeciesData>> = Object.fromEntries(
  list.map(([id, name, types, [hp, atk, def, spd, spc], d], i) => [id, { id: id as SpeciesId, num: i + 1, name, types, base: { hp, atk, def, spd, spc }, ...d }]),
) as Record<SpeciesId, SpeciesData>

/** Every species in ALMANAC order. */
export const SPECIES_IDS: readonly SpeciesId[] = list.map(([id]) => id as SpeciesId)

export function species(id: SpeciesId): SpeciesData {
  const s = SPECIES[id]
  if (!s) throw new Error(`unknown species ${id}`)
  return s
}

export function isSpeciesId(id: string): id is SpeciesId {
  return id in SPECIES
}

const preEvo = new Map<SpeciesId, SpeciesId>()
for (const s of Object.values(SPECIES)) for (const e of s.evolves ?? []) preEvo.set(e.to, s.id)

/** The species this one evolves from, if any. */
export function preEvolution(id: SpeciesId): SpeciesId | null {
  return preEvo.get(id) ?? null
}

/** The first stage of a species' family. */
export function familyRoot(id: SpeciesId): SpeciesId {
  let cur = id
  for (let p = preEvolution(cur); p; p = preEvolution(cur)) cur = p
  return cur
}

/** How far along its family a species is: 0, 1 or 2. */
export function stageOf(id: SpeciesId): number {
  let n = 0
  for (let p = preEvolution(id); p; p = preEvolution(p)) n++
  return n
}

import type { MoveId, StageKey, StatusId } from '../battle/types'
import type { TypeId } from './types'

/**
 * Every move in the game. The battle engine reads the numbers and effects;
 * the summary screen shows `name`, `type`, `category`, `power`, `accuracy`,
 * `pp` and `desc`; the battle scene plays `fx` tinted with the move's type
 * colour (TYPE_COLOR). Every name is the game's own.
 */

export type MoveCategory = 'physical' | 'special' | 'status'

/** Whom the move is aimed at. 'self' moves never miss and play `fx` on the user. */
export type MoveTarget = 'foe' | 'self'

/**
 * Animation style for the battle scene. The scene tints each with the
 * move's type colour and plays it on the target, or on the user for
 * 'self' moves.
 *
 * - `strike`     the user lunges forward; an impact star flashes on the target.
 * - `slash`      two or three diagonal claw or blade streaks across the target.
 * - `bite`       jaws snap shut on the target (upper and lower fangs meet).
 * - `projectile` a small shot (seed, cinder, pebble, rivet) flies from user to target.
 * - `beam`       a continuous ray streams from the user to the target.
 * - `burst`      an explosion blooms on the target, with debris flying out.
 * - `rain`       things fall on the target from above (rocks, thorns, sleet, bolts).
 * - `wave`       a wave or ripple rolls from the user across to the target.
 * - `drain`      glowing motes float from the target back to the user.
 * - `aura`       a glow pulses around the user (buffs, heals) or the target (status).
 * - `spin`       a whirl or vortex spins around the target.
 * - `shake`      the whole screen shakes (quakes, stomps, heavy flops).
 */
export type MoveFx =
  | 'strike'
  | 'slash'
  | 'bite'
  | 'projectile'
  | 'beam'
  | 'burst'
  | 'rain'
  | 'wave'
  | 'drain'
  | 'aura'
  | 'spin'
  | 'shake'

/**
 * What a move does besides plain damage. A move lists any number of these.
 * Chances are percentages (100 = always). Effects that touch the target
 * only apply while it is still standing.
 */
export type MoveEffect =
  /** Inflicts `status` on the target (status moves use chance 100 and roll accuracy instead). */
  | { kind: 'status'; status: StatusId; chance: number }
  /** Changes stat stages of the user ('self') or the target ('foe'). */
  | { kind: 'stages'; who: 'self' | 'foe'; stages: Partial<Record<StageKey, number>>; chance: number }
  /** The target loses its move this turn if it has not moved yet. */
  | { kind: 'flinch'; chance: number }
  /** The user loses this fraction of the damage it dealt. */
  | { kind: 'recoil'; fraction: number }
  /** The user regains this fraction of the damage it dealt. */
  | { kind: 'drain'; fraction: number }
  /** Hits `min`–`max` times; 2–5 uses the 3:3:1:1 spread, equal numbers hit exactly that often. */
  | { kind: 'multiHit'; min: number; max: number }
  /** The user restores this fraction of its max HP. */
  | { kind: 'heal'; fraction: number }
  /** Critical hits land 1 time in 8 instead of 1 in 16. */
  | { kind: 'highCrit' }
  /** Deals exactly this much damage, or the user's level; ignores stats and effectiveness but not immunity. */
  | { kind: 'fixed'; damage: number | 'level' }
  /** Fully restores HP and cures status, then the user sleeps for `turns` turns. */
  | { kind: 'rest'; turns: number }

export interface MoveData {
  id: MoveId
  /** Upper-case display name, twelve characters at most. */
  name: string
  type: TypeId
  category: MoveCategory
  /** Base power; 0 for status moves and fixed-damage moves. */
  power: number
  /** Percent chance to hit, 1–100; 0 means it never misses. */
  accuracy: number
  /** Max PP. */
  pp: number
  /** Higher goes first; most moves are 0. */
  priority: number
  target: MoveTarget
  /** Touches the target. */
  contact: boolean
  effects: readonly MoveEffect[]
  fx: MoveFx
  /** One line for the summary screen, about sixty characters at most. */
  desc: string
  /** No STAB and neutral against every type (STRUGGLE only). */
  typeless?: boolean
}

type Def = Omit<MoveData, 'priority' | 'target' | 'contact' | 'effects'> &
  Partial<Pick<MoveData, 'priority' | 'target' | 'contact' | 'effects'>>

const def = (d: Def): MoveData => ({ priority: 0, target: 'foe', contact: false, effects: [], ...d })

const inflict = (status: StatusId, chance = 100): MoveEffect => ({ kind: 'status', status, chance })
const foe = (stages: Partial<Record<StageKey, number>>, chance = 100): MoveEffect => ({ kind: 'stages', who: 'foe', stages, chance })
const self = (stages: Partial<Record<StageKey, number>>, chance = 100): MoveEffect => ({ kind: 'stages', who: 'self', stages, chance })
const flinch = (chance: number): MoveEffect => ({ kind: 'flinch', chance })
const recoil = (fraction: number): MoveEffect => ({ kind: 'recoil', fraction })
const drain = (fraction: number): MoveEffect => ({ kind: 'drain', fraction })
const hits = (min: number, max: number): MoveEffect => ({ kind: 'multiHit', min, max })
const heal = (fraction: number): MoveEffect => ({ kind: 'heal', fraction })
const HIGH_CRIT: MoveEffect = { kind: 'highCrit' }
const fixed = (damage: number | 'level'): MoveEffect => ({ kind: 'fixed', damage })
const rest = (turns: number): MoveEffect => ({ kind: 'rest', turns })

const LIST: readonly MoveData[] = [
  // NORMAL
  def({ id: 'bump', name: 'BUMP', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 35, contact: true, fx: 'strike', desc: 'A clumsy full-body bump.' }),
  def({ id: 'quickNip', name: 'QUICK NIP', type: 'normal', category: 'physical', power: 40, accuracy: 100, pp: 30, priority: 1, contact: true, fx: 'bite', desc: 'A darting nip that always strikes first.' }),
  def({ id: 'pawFlurry', name: 'PAW FLURRY', type: 'normal', category: 'physical', power: 18, accuracy: 85, pp: 20, contact: true, effects: [hits(2, 5)], fx: 'slash', desc: 'A flurry of paw swipes. Hits 2 to 5 times.' }),
  def({ id: 'bellyFlop', name: 'BELLY FLOP', type: 'normal', category: 'physical', power: 85, accuracy: 100, pp: 15, contact: true, effects: [inflict('par', 30)], fx: 'shake', desc: 'A crushing flop. May leave the foe paralysed.' }),
  def({ id: 'bigBellow', name: 'BIG BELLOW', type: 'normal', category: 'special', power: 90, accuracy: 100, pp: 10, fx: 'wave', desc: 'A booming bellow that rattles the foe.' }),
  def({ id: 'fullTilt', name: 'FULL TILT', type: 'normal', category: 'physical', power: 120, accuracy: 100, pp: 15, contact: true, effects: [recoil(1 / 3)], fx: 'strike', desc: 'A reckless all-out charge. The user takes recoil.' }),
  def({ id: 'chirrup', name: 'CHIRRUP', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 40, effects: [foe({ atk: -1 })], fx: 'aura', desc: "A sweet chirp that lowers the foe's ATTACK." }),
  def({ id: 'scowl', name: 'SCOWL', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 30, effects: [foe({ def: -1 })], fx: 'aura', desc: "A fierce scowl that lowers the foe's DEFENSE." }),
  def({ id: 'puppyEyes', name: 'PUPPY EYES', type: 'normal', category: 'status', power: 0, accuracy: 100, pp: 20, effects: [foe({ atk: -2 })], fx: 'aura', desc: "Big pleading eyes sharply lower the foe's ATTACK." }),
  def({ id: 'lickWounds', name: 'LICK WOUNDS', type: 'normal', category: 'status', power: 0, accuracy: 0, pp: 10, target: 'self', effects: [heal(1 / 2)], fx: 'aura', desc: 'Tends its wounds to restore half its max HP.' }),
  def({ id: 'siesta', name: 'SIESTA', type: 'normal', category: 'status', power: 0, accuracy: 0, pp: 10, target: 'self', effects: [rest(2)], fx: 'aura', desc: 'Naps for 2 turns to fully restore HP and status.' }),
  def({ id: 'struggle', name: 'STRUGGLE', type: 'normal', category: 'physical', power: 50, accuracy: 0, pp: 1, contact: true, typeless: true, effects: [recoil(1 / 4)], fx: 'strike', desc: 'Used when no PP is left. It hurts the user too.' }),

  // FLAME
  def({ id: 'cinderSpit', name: 'CINDER SPIT', type: 'flame', category: 'special', power: 40, accuracy: 100, pp: 25, effects: [inflict('brn', 10)], fx: 'projectile', desc: 'Spits glowing cinders. May burn the foe.' }),
  def({ id: 'hotCharge', name: 'HOT CHARGE', type: 'flame', category: 'physical', power: 70, accuracy: 100, pp: 20, contact: true, effects: [inflict('brn', 10)], fx: 'strike', desc: 'A charge with blazing horns. May burn the foe.' }),
  def({ id: 'kilnBlast', name: 'KILN BLAST', type: 'flame', category: 'special', power: 90, accuracy: 100, pp: 15, effects: [inflict('brn', 10)], fx: 'beam', desc: 'A roaring jet of kiln heat. May burn the foe.' }),
  def({ id: 'magmaSurge', name: 'MAGMA SURGE', type: 'flame', category: 'special', power: 110, accuracy: 85, pp: 5, effects: [inflict('brn', 30)], fx: 'burst', desc: 'A torrent of magma. Often burns the foe.' }),
  def({ id: 'moltenRam', name: 'MOLTEN RAM', type: 'flame', category: 'physical', power: 120, accuracy: 100, pp: 15, contact: true, effects: [recoil(1 / 3), inflict('brn', 10)], fx: 'strike', desc: 'A white-hot ram. The user takes recoil.' }),
  def({ id: 'smoulder', name: 'SMOULDER', type: 'flame', category: 'status', power: 0, accuracy: 85, pp: 15, effects: [inflict('brn')], fx: 'aura', desc: 'Wreathes the foe in embers to burn it.' }),

  // TIDE
  def({ id: 'spritz', name: 'SPRITZ', type: 'tide', category: 'special', power: 40, accuracy: 100, pp: 25, fx: 'projectile', desc: 'Sprays the foe with a jet of sea water.' }),
  def({ id: 'slipstream', name: 'SLIPSTREAM', type: 'tide', category: 'physical', power: 40, accuracy: 100, pp: 20, priority: 1, contact: true, fx: 'strike', desc: 'Rides a current to always strike first.' }),
  def({ id: 'riptide', name: 'RIPTIDE', type: 'tide', category: 'special', power: 65, accuracy: 100, pp: 20, effects: [foe({ spe: -1 }, 20)], fx: 'wave', desc: "A dragging current. May lower the foe's SPEED." }),
  def({ id: 'breaker', name: 'BREAKER', type: 'tide', category: 'physical', power: 80, accuracy: 100, pp: 15, contact: true, effects: [flinch(20)], fx: 'strike', desc: 'Crashes down like a wave. May make the foe flinch.' }),
  def({ id: 'undertow', name: 'UNDERTOW', type: 'tide', category: 'physical', power: 100, accuracy: 90, pp: 10, fx: 'wave', desc: 'Drags the foe under with crushing force.' }),
  def({ id: 'maelstrom', name: 'MAELSTROM', type: 'tide', category: 'special', power: 110, accuracy: 85, pp: 5, fx: 'spin', desc: 'Traps the foe in a crushing whirlpool.' }),
  def({ id: 'tidepool', name: 'TIDEPOOL', type: 'tide', category: 'status', power: 0, accuracy: 0, pp: 10, target: 'self', effects: [heal(1 / 2)], fx: 'aura', desc: 'Soaks in cool water to restore half its max HP.' }),

  // LEAF
  def({ id: 'seedFlick', name: 'SEED FLICK', type: 'leaf', category: 'special', power: 40, accuracy: 100, pp: 25, fx: 'projectile', desc: 'Flicks hard seeds at the foe.' }),
  def({ id: 'sapSip', name: 'SAP SIP', type: 'leaf', category: 'special', power: 40, accuracy: 100, pp: 20, effects: [drain(1 / 2)], fx: 'drain', desc: "Sips the foe's strength. Heals half the damage." }),
  def({ id: 'frondSlash', name: 'FROND SLASH', type: 'leaf', category: 'physical', power: 70, accuracy: 95, pp: 20, contact: true, effects: [HIGH_CRIT], fx: 'slash', desc: 'Fern claws slash. High critical-hit ratio.' }),
  def({ id: 'deepRoots', name: 'DEEP ROOTS', type: 'leaf', category: 'special', power: 75, accuracy: 100, pp: 10, effects: [drain(1 / 2)], fx: 'drain', desc: "Roots drink the foe's strength to heal the user." }),
  def({ id: 'thornStorm', name: 'THORN STORM', type: 'leaf', category: 'special', power: 110, accuracy: 85, pp: 5, fx: 'rain', desc: 'Rains a storm of sharp thorns on the foe.' }),
  def({ id: 'timberDrop', name: 'TIMBER DROP', type: 'leaf', category: 'physical', power: 120, accuracy: 100, pp: 15, contact: true, effects: [recoil(1 / 3)], fx: 'shake', desc: 'Topples like a tree. The user takes recoil.' }),
  def({ id: 'dozeDust', name: 'DOZE DUST', type: 'leaf', category: 'status', power: 0, accuracy: 75, pp: 15, effects: [inflict('slp')], fx: 'aura', desc: 'Scatters sleepy dust that puts the foe to sleep.' }),
  def({ id: 'sunbathe', name: 'SUNBATHE', type: 'leaf', category: 'status', power: 0, accuracy: 0, pp: 10, target: 'self', effects: [heal(1 / 2)], fx: 'aura', desc: 'Basks in the sun to restore half its max HP.' }),

  // VOLT
  def({ id: 'staticPop', name: 'STATIC POP', type: 'volt', category: 'special', power: 40, accuracy: 100, pp: 30, effects: [inflict('par', 10)], fx: 'burst', desc: 'A crackling pop of static. May paralyse.' }),
  def({ id: 'springSnap', name: 'SPRING SNAP', type: 'volt', category: 'physical', power: 75, accuracy: 100, pp: 15, contact: true, effects: [inflict('par', 10)], fx: 'strike', desc: 'A charged, coiled tail snaps out. May paralyse.' }),
  def({ id: 'arcFlash', name: 'ARC FLASH', type: 'volt', category: 'special', power: 90, accuracy: 100, pp: 15, effects: [inflict('par', 10)], fx: 'beam', desc: 'A blinding arc of current. May paralyse.' }),
  def({ id: 'skybolt', name: 'SKYBOLT', type: 'volt', category: 'special', power: 110, accuracy: 70, pp: 10, effects: [inflict('par', 30)], fx: 'rain', desc: 'Calls a bolt down from the sky. Often paralyses.' }),
  def({ id: 'tingle', name: 'TINGLE', type: 'volt', category: 'status', power: 0, accuracy: 90, pp: 20, effects: [inflict('par')], fx: 'aura', desc: 'A buzzing touch that paralyses the foe.' }),
  def({ id: 'overclock', name: 'OVERCLOCK', type: 'volt', category: 'status', power: 0, accuracy: 0, pp: 30, target: 'self', effects: [self({ spe: 2 })], fx: 'aura', desc: 'Revs up its nerves to sharply raise SPEED.' }),

  // FROST
  def({ id: 'sleetSpray', name: 'SLEET SPRAY', type: 'frost', category: 'special', power: 40, accuracy: 100, pp: 25, effects: [inflict('frz', 10)], fx: 'rain', desc: 'A spray of icy sleet. May freeze the foe.' }),
  def({ id: 'rimeLance', name: 'RIME LANCE', type: 'frost', category: 'physical', power: 80, accuracy: 100, pp: 15, contact: true, effects: [HIGH_CRIT], fx: 'strike', desc: 'A thrust of hard rime. High critical-hit ratio.' }),
  def({ id: 'coldSnap', name: 'COLD SNAP', type: 'frost', category: 'special', power: 90, accuracy: 100, pp: 10, effects: [inflict('frz', 10)], fx: 'beam', desc: 'A beam of sudden cold. May freeze the foe.' }),
  def({ id: 'whiteout', name: 'WHITEOUT', type: 'frost', category: 'special', power: 110, accuracy: 70, pp: 5, effects: [inflict('frz', 20)], fx: 'rain', desc: 'A blinding blizzard. May freeze the foe.' }),
  def({ id: 'shiver', name: 'SHIVER', type: 'frost', category: 'status', power: 0, accuracy: 100, pp: 20, effects: [foe({ spe: -2 })], fx: 'aura', desc: "An icy chill that sharply lowers the foe's SPEED." }),

  // BRAWL
  def({ id: 'quickJab', name: 'QUICK JAB', type: 'brawl', category: 'physical', power: 40, accuracy: 100, pp: 30, priority: 1, contact: true, fx: 'strike', desc: 'A lightning-fast jab that always strikes first.' }),
  def({ id: 'oneTwo', name: 'ONE-TWO', type: 'brawl', category: 'physical', power: 30, accuracy: 100, pp: 30, contact: true, effects: [hits(2, 2)], fx: 'strike', desc: 'A snappy one-two combo. Hits twice.' }),
  def({ id: 'knuckleBash', name: 'KNUCKLE BASH', type: 'brawl', category: 'physical', power: 75, accuracy: 100, pp: 20, contact: true, effects: [flinch(10)], fx: 'strike', desc: 'A solid punch. May make the foe flinch.' }),
  def({ id: 'cavitation', name: 'CAVITATION', type: 'brawl', category: 'special', power: 80, accuracy: 100, pp: 15, effects: [flinch(10)], fx: 'burst', desc: 'A punch so fast the water bursts. May flinch.' }),
  def({ id: 'haymaker', name: 'HAYMAKER', type: 'brawl', category: 'physical', power: 120, accuracy: 100, pp: 5, contact: true, effects: [self({ def: -1 })], fx: 'strike', desc: "A huge wild swing. Lowers the user's DEFENSE." }),
  def({ id: 'warmUp', name: 'WARM UP', type: 'brawl', category: 'status', power: 0, accuracy: 0, pp: 20, target: 'self', effects: [self({ atk: 1, def: 1 })], fx: 'aura', desc: 'Stretches out to raise ATTACK and DEFENSE.' }),

  // TOXIC
  def({ id: 'spinePrick', name: 'SPINE PRICK', type: 'toxic', category: 'physical', power: 40, accuracy: 100, pp: 30, contact: true, effects: [inflict('psn', 30)], fx: 'strike', desc: 'A venomous prick. May poison the foe.' }),
  def({ id: 'venomFan', name: 'VENOM FAN', type: 'toxic', category: 'special', power: 70, accuracy: 100, pp: 20, effects: [inflict('psn', 30)], fx: 'wave', desc: 'Fans out toxic spines. May poison the foe.' }),
  def({ id: 'bilgeBlast', name: 'BILGE BLAST', type: 'toxic', category: 'special', power: 95, accuracy: 100, pp: 10, effects: [inflict('psn', 30)], fx: 'burst', desc: 'A blast of foul bilge water. May poison the foe.' }),
  def({ id: 'foulMiasma', name: 'FOUL MIASMA', type: 'toxic', category: 'status', power: 0, accuracy: 90, pp: 10, effects: [inflict('tox')], fx: 'aura', desc: 'A reeking fog that badly poisons the foe.' }),
  def({ id: 'nettleDust', name: 'NETTLE DUST', type: 'toxic', category: 'status', power: 0, accuracy: 75, pp: 30, effects: [inflict('psn')], fx: 'aura', desc: 'Stinging dust that poisons the foe.' }),

  // EARTH
  def({ id: 'mudFling', name: 'MUD FLING', type: 'earth', category: 'special', power: 30, accuracy: 100, pp: 15, effects: [foe({ acc: -1 })], fx: 'projectile', desc: "Flings mud in the foe's eyes. Lowers accuracy." }),
  def({ id: 'dirtRake', name: 'DIRT RAKE', type: 'earth', category: 'physical', power: 20, accuracy: 90, pp: 20, contact: true, effects: [hits(2, 5)], fx: 'slash', desc: 'Rakes with digging claws. Hits 2 to 5 times.' }),
  def({ id: 'tremor', name: 'TREMOR', type: 'earth', category: 'physical', power: 70, accuracy: 100, pp: 15, effects: [flinch(10)], fx: 'shake', desc: 'Stamps hard to shake the ground. May flinch.' }),
  def({ id: 'upheaval', name: 'UPHEAVAL', type: 'earth', category: 'physical', power: 100, accuracy: 100, pp: 10, fx: 'shake', desc: 'Heaves the ground up beneath the foe.' }),
  def({ id: 'digIn', name: 'DIG IN', type: 'earth', category: 'status', power: 0, accuracy: 0, pp: 20, target: 'self', effects: [self({ def: 1, spd: 1 })], fx: 'aura', desc: 'Digs in its heels to raise DEFENSE and SP. DEF.' }),

  // GALE
  def({ id: 'wingSlap', name: 'WING SLAP', type: 'gale', category: 'physical', power: 40, accuracy: 100, pp: 35, contact: true, fx: 'strike', desc: 'Slaps the foe with a strong wing.' }),
  def({ id: 'squall', name: 'SQUALL', type: 'gale', category: 'special', power: 75, accuracy: 100, pp: 15, fx: 'wave', desc: 'A sudden squall of wind and spray.' }),
  def({ id: 'diveBomb', name: 'DIVE BOMB', type: 'gale', category: 'physical', power: 85, accuracy: 95, pp: 15, contact: true, effects: [flinch(20)], fx: 'strike', desc: 'Dives from high above. May make the foe flinch.' }),
  def({ id: 'howlingGale', name: 'HOWLING GALE', type: 'gale', category: 'special', power: 110, accuracy: 80, pp: 5, fx: 'spin', desc: 'A howling gale that batters the foe.' }),
  def({ id: 'skyPlunge', name: 'SKY PLUNGE', type: 'gale', category: 'physical', power: 120, accuracy: 100, pp: 15, contact: true, effects: [recoil(1 / 3)], fx: 'strike', desc: 'Plunges from the clouds. The user takes recoil.' }),
  def({ id: 'updraft', name: 'UPDRAFT', type: 'gale', category: 'status', power: 0, accuracy: 0, pp: 30, target: 'self', effects: [self({ spe: 2 })], fx: 'aura', desc: 'Catches a rising wind to sharply raise SPEED.' }),
  def({ id: 'preen', name: 'PREEN', type: 'gale', category: 'status', power: 0, accuracy: 0, pp: 10, target: 'self', effects: [heal(1 / 2)], fx: 'aura', desc: 'Tidies its feathers to restore half its max HP.' }),

  // MIND
  def({ id: 'glint', name: 'GLINT', type: 'mind', category: 'special', power: 40, accuracy: 100, pp: 30, fx: 'beam', desc: "A glint of will that stings the foe's mind." }),
  def({ id: 'brainwave', name: 'BRAINWAVE', type: 'mind', category: 'special', power: 70, accuracy: 100, pp: 20, effects: [foe({ spd: -1 }, 10)], fx: 'wave', desc: 'A ripple of thought. May lower SP. DEF.' }),
  def({ id: 'haloBurst', name: 'HALO BURST', type: 'mind', category: 'special', power: 100, accuracy: 100, pp: 10, effects: [foe({ spd: -1 }, 20)], fx: 'burst', desc: 'A burst of halo light. May lower SP. DEF.' }),
  def({ id: 'dreamsong', name: 'DREAMSONG', type: 'mind', category: 'status', power: 0, accuracy: 70, pp: 15, effects: [inflict('slp')], fx: 'wave', desc: 'A soft, dreamy song that lulls the foe to sleep.' }),
  def({ id: 'stillness', name: 'STILLNESS', type: 'mind', category: 'status', power: 0, accuracy: 0, pp: 20, target: 'self', effects: [self({ spa: 1, spd: 1 })], fx: 'aura', desc: 'Stills its mind to raise SP. ATK and SP. DEF.' }),

  // BUG
  def({ id: 'nibble', name: 'NIBBLE', type: 'bug', category: 'physical', power: 40, accuracy: 100, pp: 35, contact: true, fx: 'bite', desc: 'Nibbles the foe with tiny jaws.' }),
  def({ id: 'needleRain', name: 'NEEDLE RAIN', type: 'bug', category: 'physical', power: 20, accuracy: 95, pp: 20, effects: [hits(2, 5)], fx: 'rain', desc: 'Rains sharp needles. Hits 2 to 5 times.' }),
  def({ id: 'mantisChop', name: 'MANTIS CHOP', type: 'bug', category: 'physical', power: 75, accuracy: 100, pp: 15, contact: true, effects: [HIGH_CRIT], fx: 'slash', desc: 'Chops with folded forelimbs. High critical-hit ratio.' }),
  def({ id: 'scaleDust', name: 'SCALE DUST', type: 'bug', category: 'special', power: 65, accuracy: 100, pp: 20, effects: [foe({ spa: -1 }, 20)], fx: 'rain', desc: 'Glittering wing dust. May lower SP. ATK.' }),
  def({ id: 'swarmSurge', name: 'SWARM SURGE', type: 'bug', category: 'special', power: 95, accuracy: 100, pp: 10, effects: [foe({ spd: -1 }, 10)], fx: 'wave', desc: 'A roaring hum of wings. May lower SP. DEF.' }),
  def({ id: 'locustLeap', name: 'LOCUST LEAP', type: 'bug', category: 'physical', power: 100, accuracy: 90, pp: 10, contact: true, fx: 'strike', desc: 'A mighty leap that lands hard on the foe.' }),
  def({ id: 'silkSnare', name: 'SILK SNARE', type: 'bug', category: 'status', power: 0, accuracy: 95, pp: 30, effects: [foe({ spe: -2 })], fx: 'projectile', desc: 'Tangles the foe in silk. Sharply lowers SPEED.' }),

  // STONE
  def({ id: 'pebblePelt', name: 'PEBBLE PELT', type: 'stone', category: 'physical', power: 40, accuracy: 100, pp: 30, fx: 'projectile', desc: 'Pelts the foe with a handful of pebbles.' }),
  def({ id: 'rockfall', name: 'ROCKFALL', type: 'stone', category: 'physical', power: 75, accuracy: 90, pp: 10, effects: [flinch(30)], fx: 'rain', desc: 'Rocks tumble onto the foe. May make it flinch.' }),
  def({ id: 'quartzBeam', name: 'QUARTZ BEAM', type: 'stone', category: 'special', power: 80, accuracy: 100, pp: 20, fx: 'beam', desc: 'A ray of light split through quartz.' }),
  def({ id: 'cragCrush', name: 'CRAG CRUSH', type: 'stone', category: 'physical', power: 100, accuracy: 80, pp: 5, effects: [HIGH_CRIT], fx: 'shake', desc: 'Drops a crag on the foe. High critical-hit ratio.' }),
  def({ id: 'bedrock', name: 'BEDROCK', type: 'stone', category: 'status', power: 0, accuracy: 0, pp: 20, target: 'self', effects: [self({ def: 2 })], fx: 'aura', desc: 'Sets like bedrock to sharply raise DEFENSE.' }),

  // SPIRIT
  def({ id: 'spook', name: 'SPOOK', type: 'spirit', category: 'special', power: 40, accuracy: 100, pp: 25, effects: [flinch(30)], fx: 'aura', desc: 'A sudden scare. May make the foe flinch.' }),
  def({ id: 'reckoning', name: 'RECKONING', type: 'spirit', category: 'special', power: 0, accuracy: 100, pp: 15, effects: [fixed('level')], fx: 'aura', desc: "Settles old debts: damage equal to the user's level." }),
  def({ id: 'ghostlight', name: 'GHOSTLIGHT', type: 'spirit', category: 'special', power: 75, accuracy: 100, pp: 15, fx: 'beam', desc: 'A beam of eerie light from haunted eyes.' }),
  def({ id: 'doldrums', name: 'DOLDRUMS', type: 'spirit', category: 'special', power: 100, accuracy: 100, pp: 10, effects: [foe({ spe: -1 }, 20)], fx: 'wave', desc: "A dead-calm chill. May lower the foe's SPEED." }),
  def({ id: 'fogbank', name: 'FOGBANK', type: 'spirit', category: 'status', power: 0, accuracy: 100, pp: 20, effects: [foe({ acc: -1 })], fx: 'rain', desc: "Calls down fog to lower the foe's accuracy." }),

  // WYRM
  def({ id: 'scaleFlick', name: 'SCALE FLICK', type: 'wyrm', category: 'special', power: 40, accuracy: 100, pp: 25, fx: 'projectile', desc: 'Flicks razor-edged scales at the foe.' }),
  def({ id: 'coilCrush', name: 'COIL CRUSH', type: 'wyrm', category: 'physical', power: 80, accuracy: 100, pp: 15, contact: true, fx: 'spin', desc: 'Coils around the foe and squeezes hard.' }),
  def({ id: 'wyrmWrath', name: 'WYRM WRATH', type: 'wyrm', category: 'special', power: 110, accuracy: 90, pp: 5, fx: 'burst', desc: 'Unleashes the fury of the ancient wyrms.' }),
  def({ id: 'ascend', name: 'ASCEND', type: 'wyrm', category: 'status', power: 0, accuracy: 0, pp: 20, target: 'self', effects: [self({ atk: 1, spe: 1 })], fx: 'aura', desc: 'Rises up high to raise ATTACK and SPEED.' }),

  // METAL
  def({ id: 'rivetShot', name: 'RIVET SHOT', type: 'metal', category: 'physical', power: 40, accuracy: 100, pp: 30, priority: 1, fx: 'projectile', desc: 'Fires a rivet that always strikes first.' }),
  def({ id: 'sawtooth', name: 'SAWTOOTH', type: 'metal', category: 'physical', power: 75, accuracy: 95, pp: 15, contact: true, effects: [HIGH_CRIT], fx: 'slash', desc: 'Saws at the foe. High critical-hit ratio.' }),
  def({ id: 'chromeRay', name: 'CHROME RAY', type: 'metal', category: 'special', power: 80, accuracy: 100, pp: 10, effects: [foe({ spd: -1 }, 10)], fx: 'beam', desc: 'A glaring beam off polished metal. May lower SP. DEF.' }),
  def({ id: 'buzzsaw', name: 'BUZZSAW', type: 'metal', category: 'physical', power: 100, accuracy: 95, pp: 10, contact: true, fx: 'spin', desc: 'A whirling saw blade carves through the foe.' }),
  def({ id: 'whet', name: 'WHET', type: 'metal', category: 'status', power: 0, accuracy: 0, pp: 20, target: 'self', effects: [self({ atk: 2 })], fx: 'aura', desc: 'Hones its edges to sharply raise ATTACK.' }),

  // SHADE
  def({ id: 'ambush', name: 'AMBUSH', type: 'shade', category: 'physical', power: 40, accuracy: 100, pp: 30, priority: 1, contact: true, fx: 'bite', desc: 'Lunges from hiding to always strike first.' }),
  def({ id: 'gnash', name: 'GNASH', type: 'shade', category: 'physical', power: 60, accuracy: 100, pp: 25, contact: true, effects: [flinch(10)], fx: 'bite', desc: 'Gnashing teeth. May make the foe flinch.' }),
  def({ id: 'blackwater', name: 'BLACKWATER', type: 'shade', category: 'special', power: 75, accuracy: 95, pp: 15, effects: [foe({ acc: -1 }, 20)], fx: 'wave', desc: 'A surge of inky water. May lower accuracy.' }),
  def({ id: 'abyssJaws', name: 'ABYSS JAWS', type: 'shade', category: 'physical', power: 95, accuracy: 100, pp: 10, contact: true, effects: [foe({ def: -1 }, 20)], fx: 'bite', desc: "Jaws from the deep. May lower the foe's DEFENSE." }),
  def({ id: 'scheme', name: 'SCHEME', type: 'shade', category: 'status', power: 0, accuracy: 0, pp: 20, target: 'self', effects: [self({ spa: 2 })], fx: 'aura', desc: 'Plots in the dark to sharply raise SP. ATK.' }),
]

export const MOVES: readonly MoveData[] = LIST

const BY_ID = new Map<MoveId, MoveData>(LIST.map((m) => [m.id, m]))

/** The move with this id; throws on an unknown id (a data bug). */
export function move(id: MoveId): MoveData {
  const m = BY_ID.get(id)
  if (!m) throw new Error(`unknown move ${id}`)
  return m
}

/** Whether a move id exists (for validating saves and data). */
export function isMove(id: MoveId): boolean {
  return BY_ID.has(id)
}

/** Used automatically when a beast has no PP left in any move. */
export const STRUGGLE: MoveId = 'struggle'

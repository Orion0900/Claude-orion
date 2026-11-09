/**
 * Every move in the game. Names, numbers and effects are Capsule Critters'
 * own; the rules that use them are in src/battle. Power 0 means a status
 * move; accuracy 0 means it never misses.
 */
import type { TypeId } from './types'

export type StatusId = 'psn' | 'tox' | 'brn' | 'par' | 'slp' | 'frz'
export type StageKey = 'atk' | 'def' | 'spd' | 'spc' | 'acc' | 'eva'

export type MoveEffect =
  /** Inflicts a major status: always for a status move, `chance`% for a damaging one. */
  | { kind: 'status'; status: StatusId }
  | { kind: 'confuse' }
  | { kind: 'flinch' }
  /** Raises or lowers one stat stage. */
  | { kind: 'stage'; who: 'self' | 'foe'; stat: StageKey; n: number }
  /** Raises several of the user's stats at once. */
  | { kind: 'stages'; stats: readonly StageKey[]; n: number }
  /** Restores half the user's max HP. */
  | { kind: 'heal' }
  /** Sleeps for two turns and restores everything. */
  | { kind: 'nap' }
  /** Seeds the foe: it loses 1/16 of its HP each turn and the user gains it. */
  | { kind: 'leech' }
  /** Traps the foe for 2–5 turns, hurting it 1/16 each turn. */
  | { kind: 'bind' }
  /** Halves physical or special damage to the user's side for 5 turns. */
  | { kind: 'screen'; which: 'phys' | 'spec' }
  /** The user's stats can't be lowered for 5 turns. */
  | { kind: 'mist' }
  /** Raises the critical-hit rate. */
  | { kind: 'focus' }
  /** Wipes every stat change on both sides. */
  | { kind: 'haze' }
  /** Ends a wild battle. */
  | { kind: 'escape' }
  /** Scatters coins that are picked up after the battle. */
  | { kind: 'coins' }
  /** Uses a random other move. */
  | { kind: 'wildcard' }
  /** Does nothing at all. */
  | { kind: 'nothing' }
  /** Only works on a sleeping foe; drains half the damage. */
  | { kind: 'dreamSip' }
  /** Double power against a foe with a status. */
  | { kind: 'jinx' }

export type FxKind =
  | 'hit'
  | 'claw'
  | 'bite'
  | 'kick'
  | 'punch'
  | 'beam'
  | 'ball'
  | 'rain'
  | 'blast'
  | 'wave'
  | 'spiral'
  | 'flame'
  | 'bubble'
  | 'bolt'
  | 'ice'
  | 'leaf'
  | 'powder'
  | 'wind'
  | 'needle'
  | 'rock'
  | 'quake'
  | 'shade'
  | 'heal'
  | 'notes'
  | 'gaze'
  | 'up'
  | 'down'
  | 'wall'
  | 'drain'
  | 'coins'
  | 'none'

export interface MoveData {
  readonly id: string
  readonly name: string
  readonly type: TypeId
  /** 0 for status moves. */
  readonly power: number
  /** Percent; 0 never misses. */
  readonly acc: number
  readonly pp: number
  readonly priority?: number
  readonly effect?: MoveEffect
  /** Percent chance of `effect` for damaging moves. */
  readonly chance?: number
  readonly highCrit?: boolean
  /** Hits: a fixed count or a [min, max] range (2–5 weighted like the classics). */
  readonly multi?: number | readonly [number, number]
  /** Share of the damage dealt that heals the user. */
  readonly drain?: number
  /** Share of the damage dealt that the user takes back. */
  readonly recoil?: number
  /** Fixed damage: an amount, the user's level, or half the foe's HP. */
  readonly fixed?: number | 'level' | 'half'
  /** Two-turn moves: 'charge' waits a turn; 'semi' also dodges almost everything meanwhile. */
  readonly charge?: 'charge' | 'semi'
  /** The user must rest the next turn. */
  readonly recharge?: boolean
  /** The user faints. */
  readonly selfKO?: boolean
  /** On a miss the user takes 1/8 of its max HP. */
  readonly crash?: boolean
  readonly fx: FxKind
  readonly desc: string
}

const M = <T extends Record<string, Omit<MoveData, 'id'>>>(m: T) => m

const RAW = M({
  // ─── NORMAL ─────────────────────────────────────────────
  bump: { name: 'BUMP', type: 'NORMAL', power: 40, acc: 100, pp: 35, fx: 'hit', desc: 'A full-body bump.' },
  swipe: { name: 'SWIPE', type: 'NORMAL', power: 40, acc: 100, pp: 35, fx: 'claw', desc: 'Rakes with claws.' },
  snarl: { name: 'SNARL', type: 'NORMAL', power: 0, acc: 100, pp: 40, effect: { kind: 'stage', who: 'foe', stat: 'atk', n: -1 }, fx: 'down', desc: 'Lowers the foe\'s ATTACK.' },
  stare: { name: 'STARE', type: 'NORMAL', power: 0, acc: 100, pp: 30, effect: { kind: 'stage', who: 'foe', stat: 'def', n: -1 }, fx: 'gaze', desc: 'Lowers the foe\'s DEFENSE.' },
  quickDash: { name: 'QUICK DASH', type: 'NORMAL', power: 40, acc: 100, pp: 30, priority: 1, fx: 'hit', desc: 'Always strikes first.' },
  ram: { name: 'RAM', type: 'NORMAL', power: 70, acc: 100, pp: 15, effect: { kind: 'flinch' }, chance: 30, fx: 'hit', desc: 'A headlong ram. May make the foe flinch.' },
  flatten: { name: 'FLATTEN', type: 'NORMAL', power: 85, acc: 100, pp: 15, effect: { kind: 'status', status: 'par' }, chance: 30, fx: 'hit', desc: 'Lands with its full weight. May paralyze.' },
  barge: { name: 'BARGE', type: 'NORMAL', power: 90, acc: 85, pp: 20, recoil: 0.25, fx: 'hit', desc: 'A reckless charge that hurts the user too.' },
  stampede: { name: 'STAMPEDE', type: 'NORMAL', power: 120, acc: 100, pp: 15, recoil: 1 / 3, fx: 'hit', desc: 'An all-out charge with heavy recoil.' },
  pummel: { name: 'PUMMEL', type: 'NORMAL', power: 18, acc: 85, pp: 15, multi: [2, 5], fx: 'punch', desc: 'Strikes 2 to 5 times.' },
  focus: { name: 'FOCUS', type: 'NORMAL', power: 0, acc: 0, pp: 30, effect: { kind: 'focus' }, fx: 'up', desc: 'Raises the chance of critical hits.' },
  mend: { name: 'MEND', type: 'NORMAL', power: 0, acc: 0, pp: 20, effect: { kind: 'heal' }, fx: 'heal', desc: 'Restores half of max HP.' },
  seeker: { name: 'SEEKER', type: 'NORMAL', power: 60, acc: 0, pp: 20, fx: 'ball', desc: 'Homing stars that never miss.' },
  overdrive: { name: 'OVERDRIVE', type: 'NORMAL', power: 150, acc: 90, pp: 5, recharge: true, fx: 'beam', desc: 'Huge power, but the user must rest after.' },
  kaboom: { name: 'KABOOM', type: 'NORMAL', power: 170, acc: 100, pp: 5, selfKO: true, fx: 'blast', desc: 'A huge blast. The user faints.' },
  coinToss: { name: 'COIN TOSS', type: 'NORMAL', power: 40, acc: 100, pp: 20, effect: { kind: 'coins' }, fx: 'coins', desc: 'Flings coins. Pick them up after the battle.' },
  lullaby: { name: 'LULLABY', type: 'NORMAL', power: 0, acc: 55, pp: 15, effect: { kind: 'status', status: 'slp' }, fx: 'notes', desc: 'A soft song that makes the foe sleep.' },
  dizzyTone: { name: 'DIZZY TONE', type: 'NORMAL', power: 0, acc: 55, pp: 20, effect: { kind: 'confuse' }, fx: 'wave', desc: 'A warbling hum that confuses.' },
  shriek: { name: 'SHRIEK', type: 'NORMAL', power: 0, acc: 85, pp: 40, effect: { kind: 'stage', who: 'foe', stat: 'def', n: -2 }, fx: 'wave', desc: 'Sharply lowers the foe\'s DEFENSE.' },
  brace: { name: 'BRACE', type: 'NORMAL', power: 0, acc: 0, pp: 30, effect: { kind: 'stage', who: 'self', stat: 'def', n: 1 }, fx: 'up', desc: 'Raises DEFENSE.' },
  pumpUp: { name: 'PUMP UP', type: 'NORMAL', power: 0, acc: 0, pp: 30, effect: { kind: 'stage', who: 'self', stat: 'atk', n: 2 }, fx: 'up', desc: 'Sharply raises ATTACK.' },
  haste: { name: 'HASTE', type: 'NORMAL', power: 0, acc: 0, pp: 30, effect: { kind: 'stage', who: 'self', stat: 'spd', n: 2 }, fx: 'up', desc: 'Sharply raises SPEED.' },
  blur: { name: 'BLUR', type: 'NORMAL', power: 0, acc: 0, pp: 15, effect: { kind: 'stage', who: 'self', stat: 'eva', n: 1 }, fx: 'up', desc: 'Raises evasion.' },
  bellow: { name: 'BELLOW', type: 'NORMAL', power: 0, acc: 100, pp: 20, effect: { kind: 'escape' }, fx: 'wave', desc: 'Scares off a wild critter.' },
  wildcard: { name: 'WILDCARD', type: 'NORMAL', power: 0, acc: 0, pp: 10, effect: { kind: 'wildcard' }, fx: 'none', desc: 'Uses a move at random.' },
  chomp: { name: 'CHOMP', type: 'NORMAL', power: 60, acc: 100, pp: 25, effect: { kind: 'flinch' }, chance: 30, fx: 'bite', desc: 'A hard bite. May make the foe flinch.' },
  fang: { name: 'FANG', type: 'NORMAL', power: 80, acc: 90, pp: 15, effect: { kind: 'flinch' }, chance: 10, fx: 'bite', desc: 'Sinks in sharp fangs.' },
  squeeze: { name: 'SQUEEZE', type: 'NORMAL', power: 15, acc: 90, pp: 20, effect: { kind: 'bind' }, fx: 'spiral', desc: 'Wraps the foe for 2 to 5 turns.' },
  gnaw: { name: 'GNAW', type: 'NORMAL', power: 1, acc: 90, pp: 10, fixed: 'half', fx: 'bite', desc: 'Halves the foe\'s HP.' },
  petrify: { name: 'PETRIFY', type: 'NORMAL', power: 0, acc: 75, pp: 30, effect: { kind: 'status', status: 'par' }, fx: 'gaze', desc: 'A stony glare that paralyzes.' },
  chop: { name: 'CHOP', type: 'NORMAL', power: 50, acc: 95, pp: 30, fx: 'claw', desc: 'A cutting blow. Clears thorn bushes outside battle.' },
  heave: { name: 'HEAVE', type: 'NORMAL', power: 80, acc: 100, pp: 15, fx: 'punch', desc: 'Huge strength. Shoves boulders outside battle.' },
  glow: { name: 'GLOW', type: 'NORMAL', power: 0, acc: 70, pp: 20, effect: { kind: 'stage', who: 'foe', stat: 'acc', n: -1 }, fx: 'blast', desc: 'A bright flash. Lights dark caves outside battle.' },
  strain: { name: 'STRAIN', type: 'NORMAL', power: 50, acc: 0, pp: 1, recoil: 0.25, fx: 'hit', desc: 'Used when no moves are left.' },
  flop: { name: 'FLOP', type: 'NORMAL', power: 0, acc: 0, pp: 40, effect: { kind: 'nothing' }, fx: 'none', desc: 'Flops about. Nothing happens.' },

  // ─── FIRE ───────────────────────────────────────────────
  cinder: { name: 'CINDER', type: 'FIRE', power: 40, acc: 100, pp: 25, effect: { kind: 'status', status: 'brn' }, chance: 10, fx: 'flame', desc: 'Hot sparks. May burn.' },
  singe: { name: 'SINGE', type: 'FIRE', power: 0, acc: 85, pp: 15, effect: { kind: 'status', status: 'brn' }, fx: 'flame', desc: 'Licks the foe with flame to burn it.' },
  fireRing: { name: 'FIRE RING', type: 'FIRE', power: 35, acc: 85, pp: 15, effect: { kind: 'bind' }, fx: 'spiral', desc: 'Traps the foe in a ring of fire.' },
  blazeFist: { name: 'BLAZE FIST', type: 'FIRE', power: 75, acc: 100, pp: 15, effect: { kind: 'status', status: 'brn' }, chance: 10, fx: 'punch', desc: 'A burning punch. May burn.' },
  flameJet: { name: 'FLAME JET', type: 'FIRE', power: 90, acc: 100, pp: 15, effect: { kind: 'status', status: 'brn' }, chance: 10, fx: 'flame', desc: 'A jet of flame. May burn.' },
  inferno: { name: 'INFERNO', type: 'FIRE', power: 110, acc: 85, pp: 5, effect: { kind: 'status', status: 'brn' }, chance: 30, fx: 'blast', desc: 'A roaring blaze. May burn.' },

  // ─── WATER ──────────────────────────────────────────────
  squirt: { name: 'SQUIRT', type: 'WATER', power: 40, acc: 100, pp: 25, fx: 'bubble', desc: 'A squirt of water.' },
  froth: { name: 'FROTH', type: 'WATER', power: 65, acc: 100, pp: 20, effect: { kind: 'stage', who: 'foe', stat: 'spd', n: -1 }, chance: 10, fx: 'bubble', desc: 'A rush of foam. May lower SPEED.' },
  paddle: { name: 'PADDLE', type: 'WATER', power: 90, acc: 100, pp: 15, fx: 'wave', desc: 'A crashing wave. Carries you over water outside battle.' },
  deluge: { name: 'DELUGE', type: 'WATER', power: 110, acc: 80, pp: 5, fx: 'wave', desc: 'A torrent of water.' },
  undertow: { name: 'UNDERTOW', type: 'WATER', power: 35, acc: 85, pp: 15, effect: { kind: 'bind' }, fx: 'spiral', desc: 'Drags the foe under for 2 to 5 turns.' },
  shellUp: { name: 'SHELL UP', type: 'WATER', power: 0, acc: 0, pp: 40, effect: { kind: 'stage', who: 'self', stat: 'def', n: 1 }, fx: 'up', desc: 'Hunkers down. Raises DEFENSE.' },
  tidalClaw: { name: 'TIDAL CLAW', type: 'WATER', power: 90, acc: 85, pp: 10, highCrit: true, fx: 'claw', desc: 'Strikes with water-hard claws. Often critical.' },

  // ─── PLANT ──────────────────────────────────────────────
  vineLash: { name: 'VINE LASH', type: 'PLANT', power: 45, acc: 100, pp: 25, fx: 'leaf', desc: 'Lashes with vines.' },
  sharpLeaf: { name: 'SHARP LEAF', type: 'PLANT', power: 55, acc: 95, pp: 25, highCrit: true, fx: 'leaf', desc: 'Razor leaves. Often critical.' },
  sap: { name: 'SAP', type: 'PLANT', power: 30, acc: 100, pp: 25, drain: 0.5, fx: 'drain', desc: 'Drains HP from the foe.' },
  siphon: { name: 'SIPHON', type: 'PLANT', power: 60, acc: 100, pp: 10, drain: 0.5, fx: 'drain', desc: 'Drains a lot of HP from the foe.' },
  leechVine: { name: 'LEECH VINE', type: 'PLANT', power: 0, acc: 90, pp: 10, effect: { kind: 'leech' }, fx: 'leaf', desc: 'Plants a vine that drains the foe each turn.' },
  dozeDust: { name: 'DOZE DUST', type: 'PLANT', power: 0, acc: 75, pp: 15, effect: { kind: 'status', status: 'slp' }, fx: 'powder', desc: 'Sleepy pollen that makes the foe doze.' },
  stunPollen: { name: 'STUN POLLEN', type: 'PLANT', power: 0, acc: 75, pp: 30, effect: { kind: 'status', status: 'par' }, fx: 'powder', desc: 'Prickly pollen that paralyzes.' },
  sunbeam: { name: 'SUNBEAM', type: 'PLANT', power: 120, acc: 100, pp: 10, charge: 'charge', fx: 'beam', desc: 'Soaks up light, then fires it next turn.' },
  bloomBurst: { name: 'BLOOM BURST', type: 'PLANT', power: 90, acc: 100, pp: 10, fx: 'leaf', desc: 'A storm of petals.' },
  blossom: { name: 'BLOSSOM', type: 'PLANT', power: 0, acc: 0, pp: 40, effect: { kind: 'stage', who: 'self', stat: 'spc', n: 1 }, fx: 'up', desc: 'Raises SPECIAL.' },

  // ─── SPARK ──────────────────────────────────────────────
  zap: { name: 'ZAP', type: 'SPARK', power: 40, acc: 100, pp: 30, effect: { kind: 'status', status: 'par' }, chance: 10, fx: 'bolt', desc: 'A small shock. May paralyze.' },
  shockFist: { name: 'SHOCK FIST', type: 'SPARK', power: 75, acc: 100, pp: 15, effect: { kind: 'status', status: 'par' }, chance: 10, fx: 'punch', desc: 'An electric punch. May paralyze.' },
  arcBolt: { name: 'ARC BOLT', type: 'SPARK', power: 90, acc: 100, pp: 15, effect: { kind: 'status', status: 'par' }, chance: 10, fx: 'bolt', desc: 'An arcing bolt. May paralyze.' },
  lightning: { name: 'LIGHTNING', type: 'SPARK', power: 110, acc: 70, pp: 10, effect: { kind: 'status', status: 'par' }, chance: 30, fx: 'bolt', desc: 'A bolt from the sky. May paralyze.' },
  static: { name: 'STATIC', type: 'SPARK', power: 0, acc: 100, pp: 20, effect: { kind: 'status', status: 'par' }, fx: 'bolt', desc: 'A weak current that paralyzes.' },

  // ─── FROST ──────────────────────────────────────────────
  flurry: { name: 'FLURRY', type: 'FROST', power: 40, acc: 100, pp: 25, effect: { kind: 'status', status: 'frz' }, chance: 10, fx: 'ice', desc: 'Freezing snow. May freeze.' },
  frostFist: { name: 'FROST FIST', type: 'FROST', power: 75, acc: 100, pp: 15, effect: { kind: 'status', status: 'frz' }, chance: 10, fx: 'punch', desc: 'An icy punch. May freeze.' },
  aurora: { name: 'AURORA', type: 'FROST', power: 65, acc: 100, pp: 20, effect: { kind: 'stage', who: 'foe', stat: 'atk', n: -1 }, chance: 10, fx: 'beam', desc: 'Shimmering light. May lower ATTACK.' },
  frostRay: { name: 'FROST RAY', type: 'FROST', power: 90, acc: 100, pp: 10, effect: { kind: 'status', status: 'frz' }, chance: 10, fx: 'beam', desc: 'A freezing ray. May freeze.' },
  whiteout: { name: 'WHITEOUT', type: 'FROST', power: 110, acc: 70, pp: 5, effect: { kind: 'status', status: 'frz' }, chance: 10, fx: 'ice', desc: 'A raging blizzard. May freeze.' },
  coldFog: { name: 'COLD FOG', type: 'FROST', power: 0, acc: 0, pp: 30, effect: { kind: 'haze' }, fx: 'powder', desc: 'Freezing fog that undoes all stat changes.' },
  frostVeil: { name: 'FROST VEIL', type: 'FROST', power: 0, acc: 0, pp: 30, effect: { kind: 'mist' }, fx: 'wall', desc: 'Stops stats being lowered for 5 turns.' },

  // ─── BRAWL ──────────────────────────────────────────────
  edgeHand: { name: 'EDGE HAND', type: 'BRAWL', power: 50, acc: 100, pp: 25, highCrit: true, fx: 'claw', desc: 'A knife-hand blow. Often critical.' },
  twinKick: { name: 'TWIN KICK', type: 'BRAWL', power: 30, acc: 100, pp: 30, multi: 2, fx: 'kick', desc: 'Kicks twice.' },
  sweep: { name: 'SWEEP', type: 'BRAWL', power: 60, acc: 90, pp: 20, effect: { kind: 'flinch' }, chance: 30, fx: 'kick', desc: 'A low sweep. May make the foe flinch.' },
  leapKick: { name: 'LEAP KICK', type: 'BRAWL', power: 85, acc: 90, pp: 20, crash: true, fx: 'kick', desc: 'A flying kick. Hurts the user if it misses.' },
  suplex: { name: 'SUPLEX', type: 'BRAWL', power: 80, acc: 80, pp: 25, recoil: 0.25, fx: 'hit', desc: 'A body slam that jars the user too.' },
  bodyThrow: { name: 'BODY THROW', type: 'BRAWL', power: 1, acc: 100, pp: 20, fixed: 'level', fx: 'hit', desc: 'Damage equal to the user\'s level.' },
  flex: { name: 'FLEX', type: 'BRAWL', power: 0, acc: 0, pp: 20, effect: { kind: 'stages', stats: ['atk', 'def'], n: 1 }, fx: 'up', desc: 'Raises ATTACK and DEFENSE.' },
  piledriver: { name: 'PILEDRIVER', type: 'BRAWL', power: 100, acc: 80, pp: 5, highCrit: true, fx: 'hit', desc: 'A crushing slam. Often critical.' },

  // ─── VENOM ──────────────────────────────────────────────
  sting: { name: 'STING', type: 'VENOM', power: 15, acc: 100, pp: 35, effect: { kind: 'status', status: 'psn' }, chance: 30, fx: 'needle', desc: 'A venom barb. May poison.' },
  corrode: { name: 'CORRODE', type: 'VENOM', power: 40, acc: 100, pp: 30, effect: { kind: 'stage', who: 'foe', stat: 'def', n: -1 }, chance: 10, fx: 'bubble', desc: 'Eating slime. May lower DEFENSE.' },
  gunk: { name: 'GUNK', type: 'VENOM', power: 65, acc: 100, pp: 20, effect: { kind: 'status', status: 'psn' }, chance: 30, fx: 'ball', desc: 'A splat of gunk. May poison.' },
  blight: { name: 'BLIGHT', type: 'VENOM', power: 90, acc: 100, pp: 10, effect: { kind: 'status', status: 'psn' }, chance: 30, fx: 'blast', desc: 'A toxic burst. May poison.' },
  miasma: { name: 'MIASMA', type: 'VENOM', power: 0, acc: 80, pp: 35, effect: { kind: 'status', status: 'psn' }, fx: 'powder', desc: 'A foul haze that poisons.' },
  noxious: { name: 'NOXIOUS', type: 'VENOM', power: 0, acc: 85, pp: 10, effect: { kind: 'status', status: 'tox' }, fx: 'powder', desc: 'Badly poisons. It gets worse every turn.' },
  slimeSkin: { name: 'SLIME SKIN', type: 'VENOM', power: 0, acc: 0, pp: 40, effect: { kind: 'stage', who: 'self', stat: 'def', n: 2 }, fx: 'up', desc: 'Sharply raises DEFENSE.' },
  barb: { name: 'BARB', type: 'VENOM', power: 60, acc: 100, pp: 20, effect: { kind: 'status', status: 'psn' }, chance: 30, fx: 'needle', desc: 'A venomous jab. May poison.' },

  // ─── EARTH ──────────────────────────────────────────────
  mudSplat: { name: 'MUD SPLAT', type: 'EARTH', power: 30, acc: 100, pp: 15, effect: { kind: 'stage', who: 'foe', stat: 'acc', n: -1 }, chance: 100, fx: 'ball', desc: 'Mud in the eyes. Lowers accuracy.' },
  dustKick: { name: 'DUST KICK', type: 'EARTH', power: 0, acc: 100, pp: 15, effect: { kind: 'stage', who: 'foe', stat: 'acc', n: -1 }, fx: 'powder', desc: 'Kicks up dust. Lowers accuracy.' },
  tremor: { name: 'TREMOR', type: 'EARTH', power: 60, acc: 100, pp: 20, fx: 'quake', desc: 'Shakes the ground.' },
  burrow: { name: 'BURROW', type: 'EARTH', power: 80, acc: 100, pp: 10, charge: 'semi', fx: 'quake', desc: 'Digs down, then strikes from below.' },
  quake: { name: 'QUAKE', type: 'EARTH', power: 100, acc: 100, pp: 10, fx: 'quake', desc: 'A violent earthquake.' },

  // ─── SKY ────────────────────────────────────────────────
  flap: { name: 'FLAP', type: 'SKY', power: 40, acc: 100, pp: 35, fx: 'wind', desc: 'A gust from beating wings.' },
  beakJab: { name: 'BEAK JAB', type: 'SKY', power: 35, acc: 100, pp: 35, fx: 'needle', desc: 'Jabs with the beak.' },
  wingCut: { name: 'WING CUT', type: 'SKY', power: 60, acc: 100, pp: 35, fx: 'claw', desc: 'Slices with a wing.' },
  spiralBeak: { name: 'SPIRAL BEAK', type: 'SKY', power: 80, acc: 100, pp: 20, fx: 'spiral', desc: 'A spinning beak attack.' },
  soar: { name: 'SOAR', type: 'SKY', power: 90, acc: 95, pp: 15, charge: 'semi', fx: 'wind', desc: 'Flies up, then dives. Flies you to towns outside battle.' },
  diveBomb: { name: 'DIVE BOMB', type: 'SKY', power: 140, acc: 90, pp: 5, charge: 'charge', effect: { kind: 'flinch' }, chance: 30, fx: 'blast', desc: 'Climbs high, then plunges next turn.' },
  perch: { name: 'PERCH', type: 'SKY', power: 0, acc: 0, pp: 10, effect: { kind: 'heal' }, fx: 'heal', desc: 'Rests on a perch. Restores half of max HP.' },

  // ─── MIND ───────────────────────────────────────────────
  mindPulse: { name: 'MIND PULSE', type: 'MIND', power: 50, acc: 100, pp: 25, effect: { kind: 'confuse' }, chance: 10, fx: 'wave', desc: 'A psychic pulse. May confuse.' },
  dazzleBeam: { name: 'DAZZLE BEAM', type: 'MIND', power: 65, acc: 100, pp: 20, effect: { kind: 'confuse' }, chance: 10, fx: 'beam', desc: 'A strange beam. May confuse.' },
  mindBlast: { name: 'MIND BLAST', type: 'MIND', power: 90, acc: 100, pp: 10, effect: { kind: 'stage', who: 'foe', stat: 'spc', n: -1 }, chance: 30, fx: 'wave', desc: 'A blast of will. May lower SPECIAL.' },
  swirlGaze: { name: 'SWIRL GAZE', type: 'MIND', power: 0, acc: 60, pp: 20, effect: { kind: 'status', status: 'slp' }, fx: 'gaze', desc: 'Spiralling eyes that send the foe to sleep.' },
  daydream: { name: 'DAYDREAM', type: 'MIND', power: 0, acc: 0, pp: 20, effect: { kind: 'stage', who: 'self', stat: 'spc', n: 2 }, fx: 'up', desc: 'Sharply raises SPECIAL.' },
  guardWall: { name: 'GUARD WALL', type: 'MIND', power: 0, acc: 0, pp: 20, effect: { kind: 'screen', which: 'phys' }, fx: 'wall', desc: 'Halves physical damage for 5 turns.' },
  mindWall: { name: 'MIND WALL', type: 'MIND', power: 0, acc: 0, pp: 30, effect: { kind: 'screen', which: 'spec' }, fx: 'wall', desc: 'Halves special damage for 5 turns.' },
  nap: { name: 'NAP', type: 'MIND', power: 0, acc: 0, pp: 10, effect: { kind: 'nap' }, fx: 'heal', desc: 'Sleeps two turns to restore HP and cure status.' },
  blink: { name: 'BLINK', type: 'MIND', power: 0, acc: 0, pp: 20, effect: { kind: 'escape' }, fx: 'none', desc: 'Vanishes from a wild battle.' },
  dreamSip: { name: 'DREAM SIP', type: 'MIND', power: 100, acc: 100, pp: 15, effect: { kind: 'dreamSip' }, fx: 'drain', desc: 'Drinks a sleeping foe\'s dreams to heal.' },

  // ─── BUG ────────────────────────────────────────────────
  silkSnare: { name: 'SILK SNARE', type: 'BUG', power: 0, acc: 95, pp: 40, effect: { kind: 'stage', who: 'foe', stat: 'spd', n: -1 }, fx: 'spiral', desc: 'Sticky silk that lowers SPEED.' },
  twinSting: { name: 'TWIN STING', type: 'BUG', power: 25, acc: 100, pp: 20, multi: 2, effect: { kind: 'status', status: 'psn' }, chance: 20, fx: 'needle', desc: 'Stings twice. May poison.' },
  needleRain: { name: 'NEEDLE RAIN', type: 'BUG', power: 20, acc: 85, pp: 20, multi: [2, 5], fx: 'rain', desc: 'Fires 2 to 5 needles.' },
  leechBite: { name: 'LEECH BITE', type: 'BUG', power: 40, acc: 100, pp: 15, drain: 0.5, fx: 'drain', desc: 'Bites and drains HP.' },
  shear: { name: 'SHEAR', type: 'BUG', power: 80, acc: 100, pp: 15, fx: 'claw', desc: 'Slices with sharp mandibles.' },
  bugRush: { name: 'BUG RUSH', type: 'BUG', power: 95, acc: 90, pp: 10, fx: 'hit', desc: 'A swarming charge.' },

  // ─── STONE ──────────────────────────────────────────────
  pelt: { name: 'PELT', type: 'STONE', power: 50, acc: 90, pp: 15, fx: 'rock', desc: 'Hurls small rocks.' },
  rockfall: { name: 'ROCKFALL', type: 'STONE', power: 75, acc: 90, pp: 10, effect: { kind: 'flinch' }, chance: 30, fx: 'rock', desc: 'Drops boulders. May make the foe flinch.' },
  cragSpike: { name: 'CRAG SPIKE', type: 'STONE', power: 100, acc: 80, pp: 5, highCrit: true, fx: 'rock', desc: 'Stabs with jagged stone. Often critical.' },

  // ─── SPOOK ──────────────────────────────────────────────
  coldLick: { name: 'COLD LICK', type: 'SPOOK', power: 30, acc: 100, pp: 30, effect: { kind: 'status', status: 'par' }, chance: 30, fx: 'shade', desc: 'A chilling lick. May paralyze.' },
  haunt: { name: 'HAUNT', type: 'SPOOK', power: 1, acc: 100, pp: 15, fixed: 'level', fx: 'shade', desc: 'Damage equal to the user\'s level.' },
  wispLight: { name: 'WISP LIGHT', type: 'SPOOK', power: 0, acc: 100, pp: 10, effect: { kind: 'confuse' }, fx: 'ball', desc: 'An eerie light that confuses.' },
  jinx: { name: 'JINX', type: 'SPOOK', power: 65, acc: 100, pp: 10, effect: { kind: 'jinx' }, fx: 'shade', desc: 'Twice as strong against a foe with a status.' },
  shadeBolt: { name: 'SHADE BOLT', type: 'SPOOK', power: 80, acc: 100, pp: 15, effect: { kind: 'stage', who: 'foe', stat: 'spc', n: -1 }, chance: 20, fx: 'ball', desc: 'A bolt of shadow. May lower SPECIAL.' },

  // ─── DRAKE ──────────────────────────────────────────────
  wyrmRage: { name: 'WYRM RAGE', type: 'DRAKE', power: 1, acc: 100, pp: 10, fixed: 40, fx: 'flame', desc: 'Always does 40 damage.' },
  drakeBreath: { name: 'DRAKE BREATH', type: 'DRAKE', power: 60, acc: 100, pp: 20, effect: { kind: 'status', status: 'par' }, chance: 30, fx: 'flame', desc: 'A gust of drake breath. May paralyze.' },
  drakeClaw: { name: 'DRAKE CLAW', type: 'DRAKE', power: 80, acc: 100, pp: 15, fx: 'claw', desc: 'Rakes with great claws.' },
  drakeFury: { name: 'DRAKE FURY', type: 'DRAKE', power: 110, acc: 90, pp: 10, fx: 'blast', desc: 'An unstoppable rampage.' },
  drakeDance: { name: 'DRAKE DANCE', type: 'DRAKE', power: 0, acc: 0, pp: 20, effect: { kind: 'stages', stats: ['atk', 'spd'], n: 1 }, fx: 'up', desc: 'Raises ATTACK and SPEED.' },
})

export type MoveId = keyof typeof RAW

export const MOVES: Readonly<Record<MoveId, MoveData>> = Object.fromEntries(
  Object.entries(RAW).map(([id, m]) => [id, { id, ...m }]),
) as Record<MoveId, MoveData>

export const MOVE_IDS = Object.keys(RAW) as MoveId[]

export function move(id: MoveId): MoveData {
  const m = MOVES[id]
  if (!m) throw new Error(`unknown move ${id}`)
  return m
}

export function isMoveId(id: string): id is MoveId {
  return id in RAW
}

/** Used when a critter has no PP left in any move. */
export const STRUGGLE: MoveId = 'strain'

/** Moves that work outside battle, and what they do there. */
export const FIELD_MOVES = {
  chop: 'Cuts down thorn bushes.',
  paddle: 'Swims you across water.',
  heave: 'Shoves heavy boulders.',
  glow: 'Lights up dark caves.',
  soar: 'Flies you to a town you have visited.',
} as const satisfies Partial<Record<MoveId, string>>

export type FieldMoveId = keyof typeof FIELD_MOVES

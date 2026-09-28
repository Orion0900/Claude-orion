import type { StageDef } from '../game/types'

/**
 * The three stages of a run. Each is a fresh map with its own palette,
 * roster and boss; weapons, tomes, items and level carry over.
 * Timers follow the original: 10, 9 and 8 minutes before the final swarm.
 */
export const STAGES: readonly StageDef[] = [
  {
    index: 0,
    name: 'Greenwood',
    subtitle: 'Stage 1 — rolling hills and old trees',
    duration: 600,
    palette: {
      sky: '#8fd3ff',
      fog: '#a9dcf5',
      fogNear: 45,
      fogFar: 150,
      groundLow: '#4f9e3f',
      groundHigh: '#9ccc58',
      cliff: '#7d6b52',
      sun: '#fff1d0',
      sunIntensity: 2.4,
      ambient: '#bfe3ff',
      ambientIntensity: 1.1,
      accent: '#ffd23f',
    },
    terrain: { amplitude: 7, frequency: 0.018, octaves: 4, seed: 101, plateau: 0.25 },
    props: [
      { kind: 'pine', count: 150, solid: true },
      { kind: 'oak', count: 80, solid: true },
      { kind: 'rock', count: 70, solid: true },
      { kind: 'bush', count: 140, solid: false },
      { kind: 'flower', count: 260, solid: false },
      { kind: 'mushroom', count: 60, solid: false },
    ],
    roster: ['sprout', 'goblin', 'bat', 'shroom', 'boar', 'treant'],
    bossId: 'barkzilla',
    enemyScale: 1,
  },
  {
    index: 1,
    name: 'Sunscorch Dunes',
    subtitle: 'Stage 2 — sand, ruins and things under it',
    duration: 540,
    palette: {
      sky: '#ffd9a0',
      fog: '#f5c98f',
      fogNear: 40,
      fogFar: 140,
      groundLow: '#d9a95e',
      groundHigh: '#f2d49a',
      cliff: '#b9794a',
      sun: '#fff0c8',
      sunIntensity: 2.8,
      ambient: '#ffe2b5',
      ambientIntensity: 1.0,
      accent: '#ff8a3d',
    },
    terrain: { amplitude: 9, frequency: 0.014, octaves: 3, seed: 202, plateau: 0.1 },
    props: [
      { kind: 'cactus', count: 120, solid: true },
      { kind: 'pillar', count: 50, solid: true },
      { kind: 'rock', count: 90, solid: true },
      { kind: 'bones', count: 60, solid: false },
      { kind: 'tumbleweed', count: 40, solid: false },
      { kind: 'palm', count: 40, solid: true },
    ],
    roster: ['scarab', 'mummy', 'vulture', 'scorpion', 'cactoid', 'sand_golem'],
    bossId: 'jackal_pharaoh',
    enemyScale: 2.2,
  },
  {
    index: 2,
    name: 'Hollow Crypt',
    subtitle: 'Stage 3 — a graveyard that stays awake',
    duration: 480,
    palette: {
      sky: '#241d45',
      fog: '#35295c',
      fogNear: 30,
      fogFar: 115,
      groundLow: '#3f5243',
      groundHigh: '#6b7d5c',
      cliff: '#4a4458',
      sun: '#b9c8ff',
      sunIntensity: 1.6,
      ambient: '#6f63b8',
      ambientIntensity: 1.0,
      accent: '#9dff6a',
    },
    terrain: { amplitude: 6, frequency: 0.022, octaves: 4, seed: 303, plateau: 0.35 },
    props: [
      { kind: 'tombstone', count: 170, solid: true },
      { kind: 'deadtree', count: 90, solid: true },
      { kind: 'crypt', count: 14, solid: true },
      { kind: 'rock', count: 50, solid: true },
      { kind: 'candle', count: 90, solid: false },
      { kind: 'pumpkin', count: 50, solid: false },
    ],
    roster: ['skeleton', 'ghoul', 'wisp', 'pumpkin_bomb', 'gargoyle', 'crypt_knight'],
    bossId: 'grave_warden',
    enemyScale: 4.5,
  },
]

/** Minibosses by stage, spawned by the director at set times. */
export const MINIBOSSES: readonly string[] = ['stone_golem', 'scorpion_king', 'bone_colossus']

/** The final-swarm enemy; stronger variants are the same def scaled by time. */
export const SWARM_ENEMY = 'ghost'

/**
 * How each prop kind is scattered and how it behaves. The models live in
 * `models.ts`; the stage lists which kinds appear, how many, and whether
 * they are solid (`StageDef.props`).
 */
export interface PropSpec {
  /** Collision / keep-out radius at scale 1, metres. */
  radius: number
  scale: readonly [number, number]
  /** Steepest ground it may stand on, degrees. */
  maxSlope: number
  /** 0 spreads evenly; 1 only grows where the clump noise is high (forests, flower beds, ruins). */
  clump: number
  /** Kinds with the same field share clumps, so pines and oaks make mixed woods. */
  field: 'forest' | 'meadow' | 'stone' | 'ruin' | 'own'
  /** Minimum centre distance between two of this kind, at scale 1. */
  spacing: number
  /** Distance kept from the player start. */
  startClear: number
  /** How far the base sinks into the ground, metres at scale 1. */
  sink: number
  /** Largest random lean, radians. */
  lean: number
  variants: number
  castShadow: boolean
  /** Wind sway for the vertex shader: sideways metres ≈ sway × height² (0 = rigid). */
  sway: number
  /** Tint each instance toward the stage's cliff colour (rocks match the terrain). */
  tint?: 'cliff'
  /** Emissive colour of the model's glowing part (candle flames, pumpkin faces). */
  glow?: string
  /** Graves stand in neat rows. */
  layout?: 'rows'
  /** A few are set in a ring around the start to light the way. */
  startRing?: { count: number; min: number; max: number }
}

const base: PropSpec = {
  radius: 0.5,
  scale: [0.85, 1.2],
  maxSlope: 30,
  clump: 0.3,
  field: 'own',
  spacing: 0,
  startClear: 14,
  sink: 0.1,
  lean: 0,
  variants: 1,
  castShadow: true,
  sway: 0,
}

export const PROP_SPECS: Record<string, PropSpec> = {
  pine: { ...base, radius: 0.55, scale: [0.8, 1.35], maxSlope: 32, clump: 0.8, field: 'forest', spacing: 2.4, variants: 2, sway: 0.004 },
  oak: { ...base, radius: 0.6, scale: [0.85, 1.3], clump: 0.7, field: 'forest', spacing: 4.5, variants: 2, sway: 0.004 },
  rock: { ...base, radius: 1.1, scale: [0.6, 1.7], maxSlope: 40, clump: 0.35, field: 'stone', spacing: 1, sink: 0.25, lean: 0.3, variants: 2, tint: 'cliff' },
  bush: { ...base, radius: 0.7, scale: [0.7, 1.3], maxSlope: 35, clump: 0.55, field: 'forest', startClear: 7, variants: 1, sway: 0.03 },
  flower: { ...base, radius: 0.3, scale: [0.8, 1.4], clump: 0.85, field: 'meadow', startClear: 4, variants: 3, castShadow: false, sway: 0.3 },
  mushroom: { ...base, radius: 0.35, scale: [0.8, 1.5], clump: 0.75, field: 'forest', startClear: 6, variants: 2, castShadow: false },
  cactus: { ...base, radius: 0.45, scale: [0.8, 1.3], clump: 0.25, spacing: 3, variants: 2 },
  pillar: { ...base, radius: 0.75, scale: [0.9, 1.25], maxSlope: 20, clump: 0.9, field: 'ruin', spacing: 3.5, sink: 0.2, variants: 2 },
  bones: { ...base, radius: 0.6, scale: [0.8, 1.4], clump: 0.3, field: 'ruin', startClear: 8, lean: 0.15, variants: 2, castShadow: false },
  tumbleweed: { ...base, radius: 0.6, scale: [0.8, 1.3], clump: 0, startClear: 10, sink: 0 },
  palm: { ...base, radius: 0.4, scale: [0.85, 1.25], clump: 0.7, field: 'forest', spacing: 3, sway: 0.006 },
  tombstone: { ...base, radius: 0.5, scale: [0.85, 1.2], maxSlope: 25, spacing: 1.6, lean: 0.12, variants: 3, layout: 'rows' },
  deadtree: { ...base, radius: 0.45, scale: [0.8, 1.4], clump: 0.5, field: 'forest', spacing: 3, lean: 0.1, variants: 2 },
  crypt: { ...base, radius: 3.3, scale: [0.9, 1.1], maxSlope: 14, clump: 0, spacing: 24, startClear: 24, sink: 0.35, glow: '#9dff6a' },
  candle: {
    ...base,
    radius: 0.3,
    scale: [1, 1.6],
    clump: 0.5,
    field: 'ruin',
    startClear: 8,
    castShadow: false,
    glow: '#ffc05a',
    startRing: { count: 8, min: 12.5, max: 15 },
  },
  pumpkin: { ...base, radius: 0.5, scale: [0.8, 1.4], clump: 0.4, field: 'meadow', startClear: 8, glow: '#ff9d2e' },
}

/** Kinds a stage names that we have no spec for still scatter, as plain rocks. */
export function propSpec(kind: string): PropSpec {
  return PROP_SPECS[kind] ?? PROP_SPECS.rock
}

import type { Vec2 } from '../types'

export type GroupId = 'proportions' | 'eyes' | 'nose' | 'lips' | 'jaw' | 'symmetry' | 'profile'

export type Tone = 'accent' | 'ideal' | 'muted' | 'white' | 'good' | 'warn' | 'bad'

/** Drawing instructions over a photo, in the photo's upright pixel space. */
export type Shape =
  | { t: 'line'; a: Vec2; b: Vec2; tone?: Tone; dash?: boolean; w?: number }
  | { t: 'poly'; pts: Vec2[]; closed?: boolean; tone?: Tone; dash?: boolean; fill?: boolean; w?: number }
  | { t: 'dot'; p: Vec2; tone?: Tone; r?: number }
  | { t: 'label'; p: Vec2; text: string; tone?: Tone; anchor?: 'start' | 'middle' | 'end'; size?: number }
  /** An angle marker at `c` sweeping from the ray towards `a` to the ray towards `b`. */
  | { t: 'arc'; c: Vec2; a: Vec2; b: Vec2; r: number; tone?: Tone; text?: string }
  /** A dimension line from a to b with end ticks and an optional label beside it. */
  | { t: 'span'; a: Vec2; b: Vec2; tone?: Tone; text?: string; side?: 1 | -1 }

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Overlay {
  box: Box
  shapes: Shape[]
}

/** How far a measurement sits from its ideal range. */
export type Band = 'ideal' | 'near' | 'moderate' | 'notable'

export interface Range {
  lo: number
  hi: number
}

export interface MetricResult {
  id: string
  group: GroupId
  /** The number the verdict is about. */
  value: number
  /** The value as shown, e.g. "+5.2°" or "32 · 31 · 37%". */
  display: string
  /** The ideal range for the chosen comparison, in the value's units; absent for descriptive measures. */
  ideal?: Range
  idealDisplay?: string
  /** The extent of the gauge drawn under the value. */
  gauge?: Range
  /** 0–10; absent for descriptive measures, which describe rather than grade. */
  score?: number
  band?: Band
  /** Which way it misses the ideal: −1 under, 1 over, 0 within. */
  dir?: -1 | 0 | 1
  /**
   * Picks the words and advice for this result, e.g. "lower-long" for thirds
   * whose lower third runs long. Content is keyed on `${id}:${key}`.
   */
  key: string
  /** Supporting numbers: per-side values, millimetres. */
  details: { label: string; value: string }[]
  overlay: Overlay
  weight: number
  /** Set when the photo makes this measurement less trustworthy, saying why. */
  caveat?: string
}

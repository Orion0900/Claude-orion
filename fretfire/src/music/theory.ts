/** Scales, degrees and pitches for the built-in songs. */

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
} as const

export type ScaleName = keyof typeof SCALES

/** MIDI note of a 1-based scale degree; degrees past 7 climb into the next octave. */
export function degreeToMidi(root: number, scale: readonly number[], degree: number, accidental = 0): number {
  const d = degree - 1
  const octave = Math.floor(d / 7)
  const index = ((d % 7) + 7) % 7
  return root + scale[index] + 12 * octave + accidental
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii']

/**
 * A chord symbol as a scale degree: `i`, `VI`, `bVII`, `#iv`. Case (major or
 * minor) is ignored, since the parts built from it are power chords and roots.
 */
export function parseRoman(symbol: string): { degree: number; accidental: number } {
  const match = /^([b#]?)([ivIV]+)$/.exec(symbol.trim())
  if (!match) throw new Error(`Unknown chord symbol "${symbol}"`)
  const degree = ROMAN.indexOf(match[2].toLowerCase()) + 1
  if (degree < 1) throw new Error(`Unknown chord symbol "${symbol}"`)
  return { degree, accidental: match[1] === 'b' ? -1 : match[1] === '#' ? 1 : 0 }
}

/** Moves a MIDI note by octaves until it sits in [low, low + 12). */
export function placeInOctave(midi: number, low: number): number {
  let m = midi
  while (m < low) m += 12
  while (m >= low + 12) m -= 12
  return m
}

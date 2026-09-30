import { degreeToMidi } from './theory'
import type { LeadNote } from './types'

/**
 * Lead notation: whitespace-separated steps on a grid.
 *
 *   8:          every following step is an eighth note (also 4: 12: 16: 24: 32:)
 *   5  b3  1'   a scale degree, with an optional flat/sharp and octave marks (' up, , down)
 *   P1          a power chord on that degree (root, fifth, octave)
 *   -           holds the previous note one more step
 *   .           rest
 *   |           bar line; must land on a bar boundary, which catches miscounted bars
 *
 * Positions are counted in 1/192 beats so triplets never drift.
 */

export const TICKS_PER_BEAT = 192

const STEP_TICKS: Record<string, number> = { '4': 192, '8': 96, '12': 64, '16': 48, '24': 32, '32': 24 }

export interface NotationOptions {
  /** MIDI note of degree 1. */
  root: number
  scale: readonly number[]
  beatsPerBar: number
  /** Beat at which the first step starts. */
  startBeat: number
}

export function parseLead(src: string, options: NotationOptions): { notes: LeadNote[]; beats: number } {
  const notes: LeadNote[] = []
  const barTicks = options.beatsPerBar * TICKS_PER_BEAT
  let step = STEP_TICKS['8']
  let pos = 0
  let last: { note: LeadNote; ticks: number } | null = null

  for (const token of src.trim().split(/\s+/)) {
    if (!token) continue
    const grid = /^(\d+):$/.exec(token)
    if (grid) {
      const ticks = STEP_TICKS[grid[1]]
      if (!ticks) throw new Error(`Unknown grid "${token}" in lead "${src}"`)
      step = ticks
      continue
    }
    if (token === '|') {
      if (pos % barTicks !== 0) {
        throw new Error(`Bar line at beat ${pos / TICKS_PER_BEAT} is not on a bar boundary in lead "${src}"`)
      }
      continue
    }
    if (token === '.') {
      pos += step
      last = null
      continue
    }
    if (token === '-') {
      if (last) {
        last.ticks += step
        last.note.length = last.ticks / TICKS_PER_BEAT
      }
      pos += step
      continue
    }
    const match = /^(P?)([b#]?)([1-7])([',]*)$/.exec(token)
    if (!match) throw new Error(`Unknown token "${token}" in lead "${src}"`)
    const accidental = match[2] === 'b' ? -1 : match[2] === '#' ? 1 : 0
    let octave = 0
    for (const mark of match[4]) octave += mark === ',' ? -1 : 1
    const pitch = degreeToMidi(options.root, options.scale, Number(match[3]), accidental) + 12 * octave
    const power = match[1] === 'P'
    const note: LeadNote = {
      beat: options.startBeat + pos / TICKS_PER_BEAT,
      length: step / TICKS_PER_BEAT,
      pitches: power ? [pitch, pitch + 7, pitch + 12] : [pitch],
      power,
    }
    notes.push(note)
    last = { note, ticks: step }
    pos += step
  }
  return { notes, beats: pos / TICKS_PER_BEAT }
}

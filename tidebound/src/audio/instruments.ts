/**
 * The chip's instruments. Pure data: the synth in synth.ts plays them.
 *
 * The handheld had two pulse channels with a choice of duty cycle (12.5%
 * is thin and reedy, 25% the classic lead, 50% a round square), a wave
 * channel that loops 32 four-bit samples (bass, organ) and a noise channel.
 * Every patch picks one of those waveforms and adds an envelope, and the
 * leads a delayed vibrato, the way handheld sound drivers did.
 *
 * Levels are balanced by loudness, not peak: WebAudio scales every wave to
 * the same peak, so a 50% square carries about two and a half times the
 * energy of a 12.5% pulse and its patches sit lower to match.
 */

export type WaveShape =
  | 'pulse12'
  | 'pulse25'
  | 'pulse50'
  /** Four-bit wave-channel tables. */
  | 'tri'
  | 'saw'
  | 'soft'
  | 'organ'
  | 'noise'

export interface Vibrato {
  /** Seconds before the wobble starts, so short notes stay clean. */
  delay: number
  /** Cents either side. */
  depth: number
  /** Hz. */
  rate: number
}

export interface Patch {
  wave: WaveShape
  /** Peak gain at full velocity. */
  level: number
  /** Seconds to reach the peak. */
  attack: number
  /** Seconds (roughly) to fall from the peak to the sustain level. */
  decay: number
  /** Sustain as a share of the peak; 0 makes a pluck that dies away. */
  sustain: number
  /** Seconds (roughly) to fade once the gate closes. */
  release: number
  /** Default share of each note's length that sounds (the q command overrides). */
  gate: number
  vibrato?: Vibrato
  /** Seconds per step of an {arp} note. */
  arpStep?: number
  /** Cents the note scoops up from as it starts, like a horn. */
  scoop?: number
}

const LEAD_VIBRATO: Vibrato = { delay: 0.22, depth: 14, rate: 5.6 }

export const PATCHES: Readonly<Record<string, Patch>> = {
  /** The main melody voice: 25% pulse with a delayed vibrato. */
  lead: { wave: 'pulse25', level: 0.15, attack: 0.006, decay: 0.35, sustain: 0.72, release: 0.06, gate: 0.9, vibrato: LEAD_VIBRATO },
  /** A rounder square lead. */
  lead50: { wave: 'pulse50', level: 0.09, attack: 0.006, decay: 0.35, sustain: 0.72, release: 0.06, gate: 0.9, vibrato: LEAD_VIBRATO },
  /** A thin, reedy lead. */
  lead12: { wave: 'pulse12', level: 0.19, attack: 0.006, decay: 0.35, sustain: 0.7, release: 0.06, gate: 0.9, vibrato: LEAD_VIBRATO },
  /** Soft sustained harmony and pads. */
  soft: { wave: 'pulse50', level: 0.05, attack: 0.03, decay: 0.5, sustain: 0.8, release: 0.12, gate: 0.95, vibrato: { delay: 0.3, depth: 9, rate: 5 } },
  /** A quiet thin harmony line under the lead. */
  harm: { wave: 'pulse12', level: 0.1, attack: 0.008, decay: 0.4, sustain: 0.7, release: 0.07, gate: 0.9, vibrato: { delay: 0.25, depth: 10, rate: 5.6 } },
  /** Plucked strings: the ukulele arps. */
  pluck: { wave: 'pulse25', level: 0.12, attack: 0.002, decay: 0.2, sustain: 0, release: 0.06, gate: 1 },
  /** A thinner, brighter pluck. */
  pluck12: { wave: 'pulse12', level: 0.16, attack: 0.002, decay: 0.24, sustain: 0, release: 0.05, gate: 1 },
  /** Glockenspiel-ish: struck and ringing. */
  bell: { wave: 'pulse12', level: 0.16, attack: 0.002, decay: 0.7, sustain: 0, release: 0.35, gate: 1 },
  /** Fanfare horns: a little scoop and a steady tone. */
  brass: { wave: 'pulse25', level: 0.15, attack: 0.015, decay: 0.25, sustain: 0.85, release: 0.07, gate: 0.92, scoop: 45, vibrato: { delay: 0.18, depth: 12, rate: 6 } },
  /** Short punchy chords and stabs. */
  stab: { wave: 'pulse50', level: 0.08, attack: 0.002, decay: 0.12, sustain: 0.25, release: 0.04, gate: 0.7 },
  /** Fast-arpeggio chip chords ({arp} notes). */
  chord: { wave: 'pulse12', level: 0.085, attack: 0.004, decay: 0.4, sustain: 0.6, release: 0.08, gate: 0.92, arpStep: 1 / 45 },
  /** The wave channel's bass: a stepped triangle. */
  bass: { wave: 'tri', level: 0.25, attack: 0.004, decay: 0.6, sustain: 0.85, release: 0.035, gate: 0.86 },
  /** A buzzier, punchier bass for battles. */
  bassHard: { wave: 'saw', level: 0.16, attack: 0.003, decay: 0.3, sustain: 0.7, release: 0.03, gate: 0.8 },
  /** A round, almost-sine bass for quiet places. */
  bassSoft: { wave: 'soft', level: 0.27, attack: 0.01, decay: 0.7, sustain: 0.85, release: 0.06, gate: 0.9 },
  /** Wave-channel organ for stately moments. */
  organ: { wave: 'organ', level: 0.16, attack: 0.02, decay: 1, sustain: 0.9, release: 0.1, gate: 0.95, vibrato: { delay: 0.35, depth: 6, rate: 5 } },
  /** The noise channel's drum kit; `level` scales every drum. */
  kit: { wave: 'noise', level: 0.9, attack: 0, decay: 0, sustain: 0, release: 0, gate: 1 },
  /** A lighter touch for quiet songs. */
  softkit: { wave: 'noise', level: 0.55, attack: 0, decay: 0, sustain: 0, release: 0, gate: 1 },
}

export function isPatch(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(PATCHES, name)
}

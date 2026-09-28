import { midiToFreq, type NoteEvent } from './sequencer'
import type { Synth } from './synth'

/** Where music voices go: `dry` straight to the mix, `echo` also into the delay. */
export interface MusicBuses {
  dry: AudioNode
  echo: AudioNode
}

/**
 * The chiptune band: noise-and-sine drums, a square-plus-triangle bass and
 * pulse-wave lead, harmony and arpeggio (the melodic parts get the echo).
 * `step` is the length of one sixteenth in seconds.
 */
export function playNote(s: Synth, e: NoteEvent, t: number, step: number, bus: MusicBuses): void {
  const v = e.vel
  switch (e.ch) {
    case 'kick':
      s.tone(bus.dry, t, { wave: 'sine', freq: 150, to: 45, glide: 0.08, dur: 0.26, gain: 0.7 * v })
      s.noise(bus.dry, t, { dur: 0.012, gain: 0.1 * v, filter: { type: 'highpass', freq: 3000 } })
      return
    case 'snare':
      s.noise(bus.dry, t, { dur: 0.14, gain: 0.28 * v, filter: { type: 'highpass', freq: 1400 } })
      s.tone(bus.dry, t, { wave: 'triangle', freq: 230, to: 160, dur: 0.08, gain: 0.2 * v })
      return
    case 'hat':
      s.noise(bus.dry, t, { dur: 0.035, gain: 0.07 * v, filter: { type: 'highpass', freq: 7500 } })
      return
    case 'openHat':
      s.noise(bus.dry, t, { dur: 0.16, gain: 0.065 * v, filter: { type: 'highpass', freq: 6500 } })
      return
    case 'crash':
      s.noise(bus.dry, t, { dur: 1.1, gain: 0.1 * v, filter: { type: 'highpass', freq: 4500 } })
      return
    case 'bass': {
      const freq = midiToFreq(e.note)
      const dur = e.len * step * 0.92
      s.tone(bus.dry, t, { wave: 'square', freq, dur, hold: dur * 0.55, gain: 0.1 * v, filter: { type: 'lowpass', freq: 750, q: 2 } })
      s.tone(bus.dry, t, { wave: 'triangle', freq, dur, hold: dur * 0.55, gain: 0.2 * v })
      return
    }
    case 'arp': {
      // Stage arps are one-step plucks; the title hook's longer notes sing a moment, then ring out.
      const dur = e.len * step * 0.9
      s.tone(bus.echo, t, { wave: 'pulse12', freq: midiToFreq(e.note), dur, hold: e.len > 1 ? step * 1.5 : 0, gain: 0.08 * v, filter: { type: 'lowpass', freq: 2600 } })
      return
    }
    case 'lead':
    case 'harmony': {
      const dur = e.len * step * 0.95
      s.tone(bus.echo, t, {
        wave: e.ch === 'lead' ? 'pulse25' : 'pulse12',
        freq: midiToFreq(e.note),
        dur,
        attack: 0.006,
        hold: dur * 0.6,
        gain: (e.ch === 'lead' ? 0.1 : 0.06) * v,
        vibrato: dur > 0.25 ? 12 : 0,
        vibratoRate: 5.5,
        filter: { type: 'lowpass', freq: 3400 },
      })
      return
    }
  }
}

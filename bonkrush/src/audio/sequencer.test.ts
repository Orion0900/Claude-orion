import {
  FINAL_TEMPO,
  LAYER,
  STEPS_PER_BAR,
  TITLE_SONG,
  degreeToMidi,
  eventsAt,
  hit,
  midiToFreq,
  smoothIntensity,
  songForStage,
  stepDuration,
  type Channel,
  type NoteEvent,
  type Song,
} from './sequencer'

function channelsOver(song: Song, intensity: number): Map<Channel, number> {
  const out: NoteEvent[] = []
  const counts = new Map<Channel, number>()
  for (let step = 0; step < song.bars * STEPS_PER_BAR; step++) {
    const n = eventsAt(song, step, intensity, out)
    for (let i = 0; i < n; i++) counts.set(out[i].ch, (counts.get(out[i].ch) ?? 0) + 1)
  }
  return counts
}

function total(counts: Map<Channel, number>): number {
  let sum = 0
  for (const v of counts.values()) sum += v
  return sum
}

describe('music theory helpers', () => {
  it('converts MIDI to Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440)
    expect(midiToFreq(81)).toBeCloseTo(880)
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1)
  })

  it('wraps scale degrees into octaves', () => {
    const major = [0, 2, 4, 5, 7, 9, 11]
    expect(degreeToMidi(60, major, 0)).toBe(60)
    expect(degreeToMidi(60, major, 2)).toBe(64)
    expect(degreeToMidi(60, major, 7)).toBe(72)
    expect(degreeToMidi(60, major, -1)).toBe(59)
    expect(degreeToMidi(60, major, -7)).toBe(48)
  })

  it('reads drum pattern characters as velocities', () => {
    expect(hit('xo-.', 0)).toBe(1)
    expect(hit('xo-.', 1)).toBeCloseTo(0.65)
    expect(hit('xo-.', 2)).toBeCloseTo(0.35)
    expect(hit('xo-.', 3)).toBe(0)
    expect(hit('xo-.', 4)).toBe(1)
  })
})

describe('songForStage', () => {
  it('is deterministic', () => {
    expect(songForStage(1)).toEqual(songForStage(1))
  })

  it('gives every stage its own key, tempo and melody', () => {
    const songs = [0, 1, 2].map(songForStage)
    expect(new Set(songs.map((s) => s.root)).size).toBe(3)
    expect(new Set(songs.map((s) => s.bpm)).size).toBe(3)
    expect(songs[0].calm.lead).not.toEqual(songs[1].calm.lead)
  })

  it('survives odd stage indices', () => {
    for (const i of [-2, -0.5, 3, 7, Number.NaN, -Infinity]) {
      const song = songForStage(i)
      expect(song.bars).toBeGreaterThan(0)
      expect(song.calm.lead).toHaveLength(song.bars)
      expect(song.title).toBe(false)
    }
    // Only the title index is special; other negatives still play the first stage.
    expect(songForStage(-2)).toEqual(songForStage(0))
  })

  it('keeps every lead note in key, in range and inside its bar', () => {
    for (let stage = 0; stage < 5; stage++) {
      const song = songForStage(stage)
      for (const section of [song.calm, song.final]) {
        expect(section.lead).toHaveLength(song.bars)
        for (const bar of section.lead) {
          expect(bar.length).toBeGreaterThan(0)
          for (const note of bar) {
            const midi = degreeToMidi(song.root, song.scale, note.degree)
            expect(song.scale).toContain((((midi - song.root) % 12) + 12) % 12)
            expect(midi).toBeGreaterThanOrEqual(song.root - 4)
            expect(midi).toBeLessThanOrEqual(song.root + 17)
            expect(note.len).toBeGreaterThan(0)
            expect(note.step + note.len).toBeLessThanOrEqual(STEPS_PER_BAR)
          }
        }
      }
    }
  })

  it('ends the melody on the tonic', () => {
    for (let stage = 0; stage < 3; stage++) {
      const lead = songForStage(stage).calm.lead
      const last = lead[lead.length - 1]
      expect([0, 7]).toContain(last[last.length - 1].degree)
    }
  })
})

describe('eventsAt', () => {
  const song = songForStage(0)

  it('starts calm: kick, bass and arp, but no snare or lead', () => {
    const counts = channelsOver(song, 0)
    expect(counts.get('kick')).toBeGreaterThan(0)
    expect(counts.get('bass')).toBeGreaterThan(0)
    expect(counts.get('arp')).toBeGreaterThan(0)
    expect(counts.has('snare')).toBe(false)
    expect(counts.has('lead')).toBe(false)
    expect(counts.has('hat')).toBe(false)
  })

  it('grows busier with intensity', () => {
    let previous = 0
    for (const level of [0, LAYER.beat, LAYER.lead, LAYER.drive, 1]) {
      const n = total(channelsOver(song, level))
      expect(n).toBeGreaterThan(previous)
      previous = n
    }
    expect(channelsOver(song, LAYER.lead).get('lead')).toBeGreaterThan(0)
  })

  it('saves crashes, open hats and harmony for the final swarm', () => {
    const drive = channelsOver(song, 0.9)
    const final = channelsOver(song, 1)
    for (const ch of ['crash', 'openHat', 'harmony'] as const) {
      expect(drive.has(ch)).toBe(false)
      expect(final.get(ch)).toBeGreaterThan(0)
    }
  })

  it('switches progression in the final swarm', () => {
    const out: NoteEvent[] = []
    const bassAt = (level: number, bar: number) => {
      const n = eventsAt(song, bar * STEPS_PER_BAR, level, out)
      for (let i = 0; i < n; i++) if (out[i].ch === 'bass') return out[i].note
      return -1
    }
    const calm = [0, 1, 2, 3].map((bar) => bassAt(0, bar))
    const final = [0, 1, 2, 3].map((bar) => bassAt(1, bar))
    expect(final).not.toEqual(calm)
  })

  it('loops and tolerates any step or intensity', () => {
    const out: NoteEvent[] = []
    const loop = song.bars * STEPS_PER_BAR
    const a = eventsAt(song, 5, 0.5, out)
    const first = out.slice(0, a).map((e) => ({ ...e }))
    const b = eventsAt(song, 5 + loop * 3, 0.5, out)
    expect(out.slice(0, b)).toEqual(first)
    for (const [step, level] of [
      [-3, 0.5],
      [10, Number.NaN],
      [10, 7],
    ]) {
      const n = eventsAt(song, step, level, out)
      for (let i = 0; i < n; i++) {
        expect(Number.isFinite(out[i].note)).toBe(true)
        expect(out[i].vel).toBeGreaterThan(0)
        expect(out[i].vel).toBeLessThanOrEqual(1)
        expect(out[i].len).toBeGreaterThan(0)
      }
    }
  })

  it('reuses the event objects it is given', () => {
    const out: NoteEvent[] = []
    eventsAt(song, 0, 1, out)
    const first = out[0]
    eventsAt(song, 1, 1, out)
    expect(out[0]).toBe(first)
  })
})

describe('tempo and intensity', () => {
  it('speeds up for the final swarm', () => {
    const song = songForStage(2)
    expect(stepDuration(song, 0)).toBeCloseTo(60 / song.bpm / 4)
    expect(stepDuration(song, 1)).toBeCloseTo(stepDuration(song, 0) / FINAL_TEMPO)
  })

  it('swells slowly, falls slower and snaps to the final swarm', () => {
    expect(smoothIntensity(0, 0.5, 0.5)).toBeCloseTo(0.2)
    expect(smoothIntensity(0.5, 0, 0.5)).toBeCloseTo(0.375)
    let level = 0.6
    for (let i = 0; i < 20; i++) level = smoothIntensity(level, 1, 1 / 60)
    expect(level).toBeCloseTo(1)
  })

  it('never overshoots or breaks on bad input', () => {
    expect(smoothIntensity(0.49, 0.5, 1)).toBe(0.5)
    expect(smoothIntensity(0.3, Number.NaN, 1)).toBe(0.3)
    expect(smoothIntensity(0.3, 5, 0)).toBe(0.3)
    expect(smoothIntensity(0.99, 5, 1)).toBe(1)
  })
})

describe('title theme', () => {
  const title = songForStage(TITLE_SONG)
  const stages = [0, 1, 2].map(songForStage)

  it('is its own song rather than the first stage clamped', () => {
    expect(TITLE_SONG).toBe(-1)
    expect(title.title).toBe(true)
    expect(songForStage(-1)).toEqual(title)
    for (const stage of stages) {
      expect(stage.title).toBe(false)
      expect(title.root % 12).not.toBe(stage.root % 12)
      // Calmer: slower than every stage.
      expect(title.bpm).toBeLessThan(stage.bpm)
      expect(title.calm.lead).not.toEqual(stage.calm.lead)
    }
  })

  it('plays only arp, bass and light drums', () => {
    const counts = channelsOver(title, 0)
    expect([...counts.keys()].sort()).toEqual(['arp', 'bass', 'hat', 'kick', 'snare'])
    const out: NoteEvent[] = []
    for (let step = 0; step < title.bars * STEPS_PER_BAR; step++) {
      const n = eventsAt(title, step, 0, out)
      for (let i = 0; i < n; i++) {
        const e = out[i]
        if (e.ch === 'kick' || e.ch === 'snare' || e.ch === 'hat') expect(e.vel).toBeLessThanOrEqual(0.5)
        if (e.ch === 'bass') expect(e.vel).toBeLessThan(0.8)
      }
    }
    // Sparser than a stage song even before its lead joins.
    expect(total(counts)).toBeLessThan(total(channelsOver(stages[0], LAYER.beat)))
  })

  it('ignores intensity, tempo included', () => {
    const snapshot = (level: number) => {
      const out: NoteEvent[] = []
      const all: NoteEvent[] = []
      for (let step = 0; step < title.bars * STEPS_PER_BAR; step++) {
        const n = eventsAt(title, step, level, out)
        for (let i = 0; i < n; i++) all.push({ ...out[i] })
      }
      return all
    }
    const calm = snapshot(0)
    for (const level of [LAYER.lead, LAYER.drive, 1, Number.NaN]) expect(snapshot(level)).toEqual(calm)
    expect(stepDuration(title, 1)).toBe(stepDuration(title, 0))
    expect(stepDuration(title, 0)).toBeCloseTo(60 / title.bpm / 4)
  })

  it('carries its hook on the arp, above and louder than the bounces', () => {
    const out: NoteEvent[] = []
    for (let bar = 0; bar < title.bars; bar++) {
      const hook = title.calm.lead[bar]
      expect(hook.length).toBeGreaterThan(1)
      const lowest = Math.min(...hook.map((h) => degreeToMidi(title.root, title.scale, h.degree)))
      for (let s = 0; s < STEPS_PER_BAR; s++) {
        const n = eventsAt(title, bar * STEPS_PER_BAR + s, 0, out)
        const arps = out.slice(0, n).filter((e) => e.ch === 'arp')
        const note = hook.find((h) => h.step === s)
        if (note) {
          expect(arps).toHaveLength(1)
          expect(arps[0].note).toBe(degreeToMidi(title.root, title.scale, note.degree))
          expect(arps[0].len).toBe(note.len)
        } else {
          for (const a of arps) {
            expect(a.len).toBe(1)
            expect(a.note).toBeLessThan(lowest)
            expect(a.vel).toBeLessThan(0.75)
          }
        }
      }
    }
  })

  it('keeps the hook in key, inside its bars and catchy', () => {
    const lead = title.calm.lead
    expect(lead).toHaveLength(title.bars)
    for (const bar of lead) {
      for (const note of bar) {
        const midi = degreeToMidi(title.root, title.scale, note.degree)
        expect(title.scale).toContain((((midi - title.root) % 12) + 12) % 12)
        expect(note.step + note.len).toBeLessThanOrEqual(STEPS_PER_BAR)
      }
    }
    // Every bar shares one rhythm, and the answer opens with the question's first bar.
    const rhythm = (bar: readonly { step: number }[]) => bar.map((n) => n.step)
    for (const bar of lead) expect(rhythm(bar)).toEqual(rhythm(lead[0]))
    expect(lead[title.bars / 2]).toEqual(lead[0])
    // The loop leans home: the last note sits a step from the first.
    const last = lead[lead.length - 1]
    expect(Math.abs(last[last.length - 1].degree - lead[0][0].degree)).toBe(1)
  })

  it('walks the bass down the progression and loops cleanly', () => {
    const out: NoteEvent[] = []
    const bassAt = (bar: number) => {
      const n = eventsAt(title, bar * STEPS_PER_BAR, 0, out)
      for (let i = 0; i < n; i++) if (out[i].ch === 'bass') return out[i].note
      return -1
    }
    const line = [0, 1, 2, 3].map(bassAt)
    expect(line[1]).toBeLessThan(line[0])
    expect(line[2]).toBeLessThan(line[1])
    expect(bassAt(title.bars)).toBe(line[0])
  })
})

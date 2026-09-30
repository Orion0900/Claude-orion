import { buildTrack, chartHopoThreshold, midiHopoThreshold, ticksInSpans, type RawTrack } from './builder'
import { TempoMap } from './tempo'
import { OPEN_BIT } from './types'

const RES = 192
const tempo = new TempoMap(RES, [{ tick: 0, bpm: 120 }])
const opts = { hopoThreshold: chartHopoThreshold(RES), sustainCutoff: 0 }
const build = (raw: RawTrack, o = opts) => buildTrack(raw, tempo, 'guitar', 'expert', o)
const gem = (tick: number, lane: number, length = 0) => ({ tick, lane, length })

describe('buildTrack', () => {
  it('groups gems on one tick into a chord and times them', () => {
    const track = build({ gems: [gem(192, 0), gem(192, 2), gem(384, 1)] })
    expect(track.notes).toHaveLength(2)
    expect(track.notes[0].mask).toBe(0b101)
    expect(track.notes[0].time).toBeCloseTo(0.5)
    expect(track.notes[0].beat).toBe(1)
    expect(track.notes[1].mask).toBe(0b10)
  })

  it('makes quick single notes on new frets natural HOPOs', () => {
    const track = build({ gems: [gem(0, 0), gem(48, 1), gem(96, 1), gem(144, 2), gem(336, 3)] })
    expect(track.notes.map((n) => n.kind)).toEqual(['strum', 'hopo', 'strum', 'hopo', 'strum'])
  })

  it('never makes chords, or notes inside the previous chord, natural HOPOs', () => {
    const track = build({ gems: [gem(0, 0), gem(0, 1), gem(48, 1), gem(96, 2), gem(96, 3), gem(144, 4)] })
    expect(track.notes.map((n) => n.kind)).toEqual(['strum', 'strum', 'strum', 'hopo'])
  })

  it('applies force flags and taps', () => {
    const forces = new Map([
      [48, 'flip' as const],
      [192, 'flip' as const],
      [400, 'hopo' as const],
    ])
    const track = build({
      gems: [gem(0, 0), gem(48, 1), gem(192, 2), gem(400, 2), gem(600, 3)],
      forces,
      taps: new Set([600]),
    })
    expect(track.notes.map((n) => n.kind)).toEqual(['strum', 'strum', 'hopo', 'hopo', 'tap'])
  })

  it('uses the MIDI threshold for .mid charts', () => {
    const res = 480
    const map = new TempoMap(res, [{ tick: 0, bpm: 120 }])
    const track = buildTrack({ gems: [gem(0, 0), gem(170, 1), gem(341, 2)] }, map, 'bass', 'hard', {
      hopoThreshold: midiHopoThreshold(res),
      sustainCutoff: 0,
    })
    expect(track.notes.map((n) => n.kind)).toEqual(['strum', 'hopo', 'strum'])
  })

  it('lets frets win over an open note on the same tick', () => {
    const track = build({ gems: [gem(0, 5, 192), gem(0, 2), gem(192, 5)] })
    expect(track.notes[0].mask).toBe(0b100)
    expect(track.notes[0].sustain[5]).toBe(0)
    expect(track.notes[1].mask).toBe(OPEN_BIT)
  })

  it('drops short sustains and trims ones that run into the next gem on their lane', () => {
    const track = build(
      { gems: [gem(0, 0, 40), gem(192, 1, 1000), gem(384, 1), gem(384, 3, 96)] },
      { hopoThreshold: 0, sustainCutoff: 64 },
    )
    const [a, b, c] = track.notes
    expect(a.sustain[0]).toBe(0)
    expect(b.sustainBeats[1]).toBeCloseTo((192 - 6) / 192)
    expect(b.sustain[1]).toBeCloseTo(((192 - 6) / 192) * 0.5)
    expect(c.sustainBeats[3]).toBeCloseTo(0.5)
    expect(c.sustain[1]).toBe(0)
  })

  it('keeps sustains that overlap other lanes', () => {
    const track = build({ gems: [gem(0, 0, 768), gem(192, 2), gem(384, 3)] })
    expect(track.notes[0].sustainBeats[0]).toBe(4)
  })

  it('marks star power phrases, their last notes, and solos', () => {
    const track = build({
      gems: [gem(0, 0), gem(192, 1), gem(384, 2), gem(576, 3), gem(768, 4)],
      starPhrases: [
        { tick: 150, length: 300 },
        { tick: 1000, length: 100 },
      ],
      solos: [{ tick: 500, length: 400 }],
    })
    expect(track.notes.map((n) => n.star)).toEqual([false, true, true, false, false])
    expect(track.notes.map((n) => n.starEnd)).toEqual([false, false, true, false, false])
    expect(track.notes.map((n) => n.solo)).toEqual([false, false, false, true, true])
    // The empty phrase at tick 1000 is dropped.
    expect(track.starPhrases).toHaveLength(1)
    expect(track.starPhrases[0].start).toBeCloseTo(150 / 384)
    expect(track.solos).toHaveLength(1)
  })

  it('skips garbage gems', () => {
    const track = build({ gems: [gem(-1, 0), gem(0, 9), gem(Number.NaN, 1), gem(10, 0)] })
    expect(track.notes).toHaveLength(1)
    expect(track.notes[0].tick).toBe(10)
  })
})

describe('ticksInSpans', () => {
  it('finds ticks inside spans, end exclusive', () => {
    const inside = ticksInSpans([0, 10, 20, 30, 40], [
      { tick: 10, length: 20 },
      { tick: 40, length: 0 },
    ])
    expect([...inside].sort((a, b) => a - b)).toEqual([10, 20, 40])
  })
})

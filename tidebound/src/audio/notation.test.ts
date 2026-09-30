import { accomp, nearest, parseChord } from './compose'
import { expandRepeats, lengthTicks, midiToFreq, NotationError, parseChannel, TPQ, WHOLE } from './notation'
import { compileSong, swingTick } from './song'

const BAR = WHOLE
const parse = (src: string, drums = false) => parseChannel(src, { barTicks: BAR, patch: 'lead', drums, where: 'test' })

describe('notation', () => {
  it('converts MIDI to Hz', () => {
    expect(midiToFreq(69)).toBeCloseTo(440)
    expect(midiToFreq(81)).toBeCloseTo(880)
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1)
  })

  it('reads lengths, dots and triplets', () => {
    expect(lengthTicks('4')).toBe(TPQ)
    expect(lengthTicks('8')).toBe(TPQ / 2)
    expect(lengthTicks('4.')).toBe(TPQ * 1.5)
    expect(lengthTicks('2..')).toBe(TPQ * 3.5)
    expect(lengthTicks('12')).toBe(TPQ / 3)
    expect(() => lengthTicks('7')).toThrow(NotationError)
  })

  it('parses notes, octaves, accidentals and default lengths', () => {
    const { events, ticks, bars } = parse('o4 l8 c d e f g a b >c |')
    expect(ticks).toBe(BAR)
    expect(bars).toBe(1)
    expect(events.map((e) => e.midi)).toEqual([60, 62, 64, 65, 67, 69, 71, 72])
    expect(events.map((e) => e.t)).toEqual([0, 24, 48, 72, 96, 120, 144, 168])
    const acc = parse('o5 c+4 d-4 e#4 <b4')
    expect(acc.events.map((e) => e.midi)).toEqual([73, 73, 77, 71])
  })

  it('handles rests, ties, legato and slides', () => {
    const tie = parse('o4 c4^8 r8 d2')
    expect(tie.events).toHaveLength(2)
    expect(tie.events[0].len).toBe(72)
    expect(tie.events[1].t).toBe(96)

    const legato = parse('o4 c4&e4 g4~>c4')
    expect(legato.events).toHaveLength(2)
    expect(legato.events[0].len).toBe(96)
    expect(legato.events[0].bends).toEqual([{ at: 48, midi: 64, glide: 0 }])
    expect(legato.events[1].bends?.[0].midi).toBe(72)
    expect(legato.events[1].bends?.[0].glide).toBeGreaterThan(0)

    // A tie to the same pitch just lengthens the note.
    const same = parse('o4 c2&c2')
    expect(same.events).toHaveLength(1)
    expect(same.events[0].bends).toBeNull()
  })

  it('reads volume, gate, accents, instruments and arpeggios', () => {
    const { events } = parse('v15 q4 c4 v9 C4 @bell e4{47} d4')
    expect(events[0].vel).toBe(1)
    expect(events[0].gate).toBe(0.5)
    expect(events[1].vel).toBeCloseTo((9 / 15) * 1.25)
    expect(events[2].patch).toBe('bell')
    expect(events[2].arp).toEqual([0, 4, 7])
    expect(events[0].patch).toBe('lead')
  })

  it('expands repeats, nested too', () => {
    expect(expandRepeats('[a b]3').trim().split(/\s+/)).toEqual(['a', 'b', 'a', 'b', 'a', 'b'])
    expect(expandRepeats('[[c]2 d]').replace(/\s+/g, '')).toBe('ccdccd')
    expect(parse('[c8 d8 e8 f8]2 |').events).toHaveLength(8)
    expect(() => expandRepeats('[c d')).toThrow(NotationError)
  })

  it('checks every bar line', () => {
    expect(() => parse('c4 d4 e4 | f4 g4 a4 b4 |')).toThrow(/bar 1/)
    expect(() => parse('c1 | c2')).toThrow(/last bar/)
    expect(parse('c1 | c1').bars).toBe(2)
  })

  it('parses drum letters on the noise channel', () => {
    const { events } = parse('l8 k h s h K o c r |', true)
    expect(events.map((e) => e.drum)).toEqual(['kick', 'hat', 'snare', 'hat', 'kick', 'open', 'crash'])
    expect(events[4].vel).toBeGreaterThan(events[0].vel)
    expect(() => parse('z4 r2.', true)).toThrow(NotationError)
  })

  it('rejects junk', () => {
    expect(() => parse('c4 ? c2.')).toThrow(NotationError)
    expect(() => parse('& c1')).toThrow(NotationError)
    expect(() => parse('v99 c1')).toThrow(NotationError)
  })
})

describe('chord accompaniment', () => {
  it('parses chord symbols', () => {
    expect(parseChord('Bm').tones).toEqual([0, 3, 7])
    expect(parseChord('F#7').root).toBe(6)
    expect(parseChord('D/F#').bass).toBe(6)
    expect(parseChord('Bbmaj7').root).toBe(10)
    expect(() => parseChord('H')).toThrow(NotationError)
  })

  it('voices near the centre', () => {
    expect(nearest(0, 60)).toBe(60)
    expect(nearest(7, 60)).toBe(55)
    expect(nearest(5, 60)).toBe(65)
  })

  it('writes bars of notation from a lead sheet', () => {
    const text = accomp('C Am,G', '0 1 2 1 0 1 2 1', { center: 60 })
    const { events, bars } = parse(text)
    expect(bars).toBe(2)
    expect(events.slice(0, 4).map((e) => e.midi)).toEqual([60, 64, 67, 64])
    // The second bar splits: A minor for four eighths, then G.
    expect(events.slice(8, 12).map((e) => e.midi)).toEqual([57, 60, 64, 60])
    expect(events.slice(12, 16).map((e) => e.midi)).toEqual([55, 59, 62, 59])
  })

  it('writes bass lines with fifths, octaves and approach notes', () => {
    const text = accomp('C G', 'R:4 F:4 O:4 N:4', { center: 40 })
    const midi = parse(text).events.map((e) => e.midi)
    expect(midi.slice(0, 4)).toEqual([36, 43, 48, 42])
    expect(midi.slice(4, 8)).toEqual([43, 50, 55, 35])
  })

  it('rejects a pattern that does not fill a bar', () => {
    expect(() => accomp('C', '0 1 2', { center: 60 })).toThrow(NotationError)
  })

  it('repeats a bar with %, rests through -, and passes commands through', () => {
    const { events, bars } = parse(accomp('G % - C', 'v9 0:2 2:2', { center: 60 }))
    expect(bars).toBe(4)
    expect(events.map((e) => e.midi)).toEqual([55, 62, 55, 62, 60, 67])
    expect(events[0].vel).toBeCloseTo(9 / 15)
  })
})

describe('swing', () => {
  it('keeps beats in place, pushes off-beats late and never reorders', () => {
    expect(swingTick(0, 0.3)).toBe(0)
    expect(swingTick(TPQ, 0.3)).toBe(TPQ)
    expect(swingTick(TPQ / 2, 0.3)).toBeCloseTo((TPQ / 2) * 1.3)
    let prev = -1
    for (let t = 0; t <= TPQ * 2; t++) {
      const s = swingTick(t, 0.3)
      expect(s).toBeGreaterThan(prev)
      prev = s
    }
  })
})

describe('song compiler', () => {
  it('compiles sections, sorts events and swings off-beats', () => {
    const song = compileSong('t', {
      bpm: 120,
      swing: 0.33,
      intro: { p1: 'c1', noise: 'k2 s2' },
      body: { p1: 'l8 c d e f g a b >c', wave: 'o2 c1', noise: '[k8 h8 s8 h8]2' },
    })
    expect(song.intro.len).toBe(BAR)
    expect(song.body.len).toBe(BAR)
    const ts = song.body.events.map((e) => e.t)
    expect([...ts].sort((a, b) => a - b)).toEqual(ts)
    const d = song.body.events.find((e) => e.ch === 'p1' && e.midi === 62)
    expect(d?.t).toBeCloseTo(swingTick(24, 0.33))
    expect(d?.t).toBeGreaterThan(24)
  })

  it('refuses channels of different lengths and unknown instruments', () => {
    expect(() => compileSong('x', { bpm: 120, body: { p1: 'c1', p2: 'c1 | c1' } })).toThrow(/bars/)
    expect(() => compileSong('x', { bpm: 120, body: { p1: '@nope c1' } })).toThrow(/instrument/)
    expect(() => compileSong('x', { bpm: 120, body: { p1: '@kit c1' } })).toThrow(/can't play/)
    expect(() => compileSong('x', { bpm: 120, body: {} })).toThrow(/empty/)
  })

  it('supports other meters', () => {
    const song = compileSong('waltz', { bpm: 120, meter: [6, 8], body: { p1: 'l8 c d e f g a | b4. >c4.' } })
    expect(song.barTicks).toBe(TPQ * 3)
    expect(song.body.bars).toBe(2)
  })
})

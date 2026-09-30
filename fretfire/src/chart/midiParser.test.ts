import { parseMidi } from './midiParser'
import { OPEN_BIT, findTrack } from './types'

// A tiny Standard MIDI File writer. Events are written in the order given
// (stably sorted by tick), so tests control same-tick ordering.
interface Ev {
  tick: number
  bytes: number[]
}

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const u16 = (n: number) => [(n >>> 8) & 255, n & 255]
function vlq(n: number): number[] {
  const out = [n & 0x7f]
  for (n = Math.floor(n / 128); n > 0; n = Math.floor(n / 128)) out.unshift((n & 0x7f) | 0x80)
  return out
}
const meta = (tick: number, type: number, data: number[]): Ev => ({ tick, bytes: [0xff, type, ...vlq(data.length), ...data] })
const trackName = (text: string) => meta(0, 0x03, ascii(text))
const text = (tick: number, value: string, type = 0x01) => meta(tick, type, ascii(value))
const tempo = (tick: number, bpm: number) => {
  const us = Math.round(60_000_000 / bpm)
  return meta(tick, 0x51, [(us >> 16) & 255, (us >> 8) & 255, us & 255])
}
const timeSig = (tick: number, numerator: number, power: number) => meta(tick, 0x58, [numerator, power, 24, 8])
const note = (tick: number, key: number, length: number, velocity = 100): Ev[] => [
  { tick, bytes: [0x90, key, velocity] },
  { tick: tick + length, bytes: [0x80, key, 64] },
]
const psSysex = (tick: number, difficulty: number, type: number, on: number): Ev => ({
  tick,
  bytes: [0xf0, 8, 0x50, 0x53, 0, 0, difficulty, type, on, 0xf7],
})

function encodeTrack(events: Ev[]): number[] {
  const body: number[] = []
  let last = 0
  for (const ev of [...events].sort((a, b) => a.tick - b.tick)) {
    body.push(...vlq(ev.tick - last), ...ev.bytes)
    last = ev.tick
  }
  body.push(0, 0xff, 0x2f, 0)
  return rawTrack(body)
}
const rawTrack = (body: number[]) => [...ascii('MTrk'), ...u32(body.length), ...body]
const midiFile = (tracks: number[][], division = 480) =>
  new Uint8Array([...ascii('MThd'), ...u32(6), ...u16(1), ...u16(tracks.length), ...u16(division), ...tracks.flat()])

const conductor = encodeTrack([trackName('Song Title'), tempo(0, 120), timeSig(0, 4, 2), tempo(1920, 60), timeSig(1920, 3, 3)])

const guitar = encodeTrack([
  trackName('PART GUITAR'),
  ...note(0, 96, 240),
  ...note(480, 97, 60),
  ...note(480, 116, 480),
  ...note(600, 98, 60),
  ...note(600, 102, 10),
  ...note(720, 99, 60),
  ...note(960, 96, 60),
  ...note(960, 97, 60),
  ...note(960, 101, 1),
  ...note(1440, 100, 60),
  ...note(1440, 104, 100),
  ...note(1440, 103, 480),
  text(0, '[idle]'),
])

const bass = encodeTrack([trackName('part bass '), ...note(0, 60, 100), ...note(480, 61, 100)])
const drums = encodeTrack([trackName('PART DRUMS'), ...note(0, 96, 100)])
const events = encodeTrack([
  trackName('EVENTS'),
  text(0, '[section intro]'),
  text(960, '[prc_verse_1]'),
  text(1440, '[section chorus]', 0x06),
  text(1920, '[music_start]'),
])

describe('parseMidi', () => {
  const { chart, meta: songMeta } = parseMidi(midiFile([conductor, guitar, bass, drums, events]))

  it('reads the tempo map and time signatures', () => {
    expect(chart.resolution).toBe(480)
    expect(chart.offset).toBe(0)
    expect(chart.tempos).toEqual([
      { tick: 0, bpm: 120 },
      { tick: 1920, bpm: 60 },
    ])
    expect(chart.timeSignatures).toEqual([
      { tick: 0, numerator: 4, denominator: 4 },
      { tick: 1920, numerator: 3, denominator: 8 },
    ])
    expect(songMeta).toEqual({})
  })

  it('reads sections from the EVENTS track', () => {
    expect(chart.sections.map((s) => [s.name, s.time])).toEqual([
      ['Intro', 0],
      ['Verse 1', 1],
      ['Chorus', 1.5],
    ])
  })

  it('keeps five-fret parts only', () => {
    expect(chart.tracks.map((t) => `${t.instrument}/${t.difficulty}`)).toEqual(['guitar/expert', 'bass/easy'])
    expect(findTrack(chart, 'bass', 'easy')!.notes.map((n) => n.mask)).toEqual([1, 2])
  })

  it('reads frets, sustains, forced notes, taps, star power and solos', () => {
    const track = findTrack(chart, 'guitar', 'expert')!
    expect(track.notes.map((n) => n.tick)).toEqual([0, 480, 600, 720, 960, 1440])
    expect(track.notes.map((n) => n.mask)).toEqual([1, 2, 4, 8, 3, 16])
    expect(track.notes.map((n) => n.kind)).toEqual(['strum', 'strum', 'strum', 'hopo', 'hopo', 'tap'])
    // 240 ticks is over the 160-tick MIDI cutoff; 60 is not.
    expect(track.notes[0].sustainBeats[0]).toBe(0.5)
    expect(track.notes[0].sustain[0]).toBeCloseTo(0.25)
    expect(track.notes[1].sustain[1]).toBe(0)
    expect(track.notes.map((n) => n.star)).toEqual([false, true, true, true, false, false])
    expect(track.notes[3].starEnd).toBe(true)
    expect(track.notes.map((n) => n.solo)).toEqual([false, false, false, false, false, true])
  })

  it('applies song.ini HOPO frequency, sustain cutoff and delay', () => {
    const parsed = parseMidi(midiFile([conductor, guitar]), { hopoFrequency: 100, sustainCutoff: 300, delay: 1 })
    const track = findTrack(parsed.chart, 'guitar', 'expert')!
    expect(parsed.chart.offset).toBe(1)
    expect(track.notes[0].time).toBe(1)
    expect(track.notes[0].sustain[0]).toBe(0)
    expect(track.notes[3].kind).toBe('strum')
  })

  it('reads open notes only when the track asks for enhanced opens', () => {
    const notes = [trackName('PART GUITAR'), ...note(0, 95, 60), ...note(480, 96, 60)]
    const plain = parseMidi(midiFile([conductor, encodeTrack(notes)])).chart
    expect(plain.tracks[0].notes.map((n) => n.mask)).toEqual([1])
    const enhanced = parseMidi(midiFile([conductor, encodeTrack([...notes, text(0, '[ENHANCED_OPENS]')])])).chart
    expect(enhanced.tracks[0].notes.map((n) => n.mask)).toEqual([OPEN_BIT, 1])
    const bare = parseMidi(midiFile([conductor, encodeTrack([...notes, text(0, 'ENHANCED_OPENS')])])).chart
    expect(bare.tracks[0].notes.map((n) => n.mask)).toEqual([OPEN_BIT, 1])
  })

  it('reads Phase Shift open and tap sysex events', () => {
    const track = encodeTrack([
      trackName('PART GUITAR'),
      psSysex(0, 3, 1, 1),
      ...note(0, 96, 100),
      ...note(0, 97, 300),
      psSysex(10, 3, 1, 0),
      ...note(480, 98, 60),
      psSysex(0, 0, 1, 1), // an easy-only open span leaves expert alone
      psSysex(960, 0xff, 4, 1),
      ...note(960, 99, 60),
      ...note(960, 84, 60),
      psSysex(1000, 0xff, 4, 0),
      ...note(1200, 100, 60),
    ])
    const parsed = parseMidi(midiFile([conductor, track])).chart
    const expert = findTrack(parsed, 'guitar', 'expert')!
    expect(expert.notes.map((n) => n.mask)).toEqual([OPEN_BIT, 4, 8, 16])
    expect(expert.notes[0].sustainBeats[5]).toBe(300 / 480)
    expect(expert.notes.map((n) => n.kind)).toEqual(['strum', 'strum', 'tap', 'strum'])
    expect(findTrack(parsed, 'guitar', 'hard')!.notes[0].kind).toBe('tap')
  })

  it('handles running status, velocity-0 note-offs and meta events in between', () => {
    const body = [
      ...[0, 0xff, 0x03, 11, ...ascii('PART GUITAR')],
      ...[0, 0x90, 96, 100],
      ...[0, 0xff, 0x01, 3, ...ascii('abc')],
      ...[...vlq(240), 96, 0],
      ...[...vlq(240), 97, 100],
      ...[...vlq(240), 97, 0],
      ...[0, 0xff, 0x2f, 0],
    ]
    const track = parseMidi(midiFile([conductor, rawTrack(body)]), { sustainCutoff: 0 }).chart.tracks[0]
    expect(track.notes.map((n) => [n.tick, n.mask, n.sustainBeats[n.mask === 1 ? 0 : 1]])).toEqual([
      [0, 1, 0.5],
      [480, 2, 0.5],
    ])
  })

  it('closes a note at a repeated note-on, even when its note-off comes after', () => {
    const body = encodeTrack([
      trackName('PART GUITAR'),
      { tick: 0, bytes: [0x90, 96, 100] },
      { tick: 240, bytes: [0x90, 96, 100] },
      { tick: 480, bytes: [0x80, 96, 0] },
      { tick: 0, bytes: [0x90, 97, 100] },
      { tick: 480, bytes: [0x90, 97, 100] },
      { tick: 480, bytes: [0x80, 97, 0] },
      { tick: 720, bytes: [0x80, 97, 0] },
    ])
    const track = parseMidi(midiFile([conductor, body]), { sustainCutoff: 0 }).chart.tracks[0]
    expect(track.notes.map((n) => [n.tick, n.mask])).toEqual([
      [0, 3],
      [240, 1],
      [480, 2],
    ])
    expect(track.notes[0].sustainBeats[1]).toBe((480 - 15) / 480)
    expect(track.notes[1].sustainBeats[0]).toBe(0.5)
    expect(track.notes[2].sustainBeats[1]).toBe(0.5)
  })

  it('collects tempo events from any track and reads T1 GEMS as guitar', () => {
    const track = encodeTrack([trackName('T1 GEMS'), tempo(0, 60), ...note(480, 96, 10)])
    const parsed = parseMidi(midiFile([encodeTrack([]), track])).chart
    expect(parsed.tracks[0].instrument).toBe('guitar')
    expect(parsed.tracks[0].notes[0].time).toBe(1)
  })

  it('reads a truncated track as far as it goes', () => {
    const track = encodeTrack([
      trackName('PART GUITAR'),
      ...note(0, 96, 60),
      ...note(480, 97, 60),
      ...note(960, 98, 60),
      ...note(1440, 99, 60),
    ])
    const bytes = midiFile([conductor, track])
    const parsed = parseMidi(bytes.subarray(0, bytes.length - 10)).chart
    expect(parsed.tracks[0].notes.map((n) => n.tick)).toEqual([0, 480, 960])
  })

  it('rejects files that are not MIDI or use SMPTE time', () => {
    expect(() => parseMidi(new TextEncoder().encode('definitely not a midi file'))).toThrow('This is not a MIDI file')
    expect(() => parseMidi(midiFile([conductor], 0xe728))).toThrow('SMPTE-timed MIDI files are not supported')
  })
})

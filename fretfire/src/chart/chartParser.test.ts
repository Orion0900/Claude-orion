import { decodeText, parseChartText, sectionName } from './chartParser'
import { OPEN_BIT, findTrack } from './types'

const SONG = `[Song]
{
  Name = "Test Song"
  Artist = "Test Artist"
  Charter = "Tester"
  Album = "Test Album"
  Year = ", 2019"
  Offset = 0.5
  Resolution = 192
  Genre = "rock"
  PreviewStart = 12.5
  MusicStream = "song.ogg"
}
[SyncTrack]
{
  0 = TS 4
  0 = B 120000
  768 = TS 6 3
  768 = B 60000
  768 = A 1000000
}
[Events]
{
  0 = E "section Intro"
  384 = E "[section Verse 1]"
  768 = E "prc_verse_2"
  800 = E "lyric hello"
}
[ExpertSingle]
{
  0 = N 0 0
  0 = N 1 0
  192 = N 2 96
  240 = N 3 0
  240 = N 5 0
  384 = N 7 0
  576 = N 4 0
  576 = N 6 0
  768 = S 2 200
  768 = N 0 0
  960 = N 1 0
  960 = E solo
  1152 = N 2 0
  1152 = E soloend
  1344 = N 3 0
}
[EasyDoubleBass]
{
  0 = N 0 0
}
[HardKeyboard]
{
  0 = E solo
}
[ExpertDrums]
{
  0 = N 0 0
}
[ExpertGHLGuitar]
{
  0 = N 0 0
}
`

describe('parseChartText', () => {
  it('reads song metadata', () => {
    const { meta } = parseChartText(SONG)
    expect(meta).toEqual({
      name: 'Test Song',
      artist: 'Test Artist',
      charter: 'Tester',
      album: 'Test Album',
      year: '2019',
      genre: 'rock',
      previewStart: 12.5,
    })
  })

  it('reads the tempo map, time signatures and offset', () => {
    const { chart } = parseChartText(SONG)
    expect(chart.resolution).toBe(192)
    expect(chart.offset).toBe(0.5)
    expect(chart.tempos).toEqual([
      { tick: 0, bpm: 120 },
      { tick: 768, bpm: 60 },
    ])
    expect(chart.timeSignatures).toEqual([
      { tick: 0, numerator: 4, denominator: 4 },
      { tick: 768, numerator: 6, denominator: 8 },
    ])
  })

  it('reads sections in every spelling and times them', () => {
    const { chart } = parseChartText(SONG)
    expect(chart.sections.map((s) => s.name)).toEqual(['Intro', 'Verse 1', 'Verse 2'])
    expect(chart.sections.map((s) => s.time)).toEqual([0.5, 1.5, 2.5])
  })

  it('keeps only five-fret tracks that have notes', () => {
    const { chart } = parseChartText(SONG)
    expect(chart.tracks.map((t) => `${t.instrument}/${t.difficulty}`)).toEqual(['guitar/expert', 'bass/easy'])
  })

  it('reads notes, forces, taps, opens, star power and solos', () => {
    const track = findTrack(parseChartText(SONG).chart, 'guitar', 'expert')!
    expect(track.notes.map((n) => n.tick)).toEqual([0, 192, 240, 384, 576, 768, 960, 1152, 1344])
    expect(track.notes.map((n) => n.mask)).toEqual([0b11, 0b100, 0b1000, OPEN_BIT, 0b10000, 1, 0b10, 0b100, 0b1000])
    expect(track.notes.map((n) => n.kind)).toEqual([
      'strum',
      'strum',
      'strum', // a natural HOPO, flipped
      'strum',
      'tap',
      'strum',
      'strum',
      'strum',
      'strum',
    ])
    expect(track.notes[1].sustain[2]).toBeCloseTo(0.25)
    expect(track.notes[6].time).toBeCloseTo(3.5)
    expect(track.notes.map((n) => n.star)).toEqual([false, false, false, false, false, true, true, false, false])
    expect(track.notes[6].starEnd).toBe(true)
    // soloend is inclusive: the note on its tick is part of the solo.
    expect(track.notes.map((n) => n.solo)).toEqual([false, false, false, false, false, false, true, true, false])
  })

  it('applies the song.ini HOPO frequency and delay', () => {
    const { chart } = parseChartText(SONG, { hopoFrequency: 20, delay: 0.25 })
    const track = findTrack(chart, 'guitar', 'expert')!
    // 48 ticks is no longer a natural HOPO, so the flip makes it one.
    expect(track.notes[2].kind).toBe('hopo')
    expect(chart.offset).toBe(0.75)
    expect(track.notes[0].time).toBe(0.75)
    expect(chart.sections[0].time).toBe(0.75)
  })

  it('runs an unclosed solo to the last note', () => {
    const text = '[ExpertSingle]\n{\n0 = N 0 0\n192 = E solo\n192 = N 1 0\n384 = N 2 0\n}\n'
    const track = parseChartText(text).chart.tracks[0]
    expect(track.notes.map((n) => n.solo)).toEqual([false, true, true])
    expect(track.solos).toHaveLength(1)
  })

  it('tolerates BOMs, CRLF, tabs, missing braces, unknown sections and junk', () => {
    const text =
      '﻿[Song]\r\n\tResolution\t=\t480\r\n[Mystery]\r\n{\r\n  0 = N 0 0\r\n}\r\n[ExpertDoubleGuitar]\r\n' +
      '0 = N 0 0\r\nnot a line\r\n = N 1 0\r\nabc = N 1 0\r\n480 = N 9 0\r\n480 = N\r\n  960  =  N  2  240  \r\n'
    const { chart } = parseChartText(text)
    expect(chart.resolution).toBe(480)
    expect(chart.tracks).toHaveLength(1)
    const track = chart.tracks[0]
    expect(track.instrument).toBe('coop')
    expect(track.notes.map((n) => n.tick)).toEqual([0, 960])
    expect(track.notes[1].sustainBeats[2]).toBe(0.5)
  })

  it('defaults to 192 ticks per beat and 120 BPM', () => {
    const { chart } = parseChartText('[ExpertSingle]\n{\n192 = N 0 0\n}')
    expect(chart.resolution).toBe(192)
    expect(chart.tempos).toEqual([{ tick: 0, bpm: 120 }])
    expect(chart.tracks[0].notes[0].time).toBeCloseTo(0.5)
  })

  it('returns an empty chart for text that is not a chart', () => {
    const { chart, meta } = parseChartText('hello world')
    expect(chart.tracks).toEqual([])
    expect(meta).toEqual({})
  })
})

describe('sectionName', () => {
  it('cleans up section events', () => {
    expect(sectionName('section Verse 1')).toBe('Verse 1')
    expect(sectionName('[section verse_1]')).toBe('Verse 1')
    expect(sectionName('[prc_gtr_solo]')).toBe('Gtr solo')
    expect(sectionName('lyric hello')).toBeUndefined()
    expect(sectionName('section')).toBeUndefined()
  })
})

describe('decodeText', () => {
  it('decodes UTF-8, UTF-16 and Windows-1252', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0xc3, 0xa9]))).toBe('hé')
    expect(decodeText(new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0xe9, 0x00]))).toBe('hé')
    expect(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0xe9]))).toBe('hé')
    expect(decodeText(new Uint8Array([0x68, 0xe9]))).toBe('hé')
  })
})

import { FRET_MASK, gemCount } from '../chart/types'
import { arrange } from './arrange'
import { assignFrets, chartFromScore } from './autochart'
import { parseLead } from './notation'
import { BUILTIN_SONGS } from './songs'
import { SCALES, degreeToMidi, parseRoman } from './theory'

const minor = SCALES.minor
const opts = { root: 64, scale: minor, beatsPerBar: 4, startBeat: 0 }

describe('theory', () => {
  it('maps degrees across octaves', () => {
    expect(degreeToMidi(64, minor, 1)).toBe(64)
    expect(degreeToMidi(64, minor, 3)).toBe(67)
    expect(degreeToMidi(64, minor, 8)).toBe(76)
    expect(degreeToMidi(64, minor, 0)).toBe(62)
  })

  it('reads chord symbols', () => {
    expect(parseRoman('VI')).toEqual({ degree: 6, accidental: 0 })
    expect(parseRoman('bII')).toEqual({ degree: 2, accidental: -1 })
    expect(parseRoman('iv')).toEqual({ degree: 4, accidental: 0 })
    expect(() => parseRoman('X')).toThrow()
  })
})

describe('parseLead', () => {
  it('reads notes, holds, rests and octave marks', () => {
    const { notes, beats } = parseLead("1 - 3 . 5' 1, - -", opts)
    expect(beats).toBe(4)
    expect(notes.map((n) => [n.beat, n.length, n.pitches[0]])).toEqual([
      [0, 1, 64],
      [1, 0.5, 67],
      [2, 0.5, 83],
      [2.5, 1.5, 52],
    ])
  })

  it('switches grids and keeps triplets exact', () => {
    const { notes, beats } = parseLead('12: 1 2 3 16: 1 2 3 4', opts)
    expect(beats).toBe(2)
    expect(notes[2].beat).toBeCloseTo(2 / 3, 10)
    expect(notes[3].beat).toBe(1)
    expect(notes[6].beat).toBe(1.75)
  })

  it('builds power chords and accidentals', () => {
    const { notes } = parseLead("Pb2, #7'", opts)
    expect(notes[0].power).toBe(true)
    expect(notes[0].pitches).toEqual([53, 60, 65])
    expect(notes[1].pitches).toEqual([64 + 10 + 12 + 1])
  })

  it('rejects miscounted bars and unknown tokens', () => {
    expect(() => parseLead('1 2 3 | 4', opts)).toThrow(/bar boundary/)
    expect(() => parseLead('1 9', opts)).toThrow(/Unknown token/)
  })
})

describe('assignFrets', () => {
  const phrase = (pitches: number[]) => pitches.map((pitch) => ({ pitch, phrase: 0 }))

  it('follows the melody up and down the neck', () => {
    const frets = assignFrets(phrase([64, 66, 67, 69, 71, 69, 67]), 5, 64, 71)
    expect(frets).toEqual([0, 1, 2, 3, 4, 3, 2])
  })

  it('keeps a repeated pitch on one fret and moves on every change', () => {
    const frets = assignFrets(phrase([60, 60, 62, 60, 62]), 5, 50, 80)
    expect(frets[0]).toBe(frets[1])
    expect(frets[2]).toBeGreaterThan(frets[1])
    expect(frets[3]).toBe(frets[0])
  })

  it('places high phrases high and low phrases low', () => {
    expect(assignFrets(phrase([80, 82]), 5, 50, 82)[1]).toBe(4)
    expect(assignFrets(phrase([50, 52]), 5, 50, 82)[0]).toBe(0)
  })

  it('squeezes wide phrases onto the frets available', () => {
    const frets = assignFrets(phrase([60, 62, 64, 65, 67, 69, 71]), 3, 60, 71)
    expect(Math.max(...frets)).toBe(2)
    expect(Math.min(...frets)).toBe(0)
  })
})

describe('built-in songs', () => {
  for (const song of BUILTIN_SONGS) {
    describe(song.title, () => {
      const score = arrange(song)
      const chart = chartFromScore(score)
      const seconds = (score.lengthBeats * 60) / song.bpm

      it('arranges every part inside the song', () => {
        expect(seconds).toBeGreaterThan(80)
        expect(seconds).toBeLessThan(180)
        for (const list of [score.drums, score.bass, score.rhythm, score.lead]) {
          expect(list.length).toBeGreaterThan(0)
          for (const e of list) expect(e.beat).toBeLessThan(score.lengthBeats)
        }
      })

      it('charts four difficulties that get harder', () => {
        const counts = chart.tracks.map((t) => t.notes.length)
        expect(chart.tracks.map((t) => t.difficulty)).toEqual(['easy', 'medium', 'hard', 'expert'])
        for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1])
        expect(counts[0]).toBeGreaterThan(40)
      })

      it('keeps each difficulty on its frets', () => {
        const [easy, medium, hard, expert] = chart.tracks
        for (const n of easy.notes) {
          expect(n.mask & FRET_MASK).toBe(n.mask)
          expect(n.mask).toBeLessThan(1 << 3)
          expect(gemCount(n.mask)).toBe(1)
        }
        for (const n of medium.notes) expect(n.mask).toBeLessThan(1 << 4)
        for (const n of [...hard.notes, ...expert.notes]) expect(n.mask).toBeLessThan(1 << 5)
        expect(expert.notes.some((n) => gemCount(n.mask) === 2)).toBe(true)
      })

      it('has star power, sustains and a solo', () => {
        const expert = chart.tracks[3]
        expect(expert.starPhrases.length).toBeGreaterThanOrEqual(5)
        expect(expert.solos.length).toBeGreaterThanOrEqual(song.id === 'first-light' ? 1 : 1)
        expect(expert.notes.some((n) => n.sustain.some((s) => s > 0))).toBe(true)
        for (const track of chart.tracks) expect(track.starPhrases.length).toBeGreaterThanOrEqual(3)
      })

      it('never asks for notes faster than a human can tap on easy', () => {
        const easy = chart.tracks[0].notes
        for (let i = 1; i < easy.length; i++) expect(easy[i].time - easy[i - 1].time).toBeGreaterThan(0.3)
      })
    })
  }
})

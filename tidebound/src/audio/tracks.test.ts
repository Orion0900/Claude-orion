import { JINGLE_IDS, TRACK_IDS } from './ids'
import { isPatch, PATCHES } from './instruments'
import { DRUMS } from './notation'
import { CHANNELS, compileSong, secondsPerTick, type CompiledSong, type SongEvent } from './song'
import { collectEvents, loopPoints } from './timeline'
import { jingle, JINGLES, SONGS, track } from './tracks'

/** MIDI ranges each channel is written for. */
const RANGE = { p1: [55, 96], p2: [45, 96], wave: [28, 64] } as const

function allEvents(song: CompiledSong): SongEvent[] {
  return [...song.intro.events, ...song.body.events]
}

describe('every track', () => {
  it('has a song for every TrackId and nothing else', () => {
    expect(Object.keys(SONGS).sort()).toEqual([...TRACK_IDS].sort())
    expect(TRACK_IDS).toHaveLength(28)
  })

  for (const id of TRACK_IDS) {
    describe(id, () => {
      const song = track(id)

      it('compiles: every bar holds exactly one bar and every channel agrees', () => {
        // compileSong throws on a short or long bar or mismatched channels; recompile to be sure.
        expect(() => compileSong(id, SONGS[id])).not.toThrow()
        expect(song.body.len % song.barTicks).toBe(0)
        expect(song.intro.len % song.barTicks).toBe(0)
      })

      it('has 8 to 32 bars that loop, plus an optional intro of whole bars', () => {
        expect(song.body.bars).toBeGreaterThanOrEqual(8)
        expect(song.body.bars).toBeLessThanOrEqual(32)
        expect(song.body.len).toBe(song.body.bars * song.barTicks)
        expect(song.intro.len).toBe(song.intro.bars * song.barTicks)
        expect(song.intro.bars).toBeLessThanOrEqual(8)
        const { loopStart, loopLength } = loopPoints(song)
        expect(loopStart).toBeCloseTo(song.intro.len * secondsPerTick(song))
        expect(loopLength).toBeGreaterThan(8)
        expect(loopLength).toBeLessThan(90)
      })

      it('keeps every event inside its section, in order', () => {
        for (const section of [song.intro, song.body]) {
          let prev = -1
          for (const e of section.events) {
            expect(e.t).toBeGreaterThanOrEqual(prev)
            expect(e.t).toBeGreaterThanOrEqual(0)
            expect(e.t).toBeLessThan(section.len)
            expect(e.len).toBeGreaterThan(0)
            expect(e.t + e.len).toBeLessThanOrEqual(section.len + 1e-9)
            prev = e.t
          }
        }
      })

      it('writes notes in a sane range with known instruments', () => {
        for (const e of allEvents(song)) {
          expect(isPatch(e.patch)).toBe(true)
          expect(e.vel).toBeGreaterThan(0)
          expect(e.vel).toBeLessThanOrEqual(1)
          expect(e.gate).toBeGreaterThan(0)
          expect(e.gate).toBeLessThanOrEqual(1)
          if (e.ch === 'noise') {
            expect(DRUMS).toContain(e.drum)
            expect(PATCHES[e.patch].wave).toBe('noise')
            continue
          }
          expect(e.drum).toBeNull()
          const [lo, hi] = RANGE[e.ch]
          expect(e.midi, `${id} ${e.ch} note ${e.midi}`).toBeGreaterThanOrEqual(lo)
          expect(e.midi, `${id} ${e.ch} note ${e.midi}`).toBeLessThanOrEqual(hi)
          for (const b of e.bends ?? []) {
            expect(b.at).toBeGreaterThan(0)
            expect(b.at).toBeLessThan(e.len)
            expect(Math.abs(b.midi - e.midi)).toBeLessThanOrEqual(12)
          }
        }
      })

      it('uses all four channels: two pulses, the wave bass and drums', () => {
        const used = new Set(song.body.events.map((e) => e.ch))
        for (const ch of CHANNELS) expect(used.has(ch), `${id} body is missing ${ch}`).toBe(true)
      })

      it('carries a melody: the lead plays a real tune with repeated pitch motion', () => {
        const lead = song.body.events.filter((e) => e.ch === 'p1')
        expect(lead.length).toBeGreaterThanOrEqual(song.body.bars)
        expect(new Set(lead.map((e) => e.midi)).size).toBeGreaterThanOrEqual(5)
      })

      it('loops seamlessly: the timeline hands the body out again after each pass', () => {
        const first = collectEvents(song, song.intro.len, song.intro.len + song.body.len)
        const second = collectEvents(song, song.intro.len + song.body.len, song.intro.len + 2 * song.body.len)
        expect(second).toHaveLength(first.length)
        second.forEach((s, i) => {
          expect(s.ev).toBe(first[i].ev)
          expect(s.tick - song.body.len).toBeCloseTo(first[i].tick, 6)
        })
      })
    })
  }

  it('gives battles a faster tempo than the towns, rising towards the champion', () => {
    const bpm = (id: (typeof TRACK_IDS)[number]) => SONGS[id].bpm
    expect(bpm('battleWild')).toBeGreaterThan(bpm('route'))
    expect(bpm('battleTrainer')).toBeGreaterThan(bpm('battleWild'))
    expect(bpm('battleWarden')).toBeGreaterThan(bpm('battleTrainer'))
    expect(bpm('battleChampion')).toBeGreaterThan(bpm('battleRival'))
    expect(bpm('battleChampion')).toBe(Math.max(...TRACK_IDS.map(bpm)))
  })

  it('writes routeSea in six-eight', () => {
    expect(track('routeSea').barTicks).toBe(144)
    expect(SONGS.routeSea.meter).toEqual([6, 8])
  })

  it('gives every battle and victory tune an intro, and the victory tunes a gentle loop', () => {
    for (const id of TRACK_IDS.filter((t) => t.startsWith('battle') || t.startsWith('victory'))) expect(track(id).intro.len).toBeGreaterThan(0)
    for (const id of ['victoryWild', 'victoryTrainer', 'victoryWarden'] as const) {
      const song = track(id)
      expect(song.body.events.filter((e) => e.ch === 'p1').every((e) => e.patch === 'lead50')).toBe(true)
      expect(song.body.events.filter((e) => e.ch === 'noise').every((e) => e.patch === 'softkit')).toBe(true)
    }
  })

  it('shares the swell motif between the title, the credits and the legend', () => {
    // Four quick notes climbing 5-6-1-3 of the key: the lift of a wave.
    const swell = (id: 'title' | 'credits' | 'battleLegend'): number[] => {
      const lead = [...track(id).intro.events, ...track(id).body.events].filter((e) => e.ch === 'p1')
      for (let i = 0; i + 3 < lead.length; i++) {
        const [a, b, c, d] = lead.slice(i, i + 4)
        if (a.len <= 12 && b.len <= 12 && c.midi - a.midi === 5 && d.midi - c.midi >= 3 && d.midi - c.midi <= 4) return [b.midi - a.midi, c.midi - a.midi, d.midi - a.midi]
      }
      return []
    }
    expect(swell('title')).toEqual([2, 5, 9])
    expect(swell('credits')).toEqual([2, 5, 9])
    expect(swell('battleLegend')).toEqual([1, 5, 8])
  })
})

describe('every jingle', () => {
  it('has one for every JingleId', () => {
    expect(Object.keys(JINGLES).sort()).toEqual([...JINGLE_IDS].sort())
  })

  for (const id of JINGLE_IDS) {
    it(`${id} compiles, plays once and lasts 1-4 seconds`, () => {
      const song = jingle(id)
      expect(song.intro.len).toBe(0)
      const seconds = song.body.len * secondsPerTick(song)
      expect(seconds).toBeGreaterThanOrEqual(1)
      expect(seconds).toBeLessThanOrEqual(4)
      for (const e of song.body.events) {
        expect(isPatch(e.patch)).toBe(true)
        if (e.ch !== 'noise') {
          expect(e.midi).toBeGreaterThanOrEqual(RANGE[e.ch][0])
          expect(e.midi).toBeLessThanOrEqual(RANGE[e.ch][1])
        }
      }
      expect(song.body.events.some((e) => e.ch === 'p1')).toBe(true)
    })
  }
})

import { buildTrack, type RawGem, type RawTrack } from '../chart/builder'
import { TempoMap } from '../chart/tempo'
import type { Track } from '../chart/types'
import { HIT, MISSED, PENDING, PlaySession, soloGrade, type SessionOptions } from './session'

// 120 BPM at 192 ticks per beat: one beat is 0.5 s, 192 ticks.
const RES = 192
const tempo = new TempoMap(RES, [{ tick: 0, bpm: 120 }])
const W = 0.075

function track(raw: RawTrack, hopoThreshold = 65): Track {
  return buildTrack(raw, tempo, 'guitar', 'expert', { hopoThreshold, sustainCutoff: 0 })
}
function session(raw: RawTrack, opts: Partial<SessionOptions> = {}, hopoThreshold = 65): PlaySession {
  return new PlaySession(track(raw, hopoThreshold), tempo, {
    scheme: 'tap',
    window: W,
    ghostPenalty: true,
    canFail: false,
    ...opts,
  })
}
const g = (tick: number, lane: number, length = 0): RawGem => ({ tick, lane, length })
/** One single note per beat, cycling lanes. */
const singles = (count: number) => Array.from({ length: count }, (_, i) => g(i * RES, i % 5))
const types = (s: PlaySession) => s.drainEvents().map((e) => e.type)

/** Taps every gem of every note exactly on time. */
function playPerfectly(s: PlaySession) {
  for (const note of s.notes) {
    for (let lane = 0; lane < 5; lane++) {
      if (note.mask & (1 << lane)) {
        s.press(lane, note.time)
        s.release(lane, note.time + 0.01)
      }
    }
  }
}

describe('PlaySession in tap mode', () => {
  it('scores notes through the multiplier ladder', () => {
    const s = session({ gems: singles(40) })
    playPerfectly(s)
    s.update(100)
    // 10 notes at each of 1x, 2x, 3x and 4x.
    expect(s.score).toBe(50 * 10 * (1 + 2 + 3 + 4))
    expect(s.streak).toBe(40)
    expect(s.results().fullCombo).toBe(true)
    expect(s.results().accuracy).toBe(1)
    expect(s.results().stars).toBe(5)
  })

  it('hits notes anywhere inside the window, and not outside it', () => {
    const s = session({ gems: [g(192, 0), g(384, 1), g(576, 2)] }, { ghostPenalty: false })
    s.press(0, 0.5 - W + 0.001)
    s.press(1, 1.0 + W - 0.001)
    s.press(2, 1.5 - W - 0.01)
    s.update(3)
    expect([...s.status]).toEqual([HIT, HIT, MISSED])
  })

  it('misses notes that pass, breaking the streak', () => {
    const s = session({ gems: singles(3) })
    s.press(0, 0)
    s.update(0.55)
    expect(s.streak).toBe(1)
    s.update(0.5 + W + 0.01)
    expect(s.streak).toBe(0)
    expect(s.status[1]).toBe(MISSED)
    expect(types(s)).toContain('miss')
  })

  it('needs every gem of a chord', () => {
    const s = session({ gems: [g(192, 0), g(192, 2), g(384, 1), g(384, 3)] })
    s.press(0, 0.5)
    s.press(2, 0.51)
    s.press(1, 1.0)
    s.update(2)
    expect([...s.status]).toEqual([HIT, MISSED])
    expect(s.score).toBe(100)
  })

  it('counts a tap on an empty lane as an overhit, unless ghost taps are forgiven', () => {
    const strict = session({ gems: singles(3) })
    strict.press(0, 0)
    strict.press(3, 0.25)
    expect(strict.streak).toBe(0)
    expect(types(strict)).toContain('overhit')

    const lenient = session({ gems: singles(3) }, { ghostPenalty: false })
    lenient.press(0, 0)
    lenient.press(3, 0.25)
    expect(lenient.streak).toBe(1)
  })

  it('forgives a bounce on the lane that just hit', () => {
    const s = session({ gems: singles(3) })
    s.press(0, 0)
    s.release(0, 0.01)
    s.press(0, 0.03)
    expect(s.streak).toBe(1)
    expect(s.overhits).toBe(0)
  })

  it('plays open notes with any lane', () => {
    const s = session({ gems: [g(0, 5), g(192, 5)] })
    s.press(3, 0)
    s.press(1, 0.5)
    expect(s.hits).toBe(2)
  })

  it('pays sustains while held and stops when let go', () => {
    const s = session({ gems: [g(0, 0, 768), g(0, 1, 768)] })
    s.press(0, 0)
    s.press(1, 0)
    s.update(1) // two beats held on two gems
    expect(s.score).toBeCloseTo(100 + 2 * 2 * 25)
    s.release(1, 1)
    s.update(2)
    // Green runs on to the end (4 beats); red stopped at 2.
    expect(s.score).toBeCloseTo(100 + 4 * 25 + 2 * 25)
    const ends = s.drainEvents().filter((e) => e.type === 'sustainEnd')
    expect(ends).toEqual([
      { type: 'sustainEnd', lane: 1, complete: false },
      { type: 'sustainEnd', lane: 0, complete: true },
    ])
  })

  it('ends a sustain at once when the tap was already released', () => {
    const s = session({ gems: [g(0, 0, 768)] })
    s.press(0, 0)
    s.release(0, 0.02)
    expect(s.sustains[0]).toBeNull()
  })

  it('awards star power for a clean phrase and spends it at double multiplier', () => {
    const s = session({
      gems: singles(12),
      starPhrases: [
        { tick: 0, length: 3 * RES },
        { tick: 3 * RES, length: 3 * RES },
      ],
    })
    for (let i = 0; i < 6; i++) s.press(i % 5, i * 0.5)
    const events = types(s)
    expect(events.filter((e) => e === 'starGained')).toHaveLength(2)
    expect(events).toContain('starReady')
    expect(s.starMeter).toBeCloseTo(0.5)
    expect(s.activateStar(3)).toBe(true)
    expect(s.multiplier).toBe(2)
    // Half a meter lasts 16 beats = 8 s.
    s.update(3 + 7.9)
    expect(s.starActive).toBe(true)
    s.update(3 + 8.1)
    expect(s.starActive).toBe(false)
    expect(types(s)).toContain('starEnded')
  })

  it('loses a star phrase to a single miss', () => {
    const s = session({ gems: singles(4), starPhrases: [{ tick: 0, length: 4 * RES }] })
    s.press(0, 0)
    s.press(2, 1.0)
    s.press(3, 1.5)
    s.update(3)
    expect(s.starMeter).toBe(0)
    expect(types(s)).toContain('starPhraseLost')
    expect(s.activateStar(3)).toBe(false)
  })

  it('pays a solo bonus per note hit', () => {
    const s = session({ gems: singles(6), solos: [{ tick: RES, length: 4 * RES }] })
    for (const i of [0, 1, 2, 4, 5]) s.press(i % 5, i * 0.5)
    s.update(5)
    const solo = s.drainEvents().find((e) => e.type === 'soloEnd')
    expect(solo).toEqual({ type: 'soloEnd', hit: 3, total: 4, bonus: 300 })
    expect(s.results().solos).toEqual([{ hit: 3, total: 4, bonus: 300 }])
  })

  it('fails only when failing is on', () => {
    const doomed = session({ gems: singles(40) }, { canFail: true })
    doomed.update(30)
    expect(doomed.failed).toBe(true)
    expect(types(doomed)).toContain('failed')

    const safe = session({ gems: singles(40) })
    safe.update(30)
    expect(safe.failed).toBe(false)
    expect(safe.results().accuracy).toBe(0)
  })
})

describe('PlaySession in guitar mode', () => {
  const guitar = (raw: RawTrack, opts: Partial<SessionOptions> = {}) => session(raw, { scheme: 'guitar', ...opts })

  it('hits a strum with the right fret and anchors lower frets', () => {
    const s = guitar({ gems: [g(0, 2), g(192, 3)] })
    s.press(0, -0.2)
    s.press(2, -0.1)
    s.strum(0)
    expect(s.status[0]).toBe(HIT)
    s.release(2, 0.3)
    s.release(0, 0.3)
    s.press(4, 0.4)
    s.strum(0.5)
    expect(s.status[1]).toBe(PENDING)
  })

  it('waits briefly for late frets after a strum', () => {
    const s = guitar({ gems: [g(0, 1), g(192, 2)] })
    s.strum(0)
    s.press(1, 0.03)
    expect(s.status[0]).toBe(HIT)
    s.strum(0.5)
    s.update(0.56)
    expect(s.overhits).toBe(1)
    expect(s.status[1]).toBe(PENDING)
  })

  it('needs exact frets for chords', () => {
    const s = guitar({ gems: [g(0, 0), g(0, 2), g(192, 1), g(192, 3)] })
    s.press(0, -0.1)
    s.press(2, -0.1)
    s.strum(0)
    expect(s.status[0]).toBe(HIT)
    s.press(1, 0.4)
    s.press(3, 0.4)
    s.strum(0.5)
    s.update(0.56)
    expect(s.status[1]).toBe(PENDING)
  })

  it('hammers on HOPOs after a hit, but not after a miss', () => {
    // 16th notes: 48 ticks apart, so the second and fourth are HOPOs.
    const s = guitar({ gems: [g(0, 0), g(48, 1), g(400, 0), g(448, 2)] })
    s.press(0, -0.05)
    s.strum(0)
    s.press(1, 0.125)
    expect(s.status[1]).toBe(HIT)
    // Strumming right after the hammer-on is part of it, not an overstrum.
    s.strum(0.15)
    expect(s.overhits).toBe(0)
    s.release(1, 0.9)
    s.release(0, 0.9)
    s.update(1.2)
    expect(s.status[2]).toBe(MISSED)
    s.press(2, 1.1667)
    expect(s.status[3]).toBe(PENDING)
    s.strum(1.17)
    expect(s.status[3]).toBe(HIT)
  })

  it('pulls off to a lower fret', () => {
    const s = guitar({ gems: [g(0, 3), g(48, 1)] })
    s.press(1, -0.1)
    s.press(3, -0.1)
    s.strum(0)
    s.release(3, 0.125)
    expect(s.status[1]).toBe(HIT)
  })

  it('lets taps be fretted any time', () => {
    const s = guitar({ gems: [g(0, 0), g(192, 4)], taps: new Set([192]) })
    s.update(0.3)
    expect(s.status[0]).toBe(MISSED)
    s.press(4, 0.5)
    expect(s.status[1]).toBe(HIT)
  })

  it('plays open notes by strumming with no frets', () => {
    const s = guitar({ gems: [g(0, 5), g(192, 5)] })
    s.strum(0)
    s.press(0, 0.4)
    s.strum(0.5)
    s.update(0.56)
    expect([s.status[0], s.status[1]]).toEqual([HIT, PENDING])
  })

  it('ignores a fret carrying an extended sustain', () => {
    const s = guitar({ gems: [g(0, 4, 768), g(192, 0)] })
    s.press(4, -0.1)
    s.strum(0)
    s.press(0, 0.4)
    s.strum(0.5)
    expect(s.status[1]).toBe(HIT)
    expect(s.sustains[4]).not.toBeNull()
  })

  it('counts strums with nothing to hit as overstrums', () => {
    const s = guitar({ gems: [g(0, 0), g(768, 0)] })
    s.press(0, -0.1)
    s.strum(0)
    s.strum(0.8)
    expect(s.streak).toBe(0)
    expect(s.overhits).toBe(1)
  })
})

describe('soloGrade', () => {
  it('grades by percentage', () => {
    expect(soloGrade(10, 10)).toBe('Perfect solo!')
    expect(soloGrade(19, 20)).toBe('Awesome solo!')
    expect(soloGrade(1, 10)).toBe('Messy solo')
  })
})

import { WHOLE } from './notation'
import { compileSong, secondsPerTick } from './song'
import { collectEvents, loopPoints, normalizeTick, Transport, type Scheduled } from './timeline'
import { track } from './tracks'

/** Intro: one bar of a single whole note. Body: two bars of quarter notes, each a different pitch. */
const song = compileSong('test', {
  bpm: 120,
  intro: { p1: 'o4 c1' },
  body: { p1: 'o4 d4 e4 f4 g4 | a4 b4 >c4 d4', noise: '[k4 s4 k4 s4 |]2' },
})
const INTRO = WHOLE
const BODY = WHOLE * 2

function ticksOf(list: Scheduled[], ch = 'p1'): number[] {
  return list.filter((s) => s.ev.ch === ch).map((s) => s.tick)
}

describe('timeline', () => {
  it('plays the intro once, then the body end to end', () => {
    const list = collectEvents(song, 0, INTRO + BODY * 3)
    const p1 = ticksOf(list)
    expect(p1[0]).toBe(0)
    // Intro note, then 8 body notes per pass.
    expect(p1).toHaveLength(1 + 8 * 3)
    expect(p1.slice(1, 9)).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map((q) => INTRO + q * 48))
    expect(p1[9]).toBe(INTRO + BODY)
    expect(p1[17]).toBe(INTRO + 2 * BODY)
    const midi = list.filter((s) => s.ev.ch === 'p1').map((s) => s.ev.midi)
    expect(midi.slice(0, 10)).toEqual([60, 62, 64, 65, 67, 69, 71, 72, 74, 62])
  })

  it('emits events in time order across every loop boundary', () => {
    const list = collectEvents(song, 0, INTRO + BODY * 5)
    for (let i = 1; i < list.length; i++) expect(list[i].tick).toBeGreaterThanOrEqual(list[i - 1].tick)
  })

  it('gives the same events however the time is sliced', () => {
    const whole = collectEvents(song, 0, INTRO + BODY * 4)
    const sliced: Scheduled[] = []
    let from = 0
    for (const step of [7, 50, 1, 96, 191, 13, 400, 33.5, 10.25]) {
      collectEvents(song, from, from + step, sliced)
      from += step
    }
    collectEvents(song, from, INTRO + BODY * 4, sliced)
    expect(sliced.map((s) => [s.tick, s.ev])).toEqual(whole.map((s) => [s.tick, s.ev]))
  })

  it('handles windows that start deep in the loop, and empty windows', () => {
    const far = INTRO + BODY * 1000
    const list = collectEvents(song, far - 24, far + 24)
    expect(ticksOf(list)).toEqual([far])
    expect(collectEvents(song, 100, 100)).toEqual([])
    expect(collectEvents(song, 100, 50)).toEqual([])
    expect(collectEvents(song, 0, Number.POSITIVE_INFINITY)).toEqual([])
  })

  it('folds positions back into the first pass', () => {
    expect(normalizeTick(song, 10)).toBe(10)
    expect(normalizeTick(song, INTRO + 5)).toBe(INTRO + 5)
    expect(normalizeTick(song, INTRO + BODY * 7 + 5)).toBe(INTRO + 5)
    expect(normalizeTick(song, -3)).toBe(0)
  })

  it('reports loop points in seconds', () => {
    const { loopStart, loopLength } = loopPoints(song)
    expect(loopStart).toBeCloseTo(2) // one bar at 120 bpm
    expect(loopLength).toBeCloseTo(4)
  })
})

describe('transport', () => {
  it('maps ticks to audio time and back', () => {
    const tr = new Transport(song, 10, 0)
    expect(tr.timeAt(0)).toBe(10)
    expect(tr.timeAt(48)).toBeCloseTo(10.5)
    expect(tr.tickAt(10.5)).toBeCloseTo(48)
    expect(secondsPerTick(song)).toBeCloseTo(0.5 / 48)
  })

  it('pumps a steady stream in time order, looping, with nothing twice or missed', () => {
    const tr = new Transport(song, 1, 0)
    const out: Scheduled[] = []
    for (let now = 0.9; now < 1 + 2 + 4 * 3; now += 0.025) tr.pump(now, 0.15, out)
    for (let i = 1; i < out.length; i++) expect(out[i].tick).toBeGreaterThan(out[i - 1].tick - 1e-9)
    const expected = collectEvents(song, 0, tr.scheduledTo)
    expect(out.map((s) => s.tick)).toEqual(expected.map((s) => s.tick))
    // Every event is queued ahead of when it sounds, by at most the lookahead.
    const times = out.map((s) => tr.timeAt(s.tick))
    expect(Math.min(...times)).toBeGreaterThanOrEqual(1)
  })

  it('queues each note before it is due', () => {
    const tr = new Transport(song, 0.05, 0)
    for (let now = 0; now < 8; now += 0.03) {
      for (const s of tr.pump(now, 0.12)) {
        const at = tr.timeAt(s.tick)
        expect(at).toBeGreaterThanOrEqual(now - 1e-9)
        expect(at).toBeLessThanOrEqual(now + 0.12 + 1e-9)
      }
    }
  })

  it('skips what it missed after a stall instead of playing it late in a heap', () => {
    const tr = new Transport(song, 0, 0)
    tr.pump(0, 0.1)
    const late = tr.pump(3, 0.1)
    for (const s of late) expect(tr.timeAt(s.tick)).toBeGreaterThanOrEqual(3 - 1e-9)
  })

  it('resumes mid-song from a remembered position', () => {
    const tr = new Transport(song, 0, 0)
    const pos = tr.positionAt(2.6) // 0.6 s into the body
    expect(pos).toBeCloseTo(INTRO + 0.6 / secondsPerTick(song))
    const resumed = new Transport(song, 100, normalizeTick(song, pos))
    const first = resumed.pump(100, 0.5)
    expect(first.length).toBeGreaterThan(0)
    // The next body note after 0.6 s is the third quarter (1.0 s, f), at 100.4 s.
    const p1 = first.filter((s) => s.ev.ch === 'p1')
    expect(p1[0].ev.midi).toBe(65)
    expect(resumed.timeAt(p1[0].tick)).toBeCloseTo(100.4)
    expect(resumed.positionAt(99)).toBe(normalizeTick(song, pos))
  })

  it('schedules a real battle theme through its intro and several loops', () => {
    const battle = track('battleChampion')
    const tr = new Transport(battle, 0, 0)
    const out: Scheduled[] = []
    const { loopStart, loopLength } = loopPoints(battle)
    for (let now = 0; now < loopStart + loopLength * 2.5; now += 0.025) tr.pump(now, 0.15, out)
    for (let i = 1; i < out.length; i++) expect(out[i].tick).toBeGreaterThanOrEqual(out[i - 1].tick)
    const introCount = battle.intro.events.length
    const bodyCount = battle.body.events.length
    expect(out.length).toBeGreaterThan(introCount + bodyCount * 2)
    expect(out.slice(0, introCount).every((s) => battle.intro.events.includes(s.ev))).toBe(true)
    expect(out[introCount].ev).toBe(battle.body.events[0])
    expect(out[introCount + bodyCount].ev).toBe(battle.body.events[0])
    expect(out[introCount + bodyCount].tick).toBe(battle.intro.len + battle.body.len)
  })
})

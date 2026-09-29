import { describe, expect, it } from 'vitest'
import { coachCues, INITIAL_COACH, spokenDuration, spokenPace, type CoachState } from './coach'
import { METERS_PER_MILE } from './units'

const MILE = METERS_PER_MILE

/** Run the coach over a steady run, collecting everything it says. */
function runSteady(total: number, secondsPerMeter: number, unit: 'mi' | 'km', step = 10) {
  let state: CoachState = INITIAL_COACH
  const said: Array<{ at: number; text: string }> = []
  for (let d = 0; d <= total; d += step) {
    const out = coachCues({ distanceAlong: d, total, movingSeconds: d * secondsPerMeter, unit, state })
    state = out.state
    for (const text of out.cues) said.push({ at: d, text })
  }
  return said
}

describe('spokenDuration', () => {
  it('reads times the way a coach says them', () => {
    expect(spokenDuration(0)).toBe('0 seconds')
    expect(spokenDuration(45)).toBe('45 seconds')
    expect(spokenDuration(60)).toBe('1 minute')
    expect(spokenDuration(552)).toBe('9 minutes 12 seconds')
    expect(spokenDuration(3720)).toBe('1 hour 2 minutes')
    expect(spokenDuration(7200)).toBe('2 hours')
  })

  it('reads pace per unit', () => {
    expect(spokenPace(552, 'mi')).toBe('9 minutes 12 seconds per mile')
    expect(spokenPace(330, 'km')).toBe('5 minutes 30 seconds per kilometre')
  })
})

describe('coachCues', () => {
  it('calls every mile of a 5 mile run with time and pace, but not the finish', () => {
    // 9:00 per mile.
    const said = runSteady(5 * MILE, 540 / MILE, 'mi')
    const splits = said.filter((s) => s.text.startsWith('Mile'))
    expect(splits.map((s) => s.text.split('.')[0])).toEqual(['Mile 1', 'Mile 2', 'Mile 3', 'Mile 4'])
    expect(splits[1].text).toContain('Average pace, 9 minutes per mile')
    expect(splits[1].text).toContain('That mile, 9 minutes')
    // The first split has no previous one to compare with.
    expect(splits[0].text).not.toContain('That mile')
  })

  it('says halfway and the last stretch once each', () => {
    const said = runSteady(5 * MILE, 540 / MILE, 'mi').map((s) => s.text)
    expect(said.filter((t) => t.startsWith('Halfway'))).toHaveLength(1)
    expect(said.filter((t) => t.startsWith('Half a mile to go'))).toHaveLength(1)
  })

  it('works in kilometres', () => {
    const said = runSteady(5000, 0.33, 'km').map((s) => s.text)
    expect(said.filter((t) => t.startsWith('Kilometre'))).toHaveLength(4)
    expect(said).toContain('500 metres to go. Finish strong.')
  })

  it('keeps quiet about halfway on a very short run', () => {
    const said = runSteady(1500, 0.33, 'km').map((s) => s.text)
    expect(said.some((t) => t.startsWith('Halfway'))).toBe(false)
  })

  it('announces only the latest split after a jump', () => {
    const out = coachCues({ distanceAlong: 3.1 * MILE, total: 5 * MILE, movingSeconds: 1700, unit: 'mi', state: INITIAL_COACH })
    const splits = out.cues.filter((t) => t.startsWith('Mile'))
    expect(splits).toHaveLength(1)
    expect(splits[0]).toMatch(/^Mile 3\./)
    expect(out.state.splits).toBe(3)
  })

  it('does not repeat itself when progress stands still', () => {
    let state = INITIAL_COACH
    const first = coachCues({ distanceAlong: MILE + 5, total: 5 * MILE, movingSeconds: 560, unit: 'mi', state })
    state = first.state
    const again = coachCues({ distanceAlong: MILE + 6, total: 5 * MILE, movingSeconds: 561, unit: 'mi', state })
    expect(first.cues).toHaveLength(1)
    expect(again.cues).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import { achievementsFor } from './achievements'
import type { RunRecord } from './runHistory'
import { METERS_PER_MILE } from './units'

const now = new Date(2026, 8, 10, 12)
const run = (id: string, daysAgo: number, distance: number, movingSeconds: number): RunRecord => ({
  id,
  finishedAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(),
  distance,
  movingSeconds,
  gain: 0,
  completed: true,
})
const ids = (list: { id: string }[]) => list.map((a) => a.id)

describe('achievementsFor', () => {
  it('celebrates the very first run', () => {
    expect(ids(achievementsFor(run('a', 0, 3000, 1000), [], 'mi', now))).toEqual(['first-run'])
  })

  it('spots a longest run and a fastest pace', () => {
    const history = [run('old', 3, 5000, 1800)]
    const earned = ids(achievementsFor(run('new', 0, 6000, 2000), history, 'mi', now))
    expect(earned).toContain('longest')
    expect(earned).toContain('fastest')
  })

  it('ignores pace on runs too short to count', () => {
    const history = [run('old', 3, 5000, 1800)]
    expect(ids(achievementsFor(run('new', 0, 1000, 100), history, 'mi', now))).not.toContain('fastest')
  })

  it('names the biggest new race distance only', () => {
    const history = [run('old', 3, 3000, 1000)]
    const earned = ids(achievementsFor(run('new', 0, 10500, 3600), history, 'km', now))
    expect(earned).toContain('first-10k')
    expect(earned).not.toContain('first-5k')
  })

  it('marks lifetime distance milestones as they are crossed', () => {
    const history = [run('old', 3, 9 * METERS_PER_MILE, 5000)]
    expect(ids(achievementsFor(run('new', 0, 2 * METERS_PER_MILE, 1100), history, 'mi', now))).toContain('lifetime-10')
  })

  it('announces a streak on the first run of the week', () => {
    const history = [run('w1', 7, 5000, 1800), run('w2', 14, 5000, 1800)]
    const earned = achievementsFor(run('new', 0, 3000, 1000), history, 'mi', now)
    expect(earned.find((a) => a.id === 'streak')?.title).toBe('3-week streak')
    // A second run the same week isn't news.
    const again = achievementsFor(run('new2', 0, 3000, 1000), [run('new', 0, 3000, 1000), ...history], 'mi', now)
    expect(ids(again)).not.toContain('streak')
  })

  it('does not count the run against itself when re-saved', () => {
    const self = run('same', 0, 5000, 1800)
    expect(ids(achievementsFor(self, [self], 'mi', now))).toEqual(['first-run'])
  })
})

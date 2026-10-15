import {
  addGoal,
  addStep,
  dayKey,
  dayLabel,
  dropBlankSteps,
  editGoal,
  editStep,
  emptyPlan,
  isBlankGoal,
  isInPlay,
  markLabel,
  moveStep,
  normalizePlan,
  orionPlan,
  removeGoal,
  removeStep,
  samePlan,
  setStatus,
  STARTED,
  STATUSES,
  stepProgress,
  toggleStep,
  type Plan,
} from './plan'

const goal = (p: Plan, id: string) => p.goals.find((g) => g.id === id)!

describe("Orion's plan", () => {
  it('opens on 10% bodyfat and finding the dream, both in progress since the plan started', () => {
    const p = orionPlan()
    expect(p.goals.map((g) => g.title)).toEqual(['10% bodyfat', 'Find my dream'])
    for (const g of p.goals) {
      expect(g.status).toBe('active')
      expect(g.log).toEqual([{ status: 'active', on: STARTED, note: '' }])
      expect(g.finish).not.toBe('')
      expect(g.approach).not.toBe('')
      expect(g.steps).toHaveLength(8)
      expect(g.steps.every((s) => s.text && s.detail && !s.done)).toBe(true)
    }
    expect(goal(p, 'bodyfat').steps[0].text).toBe('Get a starting number')
    expect(goal(p, 'dream').steps.at(-1)!.text).toBe('Commit to the winner')
  })

  it('has an id for every goal and step, none repeated', () => {
    const ids = orionPlan().goals.flatMap((g) => [g.id, ...g.steps.map((s) => s.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('counts the steps done across the goals in play', () => {
    let p = orionPlan()
    expect(stepProgress(p.goals)).toEqual({ done: 0, total: 16 })
    p = toggleStep(p, 'bodyfat', 'bodyfat-1')
    p = toggleStep(p, 'dream', 'dream-2')
    expect(stepProgress(p.goals)).toEqual({ done: 2, total: 16 })
    p = setStatus(p, 'dream', 'scrapped', '2026-11-01')
    expect(stepProgress(p.goals.filter(isInPlay))).toEqual({ done: 1, total: 8 })
  })
})

describe('days', () => {
  it('keys a day on this device and writes it out', () => {
    expect(dayKey(new Date(2026, 9, 15, 23, 59))).toBe('2026-10-15')
    expect(dayKey(new Date(2027, 0, 3))).toBe('2027-01-03')
    expect(dayLabel('2026-10-15')).toBe('Oct 15, 2026')
    expect(dayLabel('2027-01-03')).toBe('Jan 3, 2027')
    expect(dayLabel('')).toBe('')
    expect(dayLabel('2026-13-01')).toBe('')
  })
})

describe('where a goal stands', () => {
  it('goes from in progress to changed, complete or scrapped at any time, and back', () => {
    let p = orionPlan()
    p = setStatus(p, 'bodyfat', 'changed', '2026-11-02', '  Aiming for 12% first ')
    expect(goal(p, 'bodyfat').status).toBe('changed')
    expect(isInPlay(goal(p, 'bodyfat'))).toBe(true)
    p = setStatus(p, 'bodyfat', 'complete', '2027-03-01')
    expect(isInPlay(goal(p, 'bodyfat'))).toBe(false)
    p = setStatus(p, 'bodyfat', 'active', '2027-03-02', 'Slipped back to 12%')
    p = setStatus(p, 'bodyfat', 'scrapped', '2027-04-01', 'Not worth it')
    const log = goal(p, 'bodyfat').log
    expect(log).toEqual([
      { status: 'active', on: STARTED, note: '' },
      { status: 'changed', on: '2026-11-02', note: 'Aiming for 12% first' },
      { status: 'complete', on: '2027-03-01', note: '' },
      { status: 'active', on: '2027-03-02', note: 'Slipped back to 12%' },
      { status: 'scrapped', on: '2027-04-01', note: 'Not worth it' },
    ])
    expect(log.map((_, i) => markLabel(log, i))).toEqual(['Started', 'Changed', 'Completed', 'Back in progress', 'Scrapped'])
    // The other goal is untouched.
    expect(goal(p, 'dream')).toEqual(goal(orionPlan(), 'dream'))
  })

  it('changes nothing when marked what it already is', () => {
    const p = orionPlan()
    expect(setStatus(p, 'bodyfat', 'active', '2026-11-02', 'again')).toBe(p)
    expect(setStatus(p, 'nope', 'complete', '2026-11-02')).toBe(p)
  })

  it('has words for marking each status', () => {
    expect(STATUSES.map((s) => s.label)).toEqual(['In progress', 'Changed', 'Complete', 'Scrapped'])
    expect(STATUSES.every((s) => s.prompt && s.action)).toBe(true)
  })
})

describe('steps', () => {
  it('ticks a step and unticks it', () => {
    let p = toggleStep(orionPlan(), 'bodyfat', 'bodyfat-3')
    expect(goal(p, 'bodyfat').steps[2].done).toBe(true)
    p = toggleStep(p, 'bodyfat', 'bodyfat-3')
    expect(goal(p, 'bodyfat').steps[2].done).toBe(false)
  })

  it('adds, edits, moves and removes steps', () => {
    let [p, id] = addStep(orionPlan(), 'dream')
    expect(goal(p, 'dream').steps).toHaveLength(9)
    p = editStep(p, 'dream', id, { text: 'Pitch it to one person', detail: 'Out loud.' })
    expect(goal(p, 'dream').steps.at(-1)).toEqual({ id, text: 'Pitch it to one person', detail: 'Out loud.', done: false })
    p = moveStep(p, 'dream', id, -1)
    expect(goal(p, 'dream').steps.map((s) => s.id).slice(-2)).toEqual([id, 'dream-8'])
    // Nowhere to go past either end.
    const first = goal(p, 'dream').steps[0].id
    expect(moveStep(p, 'dream', first, -1)).toBe(p)
    expect(moveStep(p, 'dream', 'dream-8', 1)).toBe(p)
    p = removeStep(p, 'dream', id)
    expect(goal(p, 'dream').steps.map((s) => s.id)).toEqual(goal(orionPlan(), 'dream').steps.map((s) => s.id))
    expect(removeStep(p, 'dream', 'gone')).toBe(p)
  })

  it("doesn't keep steps left empty", () => {
    let [p] = addStep(orionPlan(), 'bodyfat')
    let kept: string
    ;[p, kept] = addStep(p, 'bodyfat')
    p = editStep(p, 'bodyfat', kept, { detail: 'Only a detail' })
    p = dropBlankSteps(p, 'bodyfat')
    expect(goal(p, 'bodyfat').steps).toHaveLength(9)
    expect(goal(p, 'bodyfat').steps.at(-1)!.id).toBe(kept)
    expect(dropBlankSteps(p, 'bodyfat')).toBe(p)
  })
})

describe('goals', () => {
  it('adds a blank goal at the end, started today, and removes goals', () => {
    let [p, id] = addGoal(orionPlan(), '2026-12-01')
    const g = goal(p, id)
    expect(p.goals.at(-1)).toBe(g)
    expect(g.status).toBe('active')
    expect(g.log).toEqual([{ status: 'active', on: '2026-12-01', note: '' }])
    expect(isBlankGoal(g)).toBe(true)
    p = editGoal(p, id, { title: 'Run a sub-1:40 half' })
    expect(isBlankGoal(goal(p, id))).toBe(false)
    p = removeGoal(p, id)
    expect(samePlan(p, orionPlan())).toBe(true)
    expect(removeGoal(p, id)).toBe(p)
  })

  it('counts a goal with only empty steps as blank', () => {
    let [p, id] = addGoal(emptyPlan(), '2026-12-01')
    ;[p] = addStep(p, id)
    expect(isBlankGoal(goal(p, id))).toBe(true)
  })
})

describe('reading a saved plan', () => {
  it('reads back what it saved', () => {
    let p = setStatus(orionPlan(), 'dream', 'changed', '2026-11-20', 'Narrowed to three')
    p = toggleStep(p, 'dream', 'dream-1')
    const back = normalizePlan(JSON.parse(JSON.stringify({ version: 1, ...p, savedAt: 'x' })))
    expect(samePlan(back, p)).toBe(true)
  })

  it('is not fooled by things that are not a plan', () => {
    expect(normalizePlan(null)).toBeNull()
    expect(normalizePlan('plan')).toBeNull()
    expect(normalizePlan([])).toBeNull()
    expect(normalizePlan({})).toEqual(emptyPlan())
    expect(normalizePlan({ goals: 'lots' })).toEqual(emptyPlan())
  })

  it('fills in a goal written by hand', () => {
    const p = normalizePlan({
      goals: [
        { title: 'Learn Spanish', steps: ['Duolingo daily', { text: 'Book a tutor', done: true }, 7] },
        { id: 'run', title: 'Sub-1:40 half', status: 'complete', log: [{ status: 'active', on: '2026-10-01' }] },
        { id: 'run', title: 'Same id', status: 'wishful', log: [{ status: 'maybe' }] },
      ],
    })!
    const [spanish, run, twin] = p.goals
    expect(spanish.id).toMatch(/^[\w-]+$/)
    expect(spanish.status).toBe('active')
    expect(spanish.log).toEqual([{ status: 'active', on: '', note: '' }])
    expect(spanish.steps.map((s) => [s.text, s.done])).toEqual([
      ['Duolingo daily', false],
      ['Book a tutor', true],
    ])
    expect(new Set(spanish.steps.map((s) => s.id)).size).toBe(2)
    // The history ends on the status it says it has.
    expect(run.log).toEqual([
      { status: 'active', on: '2026-10-01', note: '' },
      { status: 'complete', on: '', note: '' },
    ])
    expect(twin.id).not.toBe('run')
    expect(twin.status).toBe('active')
    expect(twin.log).toEqual([{ status: 'active', on: '', note: '' }])
  })

  it('keeps text to a sensible length', () => {
    const p = normalizePlan({ goals: [{ title: 'x'.repeat(500), approach: 'y'.repeat(5000) }] })!
    expect(p.goals[0].title).toHaveLength(200)
    expect(p.goals[0].approach).toHaveLength(2000)
  })
})

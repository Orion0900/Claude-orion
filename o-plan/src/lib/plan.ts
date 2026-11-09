/**
 * The plan: Orion's goals, each with what done looks like (the finish
 * line), the plan of attack to get there step by step, and where it stands.
 * A goal is in progress until it's marked changed, complete or scrapped,
 * and any of those can be changed again at any time. Every mark is kept with
 * its day and a note, so each goal remembers how it got where it is.
 * Everything here is plain data and pure functions, so the screens and the
 * tests share one set of rules.
 */

export type Status = 'active' | 'changed' | 'complete' | 'scrapped'

/** In the order the picker shows them, with the words for marking each. */
export const STATUSES: { id: Status; label: string; prompt: string; action: string }[] = [
  { id: 'active', label: 'In progress', prompt: 'What brought it back?', action: 'Put back in progress' },
  { id: 'changed', label: 'Changed', prompt: 'What changed?', action: 'Mark changed' },
  { id: 'complete', label: 'Complete', prompt: 'What did it take?', action: 'Mark complete' },
  { id: 'scrapped', label: 'Scrapped', prompt: 'Why scrap it?', action: 'Scrap it' },
]

const isStatus = (v: unknown): v is Status => STATUSES.some((s) => s.id === v)

export const statusOf = (id: Status) => STATUSES.find((s) => s.id === id)!

export interface Step {
  id: string
  /** What to do: "Find your maintenance calories". */
  text: string
  /** How, or why, in a line or two. */
  detail: string
  done: boolean
}

/** One change of status, kept for the goal's history. */
export interface Mark {
  status: Status
  /** The day it was made, "2026-10-15"; empty when it isn't known. */
  on: string
  note: string
}

export interface Goal {
  id: string
  title: string
  /** What done looks like. */
  finish: string
  /** The plan of attack in a sentence or two. */
  approach: string
  steps: Step[]
  status: Status
  /** Every status it's had, oldest first. The first is when it started. */
  log: Mark[]
}

export interface Plan {
  goals: Goal[]
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// ------------------------------------------------------------------ days

/** A day on this device as "2026-10-15". */
export function dayKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-10-15" as "Oct 15, 2026"; empty for anything else. */
export function dayLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined
  return m && month ? `${month} ${Number(m[3])}, ${m[1]}` : ''
}

// ----------------------------------------------------------- Orion's plan

/** The day O-Plan was set up, when both goals started. */
export const STARTED = '2026-10-15'

const steps = (goal: string, list: [string, string][]): Step[] =>
  list.map(([text, detail], i) => ({ id: `${goal}-${i + 1}`, text, detail, done: false }))

/** Orion's goals as first written down: 10% bodyfat and finding the dream. */
export function orionPlan(): Plan {
  return {
    goals: [
      {
        id: 'bodyfat',
        title: '10% bodyfat',
        finish: '10% or under on a DEXA scan.',
        approach:
          'Lose the fat slowly enough to keep the muscle: a steady deficit, protein at every meal, heavy lifting, steps and sleep, with a check-in every week so the numbers decide what changes.',
        steps: steps('bodyfat', [
          [
            'Get a starting number',
            'A DEXA scan if you can, or the same smart scale at the same time each morning. Add front, side and back photos and your waist at the navel.',
          ],
          ['Find your maintenance calories', "Log everything you eat for two weeks without changing a thing. If your weight holds, that's maintenance."],
          ['Eat 300–500 under maintenance', 'Lose 0.5–1% of your bodyweight a week; any faster costs muscle. Eat more on half marathon Saturdays.'],
          ['Hit your protein every day', '0.8–1 g per pound of bodyweight. Build every meal around it: it keeps you full and keeps the muscle.'],
          ['Keep lifting heavy', 'The 92 Hard lifts cover it. If the weight on the bar holds or climbs, the muscle is staying.'],
          ['Walk 10k steps and sleep 7–9 hours', 'Steps burn fat without eating into recovery. Short sleep makes you hungrier and costs muscle.'],
          [
            'Check in every Sunday',
            "Compare this week's average weight and waist to last week's. Flat for two weeks? Take off 100–200 calories or add 2,000 steps.",
          ],
          ['Re-measure every 8 weeks', 'Same scan, same conditions. Worn down? Take a week at maintenance, then pick the deficit back up.'],
        ]),
        status: 'active',
        log: [{ status: 'active', on: STARTED, note: '' }],
      },
      {
        id: 'dream',
        title: 'Find my dream',
        finish: "One sentence you'd bet the next five years on, with the first project already started.",
        approach:
          'Find it the way you would research anything: notice what pulls at you, test the strongest pulls with small real projects, and commit to the one that keeps winning.',
        steps: steps('dream', [
          [
            'Keep an energy log for 30 days',
            'Two lines a night, or the end of the daily vlog: what gave you energy today, and what drained it. Patterns show up by week three.',
          ],
          ['List the times you lost track of time', 'Go back to childhood. What were you doing, who was it for, and what did you make?'],
          [
            'Write your perfect ordinary Tuesday, 10 years out',
            "Where you wake up, who's around and what fills the day, in detail. Leave job titles out.",
          ],
          ['Talk to five people living a life you want', 'Ask how they got there and what an ordinary day is really like.'],
          ['Try one new thing every week', 'A class, an event, a side project, or a book from a field you know nothing about.'],
          ['Shortlist three directions', 'Pick them from the log and the conversations, then score each on energy, skill and meaning.'],
          ['Run a 30-day experiment on each', 'Make something real: build it, teach it, sell it or do it for someone. Write down how each week felt.'],
          ['Commit to the winner', 'Write the dream in one sentence, set a 90-day goal for it, and add that goal here.'],
        ]),
        status: 'active',
        log: [{ status: 'active', on: STARTED, note: '' }],
      },
    ],
  }
}

export const emptyPlan = (): Plan => ({ goals: [] })

// ------------------------------------------------------------- reading it

/** In play: in progress, or changed and still going. */
export const isInPlay = (g: Goal) => g.status === 'active' || g.status === 'changed'

/** Steps done out of all the steps, across the goals given. */
export function stepProgress(goals: Goal[]): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const g of goals) {
    total += g.steps.length
    done += g.steps.filter((s) => s.done).length
  }
  return { done, total }
}

/** What a mark in the history says: "Started", "Changed", "Back in progress". */
export function markLabel(log: Mark[], i: number): string {
  const mark = log[i]
  if (!mark) return ''
  if (mark.status === 'active') return i === 0 ? 'Started' : 'Back in progress'
  return mark.status === 'complete' ? 'Completed' : statusOf(mark.status).label
}

/** A goal opened, left blank and closed again isn't kept. */
export const isBlankGoal = (g: Goal) =>
  !g.title.trim() && !g.finish.trim() && !g.approach.trim() && g.steps.every((s) => !s.text.trim() && !s.detail.trim())

const isBlankStep = (s: Step) => !s.text.trim() && !s.detail.trim()

// ------------------------------------------------------------------ edits

/** Changes one goal, leaving the plan as it was when nothing changes. */
function withGoal(p: Plan, id: string, change: (g: Goal) => Goal): Plan {
  let changed = false
  const goals = p.goals.map((g) => {
    if (g.id !== id) return g
    const next = change(g)
    if (next !== g) changed = true
    return next
  })
  return changed ? { ...p, goals } : p
}

/** A new, blank goal at the end of the plan, started on `on`. */
export function addGoal(p: Plan, on: string): [Plan, string] {
  const goal: Goal = {
    id: newId(),
    title: '',
    finish: '',
    approach: '',
    steps: [],
    status: 'active',
    log: [{ status: 'active', on, note: '' }],
  }
  return [{ ...p, goals: [...p.goals, goal] }, goal.id]
}

export const removeGoal = (p: Plan, id: string): Plan =>
  p.goals.some((g) => g.id === id) ? { ...p, goals: p.goals.filter((g) => g.id !== id) } : p

export type GoalText = Partial<Pick<Goal, 'title' | 'finish' | 'approach'>>

export const editGoal = (p: Plan, id: string, patch: GoalText): Plan => withGoal(p, id, (g) => ({ ...g, ...patch }))

/**
 * Marks a goal in progress, changed, complete or scrapped, from whatever it
 * was, keeping the mark with the day and a note. Marking a goal what it
 * already is changes nothing.
 */
export const setStatus = (p: Plan, id: string, status: Status, on: string, note = ''): Plan =>
  withGoal(p, id, (g) => (g.status === status ? g : { ...g, status, log: [...g.log, { status, on, note: note.trim() }] }))

const withSteps = (p: Plan, goalId: string, change: (steps: Step[]) => Step[]): Plan =>
  withGoal(p, goalId, (g) => {
    const next = change(g.steps)
    return next === g.steps ? g : { ...g, steps: next }
  })

export const toggleStep = (p: Plan, goalId: string, stepId: string): Plan =>
  withSteps(p, goalId, (steps) => steps.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s)))

/** A new, blank step at the end of the goal's plan. */
export function addStep(p: Plan, goalId: string): [Plan, string] {
  const step: Step = { id: newId(), text: '', detail: '', done: false }
  return [withSteps(p, goalId, (steps) => [...steps, step]), step.id]
}

export const editStep = (p: Plan, goalId: string, stepId: string, patch: Partial<Pick<Step, 'text' | 'detail'>>): Plan =>
  withSteps(p, goalId, (steps) => steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)))

export const removeStep = (p: Plan, goalId: string, stepId: string): Plan =>
  withSteps(p, goalId, (steps) => (steps.some((s) => s.id === stepId) ? steps.filter((s) => s.id !== stepId) : steps))

/** Moves a step one place earlier (-1) or later (1) in the plan. */
export const moveStep = (p: Plan, goalId: string, stepId: string, by: -1 | 1): Plan =>
  withSteps(p, goalId, (steps) => {
    const from = steps.findIndex((s) => s.id === stepId)
    const to = from + by
    if (from < 0 || to < 0 || to >= steps.length) return steps
    const next = [...steps]
    ;[next[from], next[to]] = [next[to], next[from]]
    return next
  })

/** Steps added and left empty aren't kept when the goal is closed. */
export const dropBlankSteps = (p: Plan, goalId: string): Plan =>
  withSteps(p, goalId, (steps) => (steps.some(isBlankStep) ? steps.filter((s) => !isBlankStep(s)) : steps))

// ------------------------------------------------------------ from storage

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const textOf = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
const dayOf = (v: unknown) => (typeof v === 'string' && dayLabel(v) ? v : '')
const idOf = (v: unknown, seen: Set<string>) => {
  const id = typeof v === 'string' && /^[\w-]{1,40}$/.test(v) && !seen.has(v) ? v : newId()
  seen.add(id)
  return id
}

/**
 * Turns whatever was saved (by this version, or a hand edit of the shared
 * copy) into a plan the screens can trust. A step may be given as plain
 * text; a missing status is in progress, and the history always starts
 * somewhere and ends on the goal's status. Null when it isn't a plan at all.
 */
export function normalizePlan(raw: unknown): Plan | null {
  if (!isObject(raw)) return null
  const seen = new Set<string>()
  const goals = (Array.isArray(raw.goals) ? raw.goals : []).filter(isObject).map((g): Goal => {
    const status = isStatus(g.status) ? g.status : 'active'
    const log: Mark[] = (Array.isArray(g.log) ? g.log : [])
      .filter(isObject)
      .filter((m) => isStatus(m.status))
      .map((m) => ({ status: m.status as Status, on: dayOf(m.on), note: textOf(m.note, 1000) }))
    if (!log.length) log.push({ status: 'active', on: '', note: '' })
    if (log[log.length - 1].status !== status) log.push({ status, on: '', note: '' })
    return {
      id: idOf(g.id, seen),
      title: textOf(g.title),
      finish: textOf(g.finish, 500),
      approach: textOf(g.approach, 2000),
      steps: (Array.isArray(g.steps) ? g.steps : [])
        .map((s) => (typeof s === 'string' ? { text: s } : s))
        .filter(isObject)
        .map((s) => ({ id: idOf(s.id, seen), text: textOf(s.text, 300), detail: textOf(s.detail, 1000), done: s.done === true })),
      status,
      log,
    }
  })
  return { goals }
}

/** Same goals, words, ticks and order: a copy that changes nothing on screen. */
export function samePlan(a: Plan | null, b: Plan | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

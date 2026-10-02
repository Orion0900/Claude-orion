/**
 * The rest of the whiteboard: the routine, what happiness is made of, the
 * offer, and why. Times are minutes after midnight.
 */

export const WHY = '10 yrs from now I want to say I went for it.'

export const HAPPINESS: readonly string[] = ['Quest', 'Fitness', 'Magic', 'Loved Ones']

export const OFFER = { lead: 'FREE,', rest: 'in exchange for a review if I provide $50K worth of value' }

export interface Slot {
  what: string
  /** Null for "X:00": a time still to be picked. */
  start: number | null
  end?: number
  note?: string
}

const at = (h: number, m = 0) => h * 60 + m

export const SLEEP: Slot & { start: number; end: number } = { what: 'Sleep', start: at(20, 30), end: at(4, 30) }

export interface RoutineGroup {
  label: string
  /** 0 is Sunday. */
  days: readonly number[]
  slots: readonly Slot[]
}

export const ROUTINE: readonly RoutineGroup[] = [
  {
    label: 'M–F',
    days: [1, 2, 3, 4, 5],
    slots: [
      { what: 'Gym', start: at(5), end: at(6) },
      { what: 'Maker School', start: at(7), end: at(8, 30) },
      {
        what: 'Work',
        start: at(9),
        end: at(17),
        note: "Going in at 9 feels okay if I have a work mission and I'm crushing it.",
      },
    ],
  },
  {
    label: 'Saturday',
    days: [6],
    slots: [
      { what: 'Maker School', start: at(6, 30) },
      { what: 'Half Marathon', start: at(9, 30) },
      { what: 'Date Night', start: null },
    ],
  },
  {
    label: 'Sunday',
    days: [0],
    slots: [
      { what: 'Maker School', start: at(6, 30) },
      { what: 'Magic', start: at(12) },
      { what: 'Friends & Family Dinner', start: at(17, 30) },
    ],
  },
]

export function groupFor(weekday: number): RoutineGroup {
  return ROUTINE.find((group) => group.days.includes(weekday)) ?? ROUTINE[0]
}

/**
 * What the routine says is going on now and what's next, for a weekday and a
 * time. Only slots with an end can be "now"; one with no time yet comes after
 * the timed ones, and the night ends in sleep.
 */
export function upNext(weekday: number, minutes: number): { now: Slot | null; next: Slot } {
  const slots = groupFor(weekday).slots
  if (minutes < SLEEP.end) return { now: SLEEP, next: slots[0] }
  if (minutes >= SLEEP.start) return { now: SLEEP, next: groupFor((weekday + 1) % 7).slots[0] }
  const now = slots.find((s) => s.start !== null && s.end !== undefined && s.start <= minutes && minutes < s.end) ?? null
  const next = slots.find((s) => s.start !== null && s.start > minutes) ?? slots.find((s) => s.start === null) ?? SLEEP
  return { now, next }
}

/** "5:00 AM" */
export function clock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/** "5:00–6:00 AM", or "9:00 AM–5:00 PM" when it crosses noon. */
export function timeSpan(start: number, end: number): string {
  const [a, am] = clock(start).split(' ')
  const [b, bm] = clock(end).split(' ')
  return am === bm ? `${a}–${b} ${bm}` : `${a} ${am}–${b} ${bm}`
}

/** How a slot's time is written in the routine: a span, a start, or "X:00" as on the board. */
export function slotTime(slot: Slot): string {
  if (slot.start === null) return 'X:00'
  return slot.end === undefined ? clock(slot.start) : timeSpan(slot.start, slot.end)
}

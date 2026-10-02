import { FACE_SHAPES } from '../face/faceShape'
import { FRONT_SPECS, type MetricSpec } from '../face/metrics/ideals'
import type { GroupId } from '../face/metrics/types'
import { PROFILE_SPECS } from '../face/profile'
import type { SymmetryFinding } from '../face/symmetry'
import type { Sex } from '../face/types'
import { GROUP_TEXT } from './groups'
import { METRIC_TEXT } from './metrics'
import { SHAPE_TEXT } from './shapes'
import { FINDING_TEXT } from './symmetry'
import type { FindingText, Outcome } from './types'

/** The result keys each metric can produce; graded metrics not listed give ideal, low or high. */
const KEYS: Record<string, string[]> = {
  thirds: ['balanced', 'upper-long', 'upper-short', 'middle-long', 'middle-short', 'lower-long', 'lower-short'],
  fifths: ['balanced', 'outer-wide', 'outer-narrow', 'eyes-wide', 'eyes-narrow', 'middle-wide', 'middle-narrow'],
  faceIndex: ['broad', 'medium', 'long', 'very-long'],
  eyeShape: ['narrow', 'almond', 'open', 'round'],
  browPosition: ['low', 'medium', 'high'],
  browTilt: ['rising', 'falling', 'arched', 'soft', 'straight'],
}
const SPECS: Record<string, MetricSpec> = { ...FRONT_SPECS, ...PROFILE_SPECS }
const IDS = Object.keys(SPECS)
const keysOf = (id: string) => KEYS[id] ?? ['ideal', 'low', 'high']
/** Descriptive measures have no ideal range: they describe rather than grade. */
const descriptive = (id: string) => !SPECS[id].ideal
const IDEAL_KEYS = new Set(['ideal', 'balanced'])

const GROUPS: GroupId[] = ['proportions', 'eyes', 'nose', 'lips', 'jaw', 'symmetry', 'profile']
const FINDINGS: SymmetryFinding['id'][] = ['eyeLevel', 'browLevel', 'mouthTilt', 'noseDeviation', 'chinDeviation', 'eyeSize', 'faceHalves']
const SEXES: Sex[] = ['female', 'male']
const SIDES = ['right', 'left'] as const

/** Matched at the start of a word, so inflections ("flaws", "fixing") are caught too. */
const BANNED = /\b(flaw|ugly|unattractive|defect|deform|abnormal|bad|wrong|fix|perfect face|mog|looksmax|mewing)/i
const AMERICAN = /\b(color|center|favor|gray|meter|millimeter|centimeter|mustache|behavior|fiber|aging|analyz|emphasiz|minimiz|maximiz|realiz|recogniz|harmoniz|optimiz|stabiliz|neutraliz|personaliz|characteriz)|\btoward\b/i
const FACIAL_HAIR = /\b(beard|moustache|stubble|goatee)/i
const CLINICAL_PHRASING = /^(Options a specialist might discuss include|Clinics offer) /

const words = (s: string) => s.split(/\s+/).filter(Boolean).length
const visible = (o: Outcome, sex: Sex) => o.advice.filter((a) => !a.only || a.only === sex)
const outcomes = () => Object.entries(METRIC_TEXT).flatMap(([id, m]) => Object.entries(m.outcomes).map(([key, o]) => ({ id, key, o, label: `${id}:${key}` })))

/** Every string reachable from a value, with describe() run for both sides. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (typeof value === 'function') return SIDES.map((side) => (value as FindingText['describe'])('1.8 mm', side))
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

/** Text meant to be read as sentences: everything but titles, names and verdicts. */
const prose = [
  ...Object.values(METRIC_TEXT).flatMap((m) => [m.measures, m.why, ...(m.note ? [m.note] : []), ...Object.values(m.outcomes).flatMap((o) => [o.meaning, ...o.advice.map((a) => a.text)])]),
  ...Object.values(GROUP_TEXT).map((g) => g.intro),
  ...Object.values(SHAPE_TEXT).flatMap((s) => [s.description, ...s.hair.female, ...s.hair.male, ...s.glasses, ...s.beard, ...s.makeup]),
  ...Object.values(FINDING_TEXT).map((f) => f.tip),
]

describe('metric text', () => {
  it('covers every measured metric, and only those', () => {
    expect(Object.keys(METRIC_TEXT).sort()).toEqual([...IDS].sort())
  })

  it.each(IDS)('%s has words for every result key', (id) => {
    const m = METRIC_TEXT[id]
    expect(Object.keys(m.outcomes).sort()).toEqual([...keysOf(id)].sort())
    expect(m.title).toBeTruthy()
    // One plain sentence.
    expect(m.measures.slice(0, -1)).not.toMatch(/[.!?]\s/)
  })

  it('keeps verdicts to a short chip in sentence case', () => {
    for (const { o, label } of outcomes()) {
      expect(o.verdict.length, label).toBeLessThanOrEqual(28)
      expect(words(o.verdict), label).toBeLessThanOrEqual(4)
      expect(o.verdict, label).toMatch(/^[A-Z][^A-Z.]*$/)
    }
  })

  it('keeps each piece of advice short', () => {
    for (const { o, label } of outcomes()) {
      for (const a of o.advice) {
        expect(a.text.length, `${label}: ${a.text}`).toBeLessThanOrEqual(160)
        expect(words(a.text), `${label}: ${a.text}`).toBeLessThanOrEqual(25)
      }
    }
  })

  it('sizes the advice to the result, for either comparison', () => {
    for (const { id, key, o, label } of outcomes()) {
      const graded = !descriptive(id)
      const [min, max] = !graded ? [1, 3] : IDEAL_KEYS.has(key) ? [0, 2] : [3, 5]
      for (const sex of SEXES) {
        const shown = visible(o, sex)
        expect(shown.length, `${label} (${sex})`).toBeGreaterThanOrEqual(min)
        expect(shown.length, `${label} (${sex})`).toBeLessThanOrEqual(max)
        // Steps for a result outside the range mix more than one kind.
        if (graded && !IDEAL_KEYS.has(key)) expect(new Set(shown.map((a) => a.kind)).size, `${label} (${sex})`).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('keeps clinical options informational, and out of descriptive measures', () => {
    for (const { id, o, label } of outcomes()) {
      const clinical = o.advice.filter((a) => a.kind === 'clinical')
      expect(clinical.length, label).toBeLessThanOrEqual(descriptive(id) ? 0 : 2)
      for (const a of clinical) expect(a.text, label).toMatch(CLINICAL_PHRASING)
    }
  })

  it('shows facial-hair advice only for the male comparison', () => {
    for (const { o, label } of outcomes()) {
      for (const a of o.advice) if (FACIAL_HAIR.test(a.text)) expect(a.only, `${label}: ${a.text}`).toBe('male')
    }
  })

  it('notes that nose width varies with ancestry', () => {
    expect(METRIC_TEXT.noseWidth.note).toMatch(/ancestry/)
  })
})

describe('group text', () => {
  it.each(GROUPS)('%s has a title and an intro', (id) => {
    expect(GROUP_TEXT[id].title).toBeTruthy()
    expect(GROUP_TEXT[id].intro).toBeTruthy()
  })
})

describe('face shape text', () => {
  it.each([...FACE_SHAPES])('%s has 3–5 short ideas in every list', (shape) => {
    const s = SHAPE_TEXT[shape]
    expect(s.name).toBeTruthy()
    const lists = { 'female hair': s.hair.female, 'male hair': s.hair.male, glasses: s.glasses, beard: s.beard, makeup: s.makeup }
    for (const [name, list] of Object.entries(lists)) {
      expect(list.length, `${shape} ${name}`).toBeGreaterThanOrEqual(3)
      expect(list.length, `${shape} ${name}`).toBeLessThanOrEqual(5)
      for (const item of list) expect(words(item), item).toBeLessThanOrEqual(20)
    }
  })
})

describe('symmetry finding text', () => {
  it.each(FINDINGS)('%s describes the difference in one sentence', (id) => {
    const f = FINDING_TEXT[id]
    expect(f.title).toBeTruthy()
    expect(f.tip).toBeTruthy()
    for (const side of SIDES) {
      const s = f.describe('1.8 mm', side)
      expect(s).toContain('1.8 mm')
      expect(s).toContain(side)
      expect(s).toMatch(/^[A-Z].*\.$/)
      expect(s.slice(0, -1)).not.toMatch(/[.!?]\s/)
    }
  })

  it('names the other side where it compares the two', () => {
    expect(FINDING_TEXT.eyeLevel.describe('1.8 mm', 'left')).toBe('Your left eye sits 1.8 mm higher than your right.')
  })
})

describe('house style', () => {
  const all = strings([METRIC_TEXT, GROUP_TEXT, SHAPE_TEXT, FINDING_TEXT])

  it('never uses demeaning or pseudo-scientific words', () => {
    for (const s of all) expect(s).not.toMatch(BANNED)
  })

  it('uses British spelling', () => {
    for (const s of all) expect(s).not.toMatch(AMERICAN)
  })

  it('writes prose as tidy, complete sentences', () => {
    for (const s of prose) {
      expect(s, s).toMatch(/^[A-Z].*\.$/)
      expect(s, s).not.toMatch(/\s{2}|\s$|^\s/)
    }
  })
})

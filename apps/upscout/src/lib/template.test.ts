import { describe, expect, it } from 'vitest'
import { makeJob, makeProfile, NOW } from './__fixtures__/jobs'
import { scoreJob } from './scoring'
import { buildContext, draftLetter, formatBudget, missingPlaceholders, pickTemplate, render, STARTER_TEMPLATE } from './template'
import type { Template } from './types'

const profile = makeProfile()

const template = (overrides: Partial<Template> = {}): Template => ({
  id: 't1',
  name: 'General',
  body: 'Hi about {{job.title}}',
  matchKeywords: [],
  isDefault: true,
  ...overrides,
})

describe('render', () => {
  it('substitutes values', () => {
    expect(render('Hi {{me.name}}', { 'me.name': 'Sam' })).toBe('Hi Sam')
  })

  it('leaves nothing behind for an unknown placeholder', () => {
    expect(render('Hi {{nope}}!', {})).toBe('Hi !')
  })

  it('keeps a section only when its value is there', () => {
    expect(render('{{#a}}yes {{a}}{{/a}}', { a: 'x' })).toBe('yes x')
    expect(render('{{#a}}yes{{/a}}', { a: '   ' })).toBe('')
    expect(render('{{^a}}nothing{{/a}}', {})).toBe('nothing')
    expect(render('{{^a}}nothing{{/a}}', { a: 'x' })).toBe('')
  })

  it('handles nested sections', () => {
    expect(render('{{#a}}A{{#b}}B{{/b}}{{/a}}', { a: '1', b: '1' })).toBe('AB')
    expect(render('{{#a}}A{{#b}}B{{/b}}{{/a}}', { a: '1' })).toBe('A')
  })

  it('survives an unbalanced tag instead of hanging', () => {
    expect(render('{{#a}}open forever', { a: '1' })).toBe('open forever')
  })
})

describe('missingPlaceholders', () => {
  it('reports the values a letter would leave blank', () => {
    expect(missingPlaceholders('{{a}} and {{b}}', { a: 'x' })).toEqual(['b'])
  })

  it('ignores values inside a guarded section', () => {
    expect(missingPlaceholders('{{#b}}{{b}}{{/b}}', {})).toEqual([])
  })
})

describe('buildContext', () => {
  it('fills the job and profile fields a letter needs', () => {
    const job = makeJob()
    const context = buildContext(job, profile, scoreJob(job, profile, undefined, NOW))
    expect(context['job.title']).toBe(job.title)
    expect(context['job.budget']).toBe('$60–$90/hr')
    expect(context['match.topSkill']).toBe('React')
    expect(context['me.rate']).toBe('$70/hr')
  })
})

describe('formatBudget', () => {
  it('formats ranges, single rates and fixed budgets', () => {
    expect(formatBudget(makeJob({ budget: { type: 'hourly', min: 40, max: 60, currency: 'USD' } }))).toBe('$40–$60/hr')
    expect(formatBudget(makeJob({ budget: { type: 'hourly', min: 40, currency: 'USD' } }))).toBe('$40/hr')
    expect(formatBudget(makeJob({ budget: { type: 'fixed', min: 2500, currency: 'USD' } }))).toBe('$2,500 fixed')
    expect(formatBudget(makeJob({ budget: { type: 'fixed', currency: 'USD' } }))).toBe('')
  })
})

describe('pickTemplate', () => {
  it('picks the template whose keywords the job hits most', () => {
    const react = template({ id: 'react', matchKeywords: ['react', 'dashboard'], isDefault: false })
    const writing = template({ id: 'writing', matchKeywords: ['blog'], isDefault: true })
    expect(pickTemplate([writing, react], makeJob())?.id).toBe('react')
  })

  it('falls back to the default when nothing matches', () => {
    const react = template({ id: 'react', matchKeywords: ['rust'], isDefault: false })
    const general = template({ id: 'general', matchKeywords: [], isDefault: true })
    expect(pickTemplate([react, general], makeJob())?.id).toBe('general')
  })

  it('has nothing to pick from an empty list', () => {
    expect(pickTemplate([], makeJob())).toBeUndefined()
  })
})

describe('draftLetter', () => {
  it('writes a letter with no placeholders left in it', () => {
    const job = makeJob()
    const { letter, missing } = draftLetter(job, profile, [template({ body: STARTER_TEMPLATE })], scoreJob(job, profile, undefined, NOW))
    expect(letter).toContain(job.title)
    expect(letter).toContain('Sam Rivera')
    expect(letter).not.toMatch(/\{\{|\}\}/)
    expect(missing).toEqual([])
  })

  it('leaves out the lines it has nothing to fill', () => {
    const bare = makeProfile({ portfolio: '', timezone: '' })
    const { letter } = draftLetter(makeJob(), bare, [template({ body: STARTER_TEMPLATE })])
    expect(letter).not.toContain('Recent work')
    expect(letter).not.toContain('I work from')
    expect(draftLetter(makeJob(), profile, [template({ body: STARTER_TEMPLATE })]).letter).toContain(
      'I work from Europe/London',
    )
  })

  it('reports a placeholder your profile cannot fill', () => {
    const bare = makeProfile({ portfolio: '' })
    const { missing } = draftLetter(makeJob(), bare, [template({ body: 'See {{me.portfolio}}' })])
    expect(missing).toEqual(['me.portfolio'])
  })
})

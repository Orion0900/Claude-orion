import { describe, expect, it } from 'vitest'
import { makeJob } from './__fixtures__/jobs'
import { defaultState, exportState, importState, mergeState, STATE_VERSION } from './store'

describe('mergeState', () => {
  it('returns defaults for nothing, for rubbish, and for the wrong type', () => {
    expect(mergeState(undefined).version).toBe(STATE_VERSION)
    expect(mergeState('nope').templates).toHaveLength(1)
    expect(mergeState(42).profile.targetHourly).toBe(defaultState().profile.targetHourly)
  })

  it('keeps what was stored and fills in what is new', () => {
    const merged = mergeState({ profile: { name: 'Sam' }, criteria: { query: 'react' } })
    expect(merged.profile.name).toBe('Sam')
    expect(merged.profile.targetHourly).toBe(defaultState().profile.targetHourly)
    expect(merged.criteria.query).toBe('react')
    expect(merged.criteria.excludeKeywords).toEqual([])
  })

  it('drops records that are missing the fields the app relies on', () => {
    const merged = mergeState({
      templates: [{ id: 'ok', body: 'hi' }, { name: 'no id' }],
      jobs: [{ id: 'j', title: 'T', budget: {} }, { id: 'bad' }],
      applications: [{ id: 'a', jobId: 'j' }, 'nope'],
    })
    expect(merged.templates).toHaveLength(1)
    expect(merged.jobs).toHaveLength(1)
    expect(merged.applications).toHaveLength(1)
  })

  it('hands back the starter template when every template is gone', () => {
    expect(mergeState({ templates: [] }).templates[0].id).toBe('starter')
  })

  it('repairs list fields that were stored as something else', () => {
    const merged = mergeState({
      profile: { skills: 'react', avoid: [1, 'unpaid'] },
      criteria: { experienceLevels: ['expert', 'wizard'] },
    })
    expect(merged.profile.skills).toEqual([])
    expect(merged.profile.avoid).toEqual(['unpaid'])
    expect(merged.criteria.experienceLevels).toEqual(['expert'])
  })
})

describe('export and import', () => {
  it('round-trips settings without carrying tokens or cached jobs', () => {
    const state = defaultState()
    state.profile.name = 'Sam'
    state.sources = [{ id: 's1', kind: 'json', label: 'Bridge', enabled: true, url: 'https://example.com', token: 'secret' }]
    state.autoApply.submitToken = 'secret'
    state.jobs = [makeJob()]

    const json = exportState(state)
    expect(json).not.toContain('secret')

    const back = importState(json)
    expect(back.profile.name).toBe('Sam')
    expect(back.sources[0].url).toBe('https://example.com')
    expect(back.sources[0].token).toBeUndefined()
    expect(back.jobs).toEqual([])
  })
})

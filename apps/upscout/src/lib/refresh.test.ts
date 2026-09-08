import { describe, expect, it } from 'vitest'
import { describeFetchedAt, liveSources, shouldAutoRefresh } from './refresh'
import type { SourceConfig } from './types'

const NOW = new Date('2026-03-10T12:00:00.000Z')

const source = (overrides: Partial<SourceConfig> = {}): SourceConfig => ({
  id: 's1',
  kind: 'bridge',
  label: 'Bridge',
  enabled: true,
  url: 'https://bridge.example.com',
  ...overrides,
})

const input = (overrides: Partial<Parameters<typeof shouldAutoRefresh>[0]> = {}) => ({
  sources: [source()],
  lastFetchedAt: '2026-03-10T11:00:00.000Z',
  everyMinutes: 10,
  fetching: false,
  visible: true,
  now: NOW,
  ...overrides,
})

describe('liveSources', () => {
  it('counts only sources that could actually answer', () => {
    const sources = [source(), source({ id: '2', enabled: false }), source({ id: '3', url: '  ' }), source({ id: '4', kind: 'manual' })]
    expect(liveSources(sources).map((entry) => entry.id)).toEqual(['s1'])
  })
})

describe('shouldAutoRefresh', () => {
  it('refreshes a list that has gone stale', () => {
    expect(shouldAutoRefresh(input())).toBe(true)
  })

  it('leaves a fresh list alone', () => {
    expect(shouldAutoRefresh(input({ lastFetchedAt: '2026-03-10T11:55:00.000Z' }))).toBe(false)
  })

  it('fetches immediately when nothing has ever been fetched', () => {
    expect(shouldAutoRefresh(input({ lastFetchedAt: undefined }))).toBe(true)
  })

  it('does nothing while hidden, already fetching, or switched off', () => {
    expect(shouldAutoRefresh(input({ visible: false }))).toBe(false)
    expect(shouldAutoRefresh(input({ fetching: true }))).toBe(false)
    expect(shouldAutoRefresh(input({ everyMinutes: 0 }))).toBe(false)
  })

  it('does nothing without a source that could answer', () => {
    expect(shouldAutoRefresh(input({ sources: [] }))).toBe(false)
    expect(shouldAutoRefresh(input({ sources: [source({ enabled: false })] }))).toBe(false)
  })

  it('ignores a timestamp it cannot trust', () => {
    expect(shouldAutoRefresh(input({ lastFetchedAt: 'nonsense' }))).toBe(false)
    expect(shouldAutoRefresh(input({ lastFetchedAt: '2026-03-11T00:00:00.000Z' }))).toBe(false)
  })
})

describe('describeFetchedAt', () => {
  it('reads like a person would say it', () => {
    expect(describeFetchedAt(undefined, NOW)).toBe('not fetched yet')
    expect(describeFetchedAt('2026-03-10T11:59:40.000Z', NOW)).toBe('updated just now')
    expect(describeFetchedAt('2026-03-10T11:45:00.000Z', NOW)).toBe('updated 15 min ago')
    expect(describeFetchedAt('2026-03-10T09:00:00.000Z', NOW)).toBe('updated 3 hr ago')
    expect(describeFetchedAt('2026-03-08T12:00:00.000Z', NOW)).toBe('updated 2 d ago')
  })
})

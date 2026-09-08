import { describe, expect, it } from 'vitest'
import { DEFAULT_MODEL, supportsEffort, supportsFallbacks } from './summarize.js'

describe('model capability gates', () => {
  it('defaults to Haiku 4.5', () => {
    expect(DEFAULT_MODEL).toBe('claude-haiku-4-5')
  })
  it('only sends effort to models that accept it', () => {
    expect(supportsEffort('claude-haiku-4-5')).toBe(false)
    expect(supportsEffort('claude-sonnet-4-5')).toBe(false)
    expect(supportsEffort('claude-opus-5')).toBe(true)
    expect(supportsEffort('claude-sonnet-5')).toBe(true)
    expect(supportsEffort('claude-fable-5-1')).toBe(true)
  })
  it('only asks for refusal fallbacks on Fable / Opus 5', () => {
    expect(supportsFallbacks('claude-haiku-4-5')).toBe(false)
    expect(supportsFallbacks('claude-opus-5')).toBe(true)
    expect(supportsFallbacks('claude-fable-5-1')).toBe(true)
  })
})

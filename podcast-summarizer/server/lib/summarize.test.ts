import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSummarizer, DEFAULT_MODEL, supportsEffort, supportsFallbacks } from './summarize.js'

// A stand-in for the SDK client: records each request and plays back a
// scripted stream, so the request shape and the progress reporting can be
// checked without the network.
const fake = vi.hoisted(() => ({
  requests: [] as Record<string, unknown>[],
  deltas: 0,
  message: {} as Record<string, unknown>,
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          fake.requests.push(params)
          const handlers: (() => void)[] = []
          return {
            on(event: string, fn: () => void) {
              if (event === 'text') handlers.push(fn)
              return this
            },
            async finalMessage() {
              for (let i = 0; i < fake.deltas; i++) handlers.forEach((fn) => fn())
              return fake.message
            },
          }
        },
      },
    }
  },
}))

describe('model capability gates', () => {
  it('defaults to Haiku 4.5', () => {
    expect(DEFAULT_MODEL).toBe('claude-haiku-4-5')
  })
  it('only sends effort to models that accept it', () => {
    expect(supportsEffort('claude-haiku-4-5')).toBe(false)
    expect(supportsEffort('claude-haiku-4-5-20251001')).toBe(false)
    expect(supportsEffort('claude-sonnet-4-5')).toBe(false)
    expect(supportsEffort('claude-opus-5')).toBe(true)
    expect(supportsEffort('claude-opus-5-5')).toBe(true)
    expect(supportsEffort('claude-sonnet-5')).toBe(true)
    expect(supportsEffort('claude-sonnet-5-5')).toBe(true)
    expect(supportsEffort('claude-fable-5-1')).toBe(true)
  })
  it('only asks for refusal fallbacks on models that accept them', () => {
    expect(supportsFallbacks('claude-haiku-4-5')).toBe(false)
    expect(supportsFallbacks('claude-haiku-4-5-20251001')).toBe(false)
    expect(supportsFallbacks('claude-sonnet-5')).toBe(false)
    expect(supportsFallbacks('claude-sonnet-5-5')).toBe(true)
    expect(supportsFallbacks('claude-opus-5')).toBe(true)
    expect(supportsFallbacks('claude-opus-5-5')).toBe(true)
    expect(supportsFallbacks('claude-fable-5-1')).toBe(true)
  })
})

describe('createSummarizer', () => {
  const summary = { tldr: 'Sleep.', key_points: [], chapters: [], quotes: [], action_items: [], mentions: [], people: [] }
  const input = { showName: 'Huberman Lab', episodeTitle: 'Why We Sleep', transcript: '[0:00] Sleep matters.' }

  beforeEach(() => {
    fake.requests = []
    fake.deltas = 0
    fake.message = { stop_reason: 'end_turn', parsed_output: summary, model: 'claude-haiku-4-5', usage: { input_tokens: 10, output_tokens: 5 } }
  })

  it('reports that writing started once, not once per streamed delta', async () => {
    fake.deltas = 500
    const progress: string[] = []
    const result = await createSummarizer({ apiKey: 'test' }).summarize(input, (m) => progress.push(m))
    expect(progress).toEqual(['Reading the transcript…', 'Writing the summary…'])
    expect(result.summary.tldr).toBe('Sleep.')
    expect(result.usage).toEqual({ input: 10, output: 5 })
  })

  it('sends effort and fallbacks only where the model takes them', async () => {
    await createSummarizer({ apiKey: 'test' }).summarize(input)
    await createSummarizer({ apiKey: 'test', model: 'claude-sonnet-5-5' }).summarize(input)
    const [haiku, sonnet] = fake.requests as { fallbacks?: string; betas?: string[]; output_config: { effort?: string } }[]
    expect(haiku.fallbacks).toBeUndefined()
    expect(haiku.output_config.effort).toBeUndefined()
    expect(sonnet.fallbacks).toBe('default')
    expect(sonnet.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(sonnet.output_config.effort).toBe('high')
  })

  it('turns a refusal or a truncated answer into a readable error', async () => {
    fake.message = { stop_reason: 'refusal', stop_details: { explanation: 'policy' } }
    await expect(createSummarizer({ apiKey: 'test' }).summarize(input)).rejects.toThrow(/declined to summarize this episode: policy/)
    fake.message = { stop_reason: 'max_tokens' }
    await expect(createSummarizer({ apiKey: 'test' }).summarize(input)).rejects.toThrow(/output limit/)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { SAMPLE_RATE } from './chunking'
import { transcribeWith } from './engine'
import type { WhisperPipeline } from './engine'
import type { RawChunk } from './words'

// Stand-ins for the two transformers.js classes the engine uses, so this
// runs without loading ONNX Runtime or a model.
vi.mock('@huggingface/transformers', () => {
  class LogitsProcessor {
    constructor() {
      // Like transformers.js's Callable: an instance is a function calling _call.
      const closure = (...args: unknown[]): unknown => (closure as unknown as { _call(...a: unknown[]): unknown })._call(...args)
      return Object.setPrototypeOf(closure, new.target.prototype)
    }
  }
  class Tensor {
    type: string
    data: unknown
    dims: number[]
    constructor(type: string, data: unknown, dims: number[]) {
      this.type = type
      this.data = data
      this.dims = dims
    }
  }
  return { LogitsProcessor, Tensor }
})

// A tiny vocabulary: text tokens below END, then special tokens, then timestamps.
const VOCAB = ['', 'hello', 'world', 'again', 'more']
const END = 50
const START = 51
const EN = 52
const FR = 53
const TRANSCRIBE = 54
const NO_TIMESTAMPS = 55
const TIME_ZERO = NO_TIMESTAMPS + 1
const ts = (seconds: number) => TIME_ZERO + Math.round(seconds / 0.02)
const SIZE = ts(30) + 1

interface Script {
  /** Generated tokens, after the prompt. */
  tokens: number[]
  /** Time of each generated token, as transformers.js reports it: the step after it. */
  times: number[]
}

function fakeWhisper(options: {
  multilingual?: boolean
  detect?: 'en' | 'fr'
  generate?: (audio: Float32Array, call: number) => Script
  segments?: RawChunk[]
}) {
  const { multilingual = true } = options
  const calls: Record<string, unknown>[] = []
  const progress: number[] = []
  const config = {
    is_multilingual: multilingual,
    lang_to_id: multilingual ? { '<|en|>': EN, '<|fr|>': FR } : null,
    decoder_start_token_id: START,
    no_timestamps_token_id: NO_TIMESTAMPS,
    eos_token_id: END,
  }

  const generate = vi.fn(async (args: Record<string, unknown>) => {
    calls.push(args)
    const audio = args.inputs as Float32Array
    const script = options.generate?.(audio, calls.length - 1) ?? { tokens: [], times: [] }
    const prompt = [START, ...(args.language ? [args.language === 'fr' ? FR : EN, TRANSCRIBE] : [])]
    const ids = prompt.slice()
    const times = prompt.map(() => 0)
    const processors = args.logits_processor as ((ids: bigint[][], logits: unknown) => unknown)[]
    for (let i = 0; i < script.tokens.length; i++) {
      const data = new Float32Array(SIZE)
      data[script.tokens[i]] = 10
      for (const processor of processors) processor([ids.map(BigInt)], { data, dims: [1, SIZE] })
      // A processor that ends the text leaves only end-of-text possible.
      const ended = data[END] === 0 && data[script.tokens[i]] === -Infinity
      ids.push(ended ? END : script.tokens[i])
      times.push(script.times[i])
      if (ended) break
    }
    return {
      sequences: { tolist: () => [ids.map(BigInt)] },
      token_timestamps: { tolist: () => [times] },
    }
  })

  // Groups tokens into words the way transformers.js does: each text token
  // spans from its own time to the next token's.
  const decode = (sequences: unknown[], decodeOptions: Record<string, unknown>): [string, { chunks?: RawChunk[] }] => {
    const [{ tokens, token_timestamps: times }] = sequences as { tokens: bigint[]; token_timestamps: number[] }[]
    expect(decodeOptions.return_timestamps).toBe('word')
    const chunks: RawChunk[] = []
    tokens.forEach((token, i) => {
      if (Number(token) < END) chunks.push({ text: ` ${VOCAB[Number(token)]}`, timestamp: [times[i], times[i + 1] ?? null] })
    })
    return [chunks.map((c) => c.text).join(''), { chunks }]
  }

  const segmentCall = vi.fn(async () => ({
    text: (options.segments ?? []).map((s) => s.text).join(''),
    chunks: options.segments,
  }))
  const asr = Object.assign(segmentCall, {
    model: {
      generation_config: config,
      generate,
      forward: vi.fn(async () => {
        const data = new Float32Array(SIZE)
        data[EN] = options.detect === 'fr' ? 1 : 5
        data[FR] = options.detect === 'fr' ? 5 : 1
        return { logits: { data } }
      }),
    },
    tokenizer: { _decode_asr: decode },
    processor: async (audio: Float32Array) => ({ input_features: audio }),
    dispose: async () => undefined,
  }) as unknown as WhisperPipeline
  return { asr, calls, generate, segmentCall, progress, forward: asr.model.forward }
}

/** Loud steady sound, so every window is transcribed and no word edges move. */
function loud(seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let i = 0; i < out.length; i++) out[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE)
  return out
}

describe('transcribeWith', () => {
  it('times each word by the step that predicted it, not the step after', async () => {
    const { asr } = fakeWhisper({
      generate: () => ({
        tokens: [ts(0), 1, 2, ts(1.5), END],
        // transformers.js gives each token the time of the next prediction.
        times: [0, 0.5, 1.0, 1.5, 1.5],
      }),
    })
    const { words, language } = await transcribeWith(asr, loud(2), { language: 'en' })
    expect(language).toBe('en')
    expect(words.map((w) => [w.text, w.start, w.end])).toEqual([
      ['hello', 0, 0.5],
      ['world', 0.5, 1],
    ])
  })

  it('detects the language once and transcribes in it', async () => {
    const { asr, calls, forward } = fakeWhisper({
      detect: 'fr',
      generate: () => ({ tokens: [ts(0), 1, ts(1), END], times: [0, 1, 1, 1] }),
    })
    const { language } = await transcribeWith(asr, loud(40), { language: null })
    expect(language).toBe('fr')
    expect(forward).toHaveBeenCalledTimes(1)
    expect(calls.length).toBe(2)
    for (const call of calls) expect(call).toMatchObject({ language: 'fr', task: 'transcribe', return_token_timestamps: true })
  })

  it('gives English-only models no language or task, and reports English', async () => {
    const { asr, calls, forward } = fakeWhisper({
      multilingual: false,
      generate: () => ({ tokens: [ts(0), 1, ts(1), END], times: [0, 1, 1, 1] }),
    })
    const { language } = await transcribeWith(asr, loud(5), { language: null })
    expect(language).toBe('en')
    expect(forward).not.toHaveBeenCalled()
    expect(calls[0].language).toBeUndefined()
    expect(calls[0].task).toBeUndefined()
  })

  it('falls back to timed segments when word timing fails', async () => {
    const { asr, segmentCall } = fakeWhisper({
      generate: () => {
        throw new Error('Model outputs must contain cross attentions to extract timestamps.')
      },
      segments: [
        { text: ' hello there', timestamp: [0, 2] },
        { text: ' world', timestamp: [2.5, 3] },
      ],
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { words } = await transcribeWith(asr, loud(4), { language: 'en' })
    warn.mockRestore()
    expect(segmentCall).toHaveBeenCalledWith(expect.any(Float32Array), { language: 'en', task: 'transcribe', return_timestamps: true })
    expect(words.map((w) => w.text)).toEqual(['hello', 'there', 'world'])
    expect(words[1].end).toBeCloseTo(2, 5)
    expect(words[2].start).toBeCloseTo(2.5, 5)
  })

  it('ends a looping transcription early and keeps one copy of the loop', async () => {
    const looping = [ts(0), 1, 2]
    for (let i = 0; i < 40; i++) looping.push(3, 4)
    const { asr } = fakeWhisper({
      generate: () => ({ tokens: [...looping, END], times: looping.map((_, i) => i * 0.05).concat(3) }),
    })
    const { words } = await transcribeWith(asr, loud(5), { language: 'en' })
    expect(words.map((w) => w.text)).toEqual(['hello', 'world', 'again', 'more'])
  })

  it('reports progress from timestamps as the model goes', async () => {
    const { asr } = fakeWhisper({
      generate: () => ({ tokens: [ts(0), 1, ts(2), ts(2), 2, ts(4), END], times: [0, 1, 2, 2, 3, 4, 4] }),
    })
    const progress: number[] = []
    await transcribeWith(asr, loud(5), { language: 'en', onProgress: (done, total) => progress.push(done / total) })
    expect(progress).toEqual([0, 0.4, 0.8, 1])
  })

  it('takes a second look at speech left after the last word', async () => {
    // Speech at 0-2 s and 6-8 s over a quiet room; the model stops after the first.
    const audio = new Float32Array(10 * SAMPLE_RATE)
    let seed = 1
    for (let i = 0; i < audio.length; i++) {
      seed = (seed * 16807) % 2147483647
      audio[i] = ((seed / 2147483647) * 2 - 1) * 0.001
    }
    audio.set(loud(2), 0)
    audio.set(loud(2), 6 * SAMPLE_RATE)
    const { asr, calls } = fakeWhisper({
      generate: (_, call) =>
        call === 0
          ? { tokens: [ts(0), 1, 2, ts(2), END], times: [0, 1, 2, 2, 2] }
          : { tokens: [ts(0), 3, ts(2), END], times: [0.3, 2.3, 2.3, 2.3] },
    })
    const { words } = await transcribeWith(asr, audio, { language: 'en' })
    expect(calls).toHaveLength(2)
    expect((calls[1].inputs as Float32Array).length).toBeCloseTo(4.3 * SAMPLE_RATE, -2)
    expect(words.map((w) => w.text)).toEqual(['hello', 'world', 'again'])
    expect(words[2].start).toBeGreaterThan(5.8)
    expect(words[2].end).toBeLessThanOrEqual(8.2)
  })

  it('skips silence without running the model', async () => {
    const { asr, generate } = fakeWhisper({})
    const { words, language } = await transcribeWith(asr, new Float32Array(20 * SAMPLE_RATE), { language: null })
    expect(words).toEqual([])
    expect(language).toBeNull()
    expect(generate).not.toHaveBeenCalled()
  })
})

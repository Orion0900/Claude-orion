/**
 * Runs a loaded Whisper pipeline over a whole recording: cuts it into
 * windows, finds the language, times every word and cleans the result up.
 * Knows nothing about workers, so it runs the same in the browser and in Node.
 */

import { LogitsProcessor, Tensor } from '@huggingface/transformers'
import type { Word } from '../lib/types.ts'
import { analyse, planChunks, SAMPLE_RATE, speechAfter } from './chunking.ts'
import { fromWhisperCode, toWhisperCode } from './models.ts'
import { idMaker, normalizeChunk, spreadSegments } from './words.ts'
import type { RawChunk } from './words.ts'

/** The parts of a transformers.js speech-recognition pipeline used here. */
export interface WhisperPipeline {
  (audio: Float32Array, options: Record<string, unknown>): Promise<{ text: string; chunks?: RawChunk[] }>
  model: {
    generation_config: WhisperGenerationConfig | null
    generate(options: Record<string, unknown>): Promise<unknown>
    forward(inputs: Record<string, unknown>): Promise<{ logits: { data: ArrayLike<number> } }>
  }
  tokenizer: {
    _decode_asr(sequences: unknown[], options: Record<string, unknown>): [string, { chunks?: RawChunk[] }]
  }
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>
  dispose(): Promise<void>
}

interface WhisperGenerationConfig {
  is_multilingual?: boolean | null
  lang_to_id?: Record<string, number> | null
  decoder_start_token_id?: number | null
  no_timestamps_token_id?: number | null
  eos_token_id?: number | number[] | null
}

interface TensorLike {
  tolist(): unknown[]
}

export interface EngineOptions {
  /** ISO 639-1 code, or null to detect the language from the first speech. */
  language: string | null
  /** Seconds of audio finished so far, out of the whole. */
  onProgress?: (done: number, total: number) => void
}

export interface EngineResult {
  words: Word[]
  /** ISO 639-1 code of the language transcribed, when known. */
  language: string | null
}

// Whisper's timestamp tokens and attention frames are 20 ms apart.
const TIME_PRECISION = 0.02
const SAMPLES_PER_FRAME = SAMPLE_RATE * TIME_PRECISION
// The decoder holds 448 tokens, and the prompt takes up to three of them.
const MAX_NEW_TOKENS = 440
// Sound after a window's last word worth a second look: about a word's
// worth. A window gets at most two second looks.
const MISSED_SPEECH_SECONDS = 0.5
const RETRY_LEAD_IN = 0.3
const MAX_PASSES = 3

export async function transcribeWith(
  asr: WhisperPipeline,
  audio: Float32Array,
  options: EngineOptions,
): Promise<EngineResult> {
  const total = audio.length / SAMPLE_RATE
  const profile = analyse(audio)
  const chunks = planChunks(profile, total)
  const multilingual = Boolean(asr.model.generation_config?.is_multilingual)
  // English-only weights never hear anything else.
  let language = multilingual ? options.language : 'en'
  const nextId = idMaker()
  const words: Word[] = []
  let reported = 0
  const report = (done: number) => {
    reported = Math.max(reported, Math.min(done, total))
    options.onProgress?.(reported, total)
  }

  report(0)
  for (const chunk of chunks) {
    let from = chunk.speech ? chunk.start : chunk.end
    for (let pass = 0; pass < MAX_PASSES && from < chunk.end; pass++) {
      const samples = audio.subarray(Math.round(from * SAMPLE_RATE), Math.round(chunk.end * SAMPLE_RATE))
      if (multilingual && !language) language = await detectLanguage(asr, samples)
      const offset = from
      const raw = await transcribeChunk(asr, samples, multilingual ? language : null, (seconds) =>
        report(offset + seconds),
      )
      const found = normalizeChunk(raw, { offset, duration: chunk.end - offset, profile, nextId })
      words.push(...found)
      // Whisper sometimes stops before the end of a window with speech still
      // to come. When there's clearly more, run what's left again.
      const heard = found.at(-1)?.end
      const missed = heard === undefined ? null : speechAfter(profile, heard + 0.1, chunk.end, MISSED_SPEECH_SECONDS)
      if (heard === undefined || missed === null) break
      from = Math.max(heard, missed - RETRY_LEAD_IN)
    }
    report(chunk.end)
  }
  return { words, language }
}

/**
 * Words with times in seconds from the start of `audio`. Falls back to
 * timed segments when the model can't time single words.
 */
async function transcribeChunk(
  asr: WhisperPipeline,
  audio: Float32Array,
  language: string | null,
  onTime: (seconds: number) => void,
): Promise<RawChunk[]> {
  const duration = audio.length / SAMPLE_RATE
  // English-only models refuse a language or task; multilingual ones need both.
  const prompt = language ? { language: toWhisperCode(language), task: 'transcribe' } : {}
  try {
    return await timeWords(asr, audio, prompt, onTime)
  } catch (error) {
    // Exports without cross-attention outputs can't time single words, but
    // they can still time segments, whose words are then spread over them.
    console.warn('Word timing failed, so this part is timed by segment instead.', error)
    const output = await asr(audio, { ...prompt, return_timestamps: true })
    const segments = output.chunks ?? [{ text: output.text, timestamp: [0, duration] }]
    return spreadSegments(segments, duration, language)
  }
}

async function timeWords(
  asr: WhisperPipeline,
  audio: Float32Array,
  prompt: Record<string, string>,
  onTime: (seconds: number) => void,
): Promise<RawChunk[]> {
  const config = asr.model.generation_config ?? {}
  const { input_features } = await asr.processor(audio)
  const output = (await asr.model.generate({
    inputs: input_features,
    ...prompt,
    return_timestamps: true,
    return_token_timestamps: true,
    // A fixed budget keeps generation to a single pass over this window,
    // whose word alignment then only looks at the frames that hold audio.
    max_new_tokens: MAX_NEW_TOKENS,
    num_frames: Math.ceil(audio.length / SAMPLES_PER_FRAME),
    // A fresh array each time: generate() adds Whisper's own processors to it.
    logits_processor: [new Watcher(config, onTime)],
  })) as { sequences: TensorLike; token_timestamps: TensorLike }

  const tokens = output.sequences.tolist()[0] as (bigint | number)[]
  const times = output.token_timestamps.tolist()[0] as number[]
  // transformers.js 4.3 gives each token the time of the decoding step that
  // predicts the token after it, which puts words about one word late.
  // The step that predicted the token itself is the one that looked at its
  // sound, as in OpenAI's implementation, so shift everything by one.
  const shifted = times.map((_, i) => (i === 0 ? 0 : Math.round(times[i - 1] * 100) / 100))
  const [, extra] = asr.tokenizer._decode_asr(
    [{ tokens, token_timestamps: shifted, stride: [audio.length / SAMPLE_RATE, 0, 0] }],
    { time_precision: TIME_PRECISION, return_timestamps: 'word', force_full_sequences: false },
  )
  return extra.chunks ?? []
}

/**
 * Detects the spoken language the way Whisper does: one decoding step after
 * the start-of-transcript token, keeping the likeliest language token.
 * transformers.js 4.3 doesn't do this itself; it assumes English.
 */
async function detectLanguage(asr: WhisperPipeline, audio: Float32Array): Promise<string | null> {
  const config = asr.model.generation_config
  const languages = config?.lang_to_id
  const start = config?.decoder_start_token_id
  if (!languages || start == null) return null
  const { input_features } = await asr.processor(audio)
  const output = await asr.model.forward({
    input_features,
    decoder_input_ids: new Tensor('int64', BigInt64Array.of(BigInt(start)), [1, 1]),
  })
  const logits = output.logits.data
  let best: string | null = null
  let bestScore = -Infinity
  for (const [token, id] of Object.entries(languages)) {
    if (logits[id] > bestScore) {
      bestScore = logits[id]
      best = token.slice(2, -2)
    }
  }
  return best ? fromWhisperCode(best) : null
}

/**
 * Looks at each token as it's generated: timestamp tokens tell how far
 * through the window the model is, and a phrase repeated over and over
 * means it's stuck in a loop, so the text is ended there. It's a logits
 * processor rather than a stopping criterion because Whisper's generate()
 * in transformers.js 4.3 doesn't pass stopping criteria on.
 */
class Watcher extends LogitsProcessor {
  timestampBegin: number
  endOfText: number
  onTime: (seconds: number) => void

  constructor(config: WhisperGenerationConfig, onTime: (seconds: number) => void) {
    super()
    const eos = Array.isArray(config.eos_token_id) ? config.eos_token_id[0] : config.eos_token_id
    this.timestampBegin = (config.no_timestamps_token_id ?? Infinity) + 1
    this.endOfText = eos ?? this.timestampBegin
    this.onTime = onTime
  }

  // Returns the logits: the list of processors passes each one's result on.
  _call(inputIds: bigint[][], logits: Tensor): Tensor {
    const { data, dims } = logits as unknown as { data: Float32Array; dims: number[] }
    const vocabulary = dims[dims.length - 1]
    inputIds.forEach((ids, row) => {
      const last = Number(ids[ids.length - 1])
      if (last >= this.timestampBegin) {
        this.onTime((last - this.timestampBegin) * TIME_PRECISION)
      } else if (last < this.endOfText && isLooping(ids, this.endOfText)) {
        const scores = data.subarray(row * vocabulary, (row + 1) * vocabulary)
        scores.fill(-Infinity)
        scores[this.endOfText] = 0
      }
    })
    return logits
  }
}

// How many times running a stretch of tokens must repeat to count as a loop.
// High enough that someone chanting "let's go" a few times isn't cut off.
const LOOP_COPIES = 8
const LONGEST_LOOP = 16

function isLooping(ids: readonly (number | bigint)[], endOfText: number): boolean {
  // Text tokens only, newest first: timestamps keep counting up through a loop.
  const text: number[] = []
  for (let i = ids.length - 1; i >= 0 && text.length < LONGEST_LOOP * LOOP_COPIES; i--) {
    const id = Number(ids[i])
    if (id < endOfText) text.push(id)
  }
  for (let period = 1; period <= LONGEST_LOOP; period++) {
    const span = period * LOOP_COPIES
    if (span > text.length) break
    let repeating = true
    for (let k = period; k < span && repeating; k++) repeating = text[k] === text[k - period]
    if (repeating) return true
  }
  return false
}

// Real transcriptions in Node, through the same engine the worker uses, to
// check word timing and the guards against made-up words. Runs on
// onnxruntime-node and a local copy of the model; nothing is downloaded.
// Not part of `npm test`.
//
//   FIXTURES=/path/to/fixtures node tests/transcribe-node.mjs
//
// FIXTURES holds jfk.wav (16 kHz), speech.wav (any rate; 0.6 s silence, JFK,
// 2 s silence, JFK, 1.2 s silence) and models/Xenova/whisper-tiny/ laid out as
// on Hugging Face. Needs Node 22.18 or later, which runs the .ts sources as is.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { env, pipeline } from '@huggingface/transformers'
import { transcribeWith } from '../src/transcribe/engine.ts'

const fixtures = process.env.FIXTURES
if (!fixtures) {
  console.error('Set FIXTURES to the folder with jfk.wav, speech.wav and models/.')
  process.exit(2)
}

env.localModelPath = join(fixtures, 'models') + '/'
env.allowLocalModels = true
env.allowRemoteModels = false
env.useFSCache = false

const RATE = 16000
const JFK = 'And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.'
const failures = []
const check = (ok, message) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${message}`)
  if (!ok) failures.push(message)
}

const started = performance.now()
const asr = await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { dtype: 'q8', device: 'cpu' })
console.log(`Loaded Xenova/whisper-tiny in ${Math.round(performance.now() - started)} ms`)

const jfk = readWav(join(fixtures, 'jfk.wav'))
const speech = readWav(join(fixtures, 'speech.wav'))

// JFK, with the language given.
{
  const { words, language, ms } = await run('jfk.wav, English', jfk, 'en')
  check(language === 'en', `language is en (${language})`)
  const americans = words.find((w) => /^americans/i.test(w.text))
  check(americans && americans.start > 1 && americans.start < 4, `"Americans" starts 1-4 s (${americans?.start})`)
  check(similarity(words, JFK) > 0.8, `words match the speech (${similarity(words, JFK).toFixed(2)})`)
  checkTimes(words, 11)
  console.log(`  ${ms} ms for 11 s of audio`)
}

// JFK, detecting the language.
{
  const { language } = await run('jfk.wav, detected', jfk, null, { quiet: true })
  check(language === 'en', `detected language is en (${language})`)
}

// Two passages with silence around them, at 48 kHz in the file.
{
  const { words } = await run('speech.wav', speech, 'en')
  const starts = words.filter((w) => /^and$/i.test(w.text)).map((w) => w.start)
  check(starts.length === 2, `two passages (${starts.length} "And"s)`)
  const firstAmericans = words.find((w) => /^americans/i.test(w.text))
  const lastAmericans = words.findLast((w) => /^americans/i.test(w.text))
  const gap = lastAmericans && firstAmericans ? lastAmericans.start - firstAmericans.start : 0
  check(Math.abs(gap - 13) < 0.5, `second passage 13 s after the first (${gap.toFixed(2)} s)`)
  const inSilence = words.filter((w) => w.end < 0.55 || (w.start > 11.75 && w.end < 13.55) || w.start > 24.75)
  check(inSilence.length === 0, `nothing in the silences (${inSilence.map((w) => w.text).join(' ')})`)
  checkTimes(words, 25.8)
}

// Silence and noise alone, which Whisper likes to fill with "you" or "Thank you."
{
  const { words } = await run('20 s of silence', new Float32Array(20 * RATE), 'en', { quiet: true })
  check(words.length === 0, `no words in silence (${words.map((w) => w.text).join(' ')})`)
  const noise = await run('20 s of quiet hiss', hiss(20, -50), 'en', { quiet: true })
  check(noise.words.length === 0, `no words in hiss (${noise.words.map((w) => w.text).join(' ')})`)
}

// A loud stretch without speech first. It's too loud to skip, so it's
// transcribed, but it mustn't decide the language or leave words behind.
{
  const audio = concat(hiss(20, -25), jfk)
  const { words, language } = await run('20 s of loud hiss, then JFK, language detected', audio, null, { quiet: true })
  check(language === 'en', `language is en (${language})`)
  check(similarity(words, JFK) > 0.8, `words match the speech (${similarity(words, JFK).toFixed(2)})`)
  const early = words.filter((w) => w.end < 20)
  check(early.length === 0, `nothing in the hiss (${early.map((w) => w.text).join(' ')})`)
}

// A long quiet start: the first word must not swallow it.
{
  const audio = concat(new Float32Array(5 * RATE), jfk, new Float32Array(10 * RATE))
  const { words } = await run('5 s silence + JFK + 10 s silence', audio, 'en', { quiet: true })
  check(words[0]?.start > 5, `first word starts after the silence (${words[0]?.start})`)
  check(words.at(-1)?.end < 16.5, `last word ends with the speech (${words.at(-1)?.end})`)
}

// A model that can't time single words: generate() throws as it does for an
// export without cross-attention outputs, and segments are used instead.
{
  const generate = asr.model.generate
  const warn = console.warn
  asr.model.generate = function (options) {
    if (options.return_token_timestamps) {
      throw new Error('Model outputs must contain cross attentions to extract timestamps.')
    }
    return generate.call(this, options)
  }
  console.warn = () => {}
  try {
    const { words } = await run('jfk.wav, word timing unavailable', jfk, 'en')
    check(similarity(words, JFK) > 0.8, `words match the speech (${similarity(words, JFK).toFixed(2)})`)
    checkTimes(words, 11)
  } finally {
    asr.model.generate = generate
    console.warn = warn
  }
}

// Longer than one window: JFK five times over, with pauses.
{
  const parts = []
  for (let i = 0; i < 5; i++) parts.push(jfk, new Float32Array(Math.round(0.7 * RATE)))
  const audio = concat(...parts)
  const { words, ms } = await run('JFK five times (58.5 s)', audio, 'en', { quiet: true })
  const passages = words.filter((w) => /^and$/i.test(w.text)).length
  check(passages === 5, `five passages (${passages})`)
  checkTimes(words, audio.length / RATE)
  console.log(`  ${ms} ms for ${(audio.length / RATE).toFixed(1)} s of audio`)
}

console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll checks passed.')
process.exit(failures.length ? 1 : 0)

async function run(name, audio, language, { quiet = false } = {}) {
  const t = performance.now()
  const progress = []
  const result = await transcribeWith(asr, audio, { language, onProgress: (done) => progress.push(done) })
  const ms = Math.round(performance.now() - t)
  console.log(`\n${name}: ${result.words.length} words, language ${result.language}, ${ms} ms`)
  if (!quiet) for (const w of result.words) console.log(`  ${w.start.toFixed(2).padStart(6)} ${w.end.toFixed(2).padStart(6)}  ${w.text}`)
  else console.log(`  ${result.words.map((w) => w.text).join(' ')}`)
  check(progress.every((p, i) => i === 0 || p >= progress[i - 1]), `progress only moves forward (${progress.length} updates)`)
  return { ...result, ms }
}

function checkTimes(words, duration) {
  const ids = new Set(words.map((w) => w.id))
  check(ids.size === words.length, 'ids are unique')
  const ordered = words.every((w, i) => w.end - w.start >= 0.049 && (i === 0 || w.start >= words[i - 1].end) && w.end <= duration + 1e-6)
  check(ordered, 'times move forward, never overlap, and last at least 0.05 s')
  check(words.every((w) => w.text && w.text === w.text.trim() && !/^\p{P}+$/u.test(w.text)), 'no blank or bare-punctuation words')
}

// Share of the expected words found in order (longest common subsequence).
function similarity(words, expected) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z' ]/g, '').split(/\s+/).filter(Boolean)
  const a = norm(words.map((w) => w.text).join(' '))
  const b = norm(expected)
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1])
    }
  }
  return table[a.length][b.length] / Math.max(a.length, b.length)
}

function readWav(path) {
  const bytes = readFileSync(path)
  let offset = 12
  let rate = 0
  let channels = 0
  let bits = 0
  let data = null
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    if (id === 'fmt ') {
      channels = bytes.readUInt16LE(offset + 10)
      rate = bytes.readUInt32LE(offset + 12)
      bits = bytes.readUInt16LE(offset + 22)
    }
    if (id === 'data') data = bytes.subarray(offset + 8, offset + 8 + size)
    offset += 8 + size + (size % 2)
  }
  if (bits !== 16 || !data) throw new Error(`${path}: only 16-bit PCM WAV is supported`)
  const frames = data.length / 2 / channels
  const mono = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2)
    mono[i] = sum / channels / 32768
  }
  return resample(mono, rate, RATE)
}

// Windowed-sinc resampling (Blackman window, 64 taps).
function resample(input, from, to) {
  if (from === to) return input
  const ratio = to / from
  const cutoff = Math.min(1, ratio) * 0.95
  const half = 32
  const out = new Float32Array(Math.floor(input.length * ratio))
  for (let i = 0; i < out.length; i++) {
    const centre = i / ratio
    const first = Math.floor(centre) - half + 1
    let sum = 0
    let weight = 0
    for (let k = first; k < first + 2 * half; k++) {
      if (k < 0 || k >= input.length) continue
      const t = k - centre
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * cutoff * t) / (Math.PI * cutoff * t)
      const window = 0.42 + 0.5 * Math.cos((Math.PI * t) / half) + 0.08 * Math.cos((2 * Math.PI * t) / half)
      sum += input[k] * sinc * window
      weight += sinc * window
    }
    out[i] = weight ? sum / weight : 0
  }
  return out
}

function concat(...parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function hiss(seconds, db) {
  let seed = 7
  const amplitude = 10 ** (db / 20) * Math.sqrt(3)
  const out = new Float32Array(Math.round(seconds * RATE))
  for (let i = 0; i < out.length; i++) {
    seed = (seed * 16807) % 2147483647
    out[i] = (seed / 2147483647) * 2 * amplitude - amplitude
  }
  return out
}

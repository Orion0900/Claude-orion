/**
 * Which Whisper weights to fetch, and how language tags map onto Whisper's
 * own language codes. Shared by the main thread and the worker.
 */

export type ModelSize = 'tiny' | 'base' | 'small'

export interface ModelInfo {
  label: string
  /** First download in megabytes: both ONNX files plus the tokenizer. */
  approxMB: number
  /** Multilingual weights on Hugging Face. */
  repo: string
  /** English-only weights of the same size, a little more accurate for English. */
  englishRepo: string
}

// Tiny's size is measured; base and small are worked out from their
// parameter counts at 8 bits a weight, which is how tiny's files add up.
export const MODELS: Record<ModelSize, ModelInfo> = {
  tiny: { label: 'Tiny', approxMB: 44, repo: 'Xenova/whisper-tiny', englishRepo: 'Xenova/whisper-tiny.en' },
  base: { label: 'Base', approxMB: 80, repo: 'Xenova/whisper-base', englishRepo: 'Xenova/whisper-base.en' },
  small: { label: 'Small', approxMB: 250, repo: 'Xenova/whisper-small', englishRepo: 'Xenova/whisper-small.en' },
}

/** Every file the q8 speech-recognition pipeline fetches, relative to the repo. */
export const MODEL_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
]

/** Where transformers.js fetches models from unless told otherwise. */
export const DEFAULT_REMOTE_HOST = 'https://huggingface.co/'

/**
 * The languages Whisper can transcribe, as ISO 639-1 codes. Hawaiian has no
 * two-letter code, so it keeps Whisper's 'haw'.
 */
export const LANGUAGES: readonly string[] = (
  'en zh de es ru ko fr ja pt tr pl ca nl ar sv it id hi fi vi he uk el ms cs ro da hu ta no th ' +
  'ur hr bg lt la mi ml cy sk te fa lv bn sr az sl kn et mk br eu is hy ne mn bs kk sq sw gl mr ' +
  'pa si km sn yo so af oc ka be tg sd gu am yi lo uz fo ht ps tk nn mt sa lb my bo tl mg as tt ' +
  'haw ln ha ba jv su'
).split(' ')

const SUPPORTED = new Set(LANGUAGES)

// Older or alternative tags for languages Whisper knows under another code.
const ALIASES: Record<string, string> = {
  iw: 'he',
  in: 'id',
  ji: 'yi',
  nb: 'no',
  fil: 'tl',
  jw: 'jv',
}

/**
 * The ISO code Whisper knows a language tag by: 'pt-BR' gives 'pt' and
 * 'zh-Hant' gives 'zh'. Null when Whisper can't transcribe the language, so
 * the caller can fall back to detecting it.
 */
export function normalizeLanguage(tag: string | null | undefined): string | null {
  if (!tag) return null
  const base = tag.trim().toLowerCase().split(/[-_]/)[0]
  const code = ALIASES[base] ?? base
  return SUPPORTED.has(code) ? code : null
}

/** Whisper's own code for an ISO code from normalizeLanguage. */
export function toWhisperCode(code: string): string {
  return code === 'jv' ? 'jw' : code
}

/** The ISO code for one of Whisper's language codes. */
export function fromWhisperCode(code: string): string {
  return code === 'jw' ? 'jv' : code
}

/** The repo to load: the English-only weights when the audio is known to be English. */
export function repoFor(model: ModelSize, language: string | null): string {
  const info = MODELS[model]
  return normalizeLanguage(language) === 'en' ? info.englishRepo : info.repo
}

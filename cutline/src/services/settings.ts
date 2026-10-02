/**
 * The app's own preferences, kept in localStorage. Reading never throws:
 * private browsing and a full disk just mean the defaults.
 */
import type { CaptionPresetId } from '../lib/types'
import type { ModelSize } from '../transcribe/client'

export interface AppSettings {
  /** Whisper size used for new transcriptions. */
  model: ModelSize
  /** ISO 639-1 code, or null to auto-detect. */
  language: string | null
  exportShortSide: 720 | 1080
  preset: CaptionPresetId
}

const KEY = 'cutline.settings'

export const DEFAULT_SETTINGS: AppSettings = { model: 'base', language: 'en', exportShortSide: 1080, preset: 'bold' }

export const LANGUAGES: { code: string | null; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: null, label: 'Detect automatically' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ru', label: 'Russian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'id', label: 'Indonesian' },
  { code: 'sv', label: 'Swedish' },
]

export function languageLabel(code: string | null): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? (code ? code.toUpperCase() : 'Automatic')
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const v = JSON.parse(raw) as Partial<AppSettings>
    return {
      model: v.model === 'tiny' || v.model === 'base' || v.model === 'small' ? v.model : DEFAULT_SETTINGS.model,
      language:
        v.language === null || (typeof v.language === 'string' && /^[a-z]{2,3}$/.test(v.language))
          ? v.language
          : DEFAULT_SETTINGS.language,
      exportShortSide: v.exportShortSide === 720 ? 720 : 1080,
      preset: typeof v.preset === 'string' ? (v.preset as CaptionPresetId) : DEFAULT_SETTINGS.preset,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Nothing to do: the settings still apply for this session.
  }
}

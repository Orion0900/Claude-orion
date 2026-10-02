import { describe, expect, it } from 'vitest'
import { fromWhisperCode, LANGUAGES, MODELS, normalizeLanguage, repoFor, toWhisperCode } from './models'

describe('models', () => {
  it('lists the 99 languages Whisper knows, once each', () => {
    expect(LANGUAGES).toHaveLength(99)
    expect(new Set(LANGUAGES).size).toBe(99)
  })

  it('reads language tags the way browsers and people write them', () => {
    expect(normalizeLanguage('en')).toBe('en')
    expect(normalizeLanguage('pt-BR')).toBe('pt')
    expect(normalizeLanguage('zh_Hant')).toBe('zh')
    expect(normalizeLanguage(' FR ')).toBe('fr')
    expect(normalizeLanguage('nb')).toBe('no')
    expect(normalizeLanguage('iw')).toBe('he')
    expect(normalizeLanguage('fil')).toBe('tl')
    expect(normalizeLanguage('jv')).toBe('jv')
    expect(normalizeLanguage('haw')).toBe('haw')
  })

  it('gives null for languages Whisper can’t transcribe, so they get detected', () => {
    expect(normalizeLanguage('xx')).toBeNull()
    expect(normalizeLanguage('')).toBeNull()
    expect(normalizeLanguage(null)).toBeNull()
  })

  it('maps to and from Whisper’s own codes', () => {
    expect(toWhisperCode('jv')).toBe('jw')
    expect(fromWhisperCode('jw')).toBe('jv')
    expect(toWhisperCode('de')).toBe('de')
  })

  it('uses the English-only weights for English', () => {
    expect(repoFor('base', 'en')).toBe(MODELS.base.englishRepo)
    expect(repoFor('tiny', 'en-GB')).toBe('Xenova/whisper-tiny.en')
    expect(repoFor('small', 'de')).toBe('Xenova/whisper-small')
    expect(repoFor('small', null)).toBe('Xenova/whisper-small')
  })
})

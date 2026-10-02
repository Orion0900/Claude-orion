/**
 * The optional Claude features: the user's own Anthropic API key and model
 * choice, kept in this browser only.
 */

export type ClaudeModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-4-5'

export const CLAUDE_MODELS: { id: ClaudeModel; label: string; note: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Best results. The default.' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Quicker, at half the price.' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', note: 'Fastest and cheapest, with simpler picks.' },
]

export interface AiSettings {
  apiKey: string
  model: ClaudeModel
}

const STORAGE_KEY = 'cutline.ai'

const DEFAULTS: AiSettings = { apiKey: '', model: 'claude-opus-5-5' }

export function loadAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const saved: unknown = JSON.parse(raw)
    if (typeof saved !== 'object' || saved === null) return { ...DEFAULTS }
    const { apiKey, model } = saved as Record<string, unknown>
    return {
      apiKey: typeof apiKey === 'string' ? apiKey.trim() : '',
      model: CLAUDE_MODELS.find((m) => m.id === model)?.id ?? DEFAULTS.model,
    }
  } catch {
    // Private browsing, blocked storage or a damaged entry: start as if
    // nothing had been saved.
    return { ...DEFAULTS }
  }
}

export function saveAiSettings(s: AiSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey: s.apiKey.trim(), model: s.model }))
  } catch {
    // Storage blocked or full: the key works for this session but won't be
    // remembered, which is all private browsing allows anyway.
  }
}

export function hasAi(s: AiSettings): boolean {
  return s.apiKey.trim().length > 0
}

/**
 * The caption looks. Each one is only a CaptionStyle: the renderer has no
 * idea which preset it's drawing, so anything a preset does can be tuned
 * by hand afterwards, and a tuned style still draws.
 *
 * Sizes are a share of the frame's shorter side and positions a share of
 * its height. Defaults keep text above the bottom ~18% of a 9:16 frame,
 * where TikTok, Reels and Shorts put their own captions and buttons.
 */
import type { CaptionPresetId, CaptionStyle } from '../lib/types'

export const PRESET_ORDER: CaptionPresetId[] = [
  'bold',
  'karaoke',
  'box',
  'minimal',
  'typewriter',
  'neon',
  'bounce',
  'subtitle',
  'comic',
  'marker',
]

const PANEL = 'rgba(0,0,0,0.6)'

export const PRESETS: Record<CaptionPresetId, { name: string; description: string; style: CaptionStyle }> = {
  bold: {
    name: 'Bold Pop',
    description: 'Chunky white capitals with a thick outline; the word being said pops in yellow.',
    style: {
      preset: 'bold',
      font: 'montserrat',
      weight: 900,
      size: 0.088,
      uppercase: true,
      textColor: '#FFFFFF',
      activeColor: '#FFE500',
      emphasisColor: '#3DFF6E',
      strokeColor: '#000000',
      strokeWidth: 0.1,
      shadow: 'soft',
      glow: false,
      background: 'none',
      backgroundColor: PANEL,
      highlight: 'scale',
      animation: 'pop',
      wordsPerPage: 3,
      maxLines: 2,
      position: 0.66,
      emojis: true,
    },
  },
  karaoke: {
    name: 'Karaoke',
    description: 'Each word fills with colour as it is spoken, and stays filled.',
    style: {
      preset: 'karaoke',
      font: 'poppins',
      weight: 800,
      size: 0.07,
      uppercase: false,
      textColor: '#FFFFFF',
      activeColor: '#FF3EA5',
      emphasisColor: '#FFE14D',
      strokeColor: '#000000',
      strokeWidth: 0.08,
      shadow: 'soft',
      glow: false,
      background: 'none',
      backgroundColor: PANEL,
      highlight: 'color',
      animation: 'karaoke',
      wordsPerPage: 6,
      maxLines: 2,
      position: 0.7,
      emojis: false,
    },
  },
  box: {
    name: 'Highlight Box',
    description: 'A rounded colour box glides from word to word behind white capitals.',
    style: {
      preset: 'box',
      font: 'montserrat',
      weight: 800,
      size: 0.078,
      uppercase: true,
      textColor: '#FFFFFF',
      activeColor: '#7C3AED',
      emphasisColor: '#FFD83D',
      strokeColor: '#000000',
      strokeWidth: 0.05,
      shadow: 'soft',
      glow: false,
      background: 'none',
      backgroundColor: PANEL,
      highlight: 'box',
      animation: 'pop',
      wordsPerPage: 4,
      maxLines: 2,
      position: 0.66,
      emojis: true,
    },
  },
  minimal: {
    name: 'Clean',
    description: 'Quiet white type with a soft shadow; the whole phrase fades in.',
    style: {
      preset: 'minimal',
      font: 'inter',
      weight: 600,
      size: 0.062,
      uppercase: false,
      textColor: '#FFFFFF',
      activeColor: '#FFFFFF',
      emphasisColor: '#FFD873',
      strokeColor: '#000000',
      strokeWidth: 0,
      shadow: 'soft',
      glow: false,
      background: 'none',
      backgroundColor: PANEL,
      highlight: 'none',
      animation: 'fade',
      wordsPerPage: 5,
      maxLines: 2,
      position: 0.74,
      emojis: false,
    },
  },
  typewriter: {
    name: 'Typewriter',
    description: 'Each word appears the moment it is spoken, rising into place.',
    style: {
      preset: 'typewriter',
      font: 'poppins',
      weight: 700,
      size: 0.068,
      uppercase: false,
      textColor: '#FFFFFF',
      activeColor: '#FFB627',
      emphasisColor: '#6CF0C2',
      strokeColor: '#000000',
      strokeWidth: 0.06,
      shadow: 'soft',
      glow: false,
      background: 'none',
      backgroundColor: PANEL,
      highlight: 'color',
      animation: 'typewriter',
      wordsPerPage: 6,
      maxLines: 2,
      position: 0.68,
      emojis: true,
    },
  },
  neon: {
    name: 'Neon',
    description: 'Glowing pink tubes that strike up; the spoken word burns cyan.',
    style: {
      preset: 'neon',
      font: 'montserrat',
      weight: 800,
      size: 0.08,
      uppercase: true,
      textColor: '#FF3DD8',
      activeColor: '#2EF6FF',
      emphasisColor: '#FFF04D',
      strokeColor: '#000000',
      strokeWidth: 0.045,
      shadow: 'soft',
      glow: true,
      background: 'none',
      backgroundColor: PANEL,
      highlight: 'color',
      animation: 'fade',
      wordsPerPage: 3,
      maxLines: 2,
      position: 0.62,
      emojis: true,
    },
  },
  bounce: {
    name: 'Bounce',
    description: 'Tall condensed capitals that bounce in one by one as they are said.',
    style: {
      preset: 'bounce',
      font: 'anton',
      weight: 400,
      size: 0.1,
      uppercase: true,
      textColor: '#FFFFFF',
      activeColor: '#3BFF5C',
      emphasisColor: '#FFE500',
      strokeColor: '#000000',
      strokeWidth: 0.09,
      shadow: 'soft',
      glow: false,
      background: 'none',
      backgroundColor: PANEL,
      highlight: 'color',
      animation: 'bounce',
      wordsPerPage: 3,
      maxLines: 2,
      position: 0.64,
      emojis: true,
    },
  },
  subtitle: {
    name: 'Subtitle',
    description: 'Classic subtitles: whole sentences on a soft dark panel near the bottom.',
    style: {
      preset: 'subtitle',
      font: 'inter',
      weight: 500,
      size: 0.048,
      uppercase: false,
      textColor: '#FFFFFF',
      activeColor: '#FFFFFF',
      emphasisColor: '#FFE38A',
      strokeColor: '#000000',
      strokeWidth: 0,
      shadow: 'none',
      glow: false,
      background: 'box',
      backgroundColor: 'rgba(0,0,0,0.62)',
      highlight: 'none',
      animation: 'fade',
      wordsPerPage: 10,
      maxLines: 2,
      position: 0.78,
      emojis: false,
    },
  },
  comic: {
    name: 'Comic',
    description: 'Comic-book yellow with a heavy outline and a hard drop shadow.',
    style: {
      preset: 'comic',
      font: 'bangers',
      weight: 400,
      size: 0.1,
      uppercase: true,
      textColor: '#FFE234',
      activeColor: '#FFFFFF',
      emphasisColor: '#FF4A3D',
      strokeColor: '#000000',
      strokeWidth: 0.1,
      shadow: 'hard',
      glow: false,
      background: 'none',
      backgroundColor: PANEL,
      highlight: 'color',
      animation: 'pop',
      wordsPerPage: 3,
      maxLines: 2,
      position: 0.64,
      emojis: true,
    },
  },
  marker: {
    name: 'Marker',
    description: 'Hand-lettered words with a highlighter swiped across each as it is said.',
    style: {
      preset: 'marker',
      font: 'marker',
      weight: 400,
      size: 0.076,
      uppercase: false,
      textColor: '#FFFFFF',
      activeColor: '#FF3D8B',
      emphasisColor: '#FFE14D',
      strokeColor: '#000000',
      strokeWidth: 0.05,
      shadow: 'soft',
      glow: false,
      background: 'none',
      backgroundColor: PANEL,
      highlight: 'underline',
      animation: 'slide',
      wordsPerPage: 4,
      maxLines: 2,
      position: 0.68,
      emojis: true,
    },
  },
}

export const DEFAULT_PRESET: CaptionPresetId = 'bold'

/** A fresh copy of a preset's style, safe to change. */
export function presetStyle(id: CaptionPresetId): CaptionStyle {
  return { ...(PRESETS[id] ?? PRESETS[DEFAULT_PRESET]).style }
}

/**
 * Switching preset keeps the user's position and words-per-page choices
 * where sensible: a setting the user changed from the old preset's default
 * carries over; one they left alone takes the new preset's default (so
 * Subtitle still lands near the bottom with long pages).
 */
export function applyPreset(current: CaptionStyle, id: CaptionPresetId): CaptionStyle {
  const next = presetStyle(id)
  const old = PRESETS[current.preset]?.style
  const moved = !old || Math.abs(current.position - old.position) > 0.005
  if (moved && Number.isFinite(current.position)) next.position = Math.min(0.95, Math.max(0.05, current.position))
  const repaged = !old || current.wordsPerPage !== old.wordsPerPage
  if (repaged && Number.isFinite(current.wordsPerPage)) {
    next.wordsPerPage = Math.min(12, Math.max(1, Math.round(current.wordsPerPage)))
  }
  if (old && current.emojis !== old.emojis) next.emojis = current.emojis
  return next
}

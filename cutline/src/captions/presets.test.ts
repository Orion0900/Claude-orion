import type { CaptionPresetId } from '../lib/types'
import { FONTS } from './fonts'
import { applyPreset, PRESET_ORDER, PRESETS, presetStyle } from './presets'

const IDS: CaptionPresetId[] = ['bold', 'karaoke', 'box', 'minimal', 'typewriter', 'neon', 'bounce', 'subtitle', 'comic', 'marker']

describe('presets', () => {
  it('lists all ten, once each, in order', () => {
    expect([...PRESET_ORDER].sort()).toEqual([...IDS].sort())
    expect(Object.keys(PRESETS).sort()).toEqual([...IDS].sort())
  })

  it.each(IDS)('%s is a complete, sensible style', (id) => {
    const { name, description, style } = PRESETS[id]
    expect(name.length).toBeGreaterThan(2)
    expect(description.length).toBeGreaterThan(10)
    expect(style.preset).toBe(id)
    expect(FONTS[style.font].weights).toContain(style.weight)
    expect(style.size).toBeGreaterThan(0.03)
    expect(style.size).toBeLessThan(0.14)
    expect(style.wordsPerPage).toBeGreaterThanOrEqual(1)
    expect(style.maxLines).toBeGreaterThanOrEqual(1)
    // Clear of the platform UI along the bottom of a 9:16 frame.
    expect(style.position).toBeGreaterThan(0.5)
    expect(style.position).toBeLessThanOrEqual(0.78)
    // Survives white footage: an outline, a shadow or a panel.
    expect(style.strokeWidth > 0 || style.shadow !== 'none' || style.background === 'box').toBe(true)
  })

  it('has distinct looks', () => {
    const looks = new Set(IDS.map((id) => {
      const s = PRESETS[id].style
      return [s.font, s.highlight, s.animation, s.textColor, s.activeColor, s.glow, s.background].join('|')
    }))
    expect(looks.size).toBe(IDS.length)
  })

  it('hands out fresh copies', () => {
    const a = presetStyle('bold')
    a.size = 1
    expect(PRESETS.bold.style.size).not.toBe(1)
    expect(presetStyle('bold')).toEqual(PRESETS.bold.style)
  })

  it('takes the new preset defaults when the user had changed nothing', () => {
    const next = applyPreset(presetStyle('bold'), 'subtitle')
    expect(next).toEqual(PRESETS.subtitle.style)
  })

  it('keeps a position and page size the user chose', () => {
    const mine = { ...presetStyle('bold'), position: 0.3, wordsPerPage: 5, textColor: '#123456' }
    const next = applyPreset(mine, 'neon')
    expect(next.preset).toBe('neon')
    expect(next.position).toBe(0.3)
    expect(next.wordsPerPage).toBe(5)
    // Colours belong to the look, so they switch.
    expect(next.textColor).toBe(PRESETS.neon.style.textColor)
  })

  it('keeps an emoji choice the user flipped', () => {
    const mine = { ...presetStyle('bold'), emojis: false }
    expect(applyPreset(mine, 'comic').emojis).toBe(false)
    expect(applyPreset(presetStyle('bold'), 'subtitle').emojis).toBe(false)
  })

  it('copes with a style from an unknown preset', () => {
    const odd = { ...presetStyle('bold'), preset: 'gone' as CaptionPresetId, position: 0.5 }
    expect(applyPreset(odd, 'box').position).toBe(0.5)
  })
})

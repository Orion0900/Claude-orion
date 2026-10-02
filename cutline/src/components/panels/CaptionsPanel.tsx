/** Caption look: the preset strip, then type, layout and colours. */
import { useEffect, useRef } from 'react'
import { ensureFont, FONTS } from '../../captions/fonts'
import { applyPreset, PRESET_ORDER, PRESETS } from '../../captions/presets'
import { drawCaptions } from '../../captions/render'
import type { CaptionPage, CaptionPresetId, CaptionStyle, FontId, Project } from '../../lib/types'
import type { UpdateOptions } from '../../hooks/useProject'
import { SliderRow, Swatches, ToggleRow } from '../Controls'

interface Props {
  project: Project
  update: (recipe: (p: Project) => Project, options?: UpdateOptions) => void
}

const TEXT_COLORS = ['#ffffff', '#ffe14d', '#000000', '#7cf7ff']
const ACTIVE_COLORS = ['#ffe14d', '#35d07f', '#7c5cff', '#ff3b5c', '#2fb8ff', '#ff8a00']
const OUTLINE_COLORS = ['#000000', '#ffffff', '#7c5cff', '#ff3b5c']

export function CaptionsPanel({ project, update }: Props) {
  const style = project.style
  const set = (patch: Partial<CaptionStyle>, group?: string) =>
    update((p) => ({ ...p, style: { ...p.style, ...patch } }), { group })

  return (
    <>
      <div className="group">
        <ToggleRow
          title="Captions"
          detail={project.captionsOff ? 'Off — the video is still cut and framed' : 'Burned into the video'}
          checked={!project.captionsOff}
          onChange={(on) => update((p) => ({ ...p, captionsOff: !on }))}
        />
        <PresetStrip
          value={style.preset}
          onPick={(id) => update((p) => ({ ...p, style: applyPreset(p.style, id), captionsOff: false }))}
        />
      </div>

      <div className="group">
        <h3>Text</h3>
        <div className="chips" role="group" aria-label="Font">
          {(Object.keys(FONTS) as FontId[]).map((id) => (
            <button
              key={id}
              type="button"
              className="pill"
              aria-pressed={style.font === id}
              style={{ fontFamily: `"${FONTS[id].family}", sans-serif`, fontWeight: nearestWeight(id, style.weight) }}
              onClick={() => set({ font: id, weight: nearestWeight(id, style.weight) })}
            >
              {FONTS[id].label}
            </button>
          ))}
        </div>
        <SliderRow
          label="Size"
          value={style.size}
          min={0.035}
          max={0.13}
          step={0.0025}
          format={(v) => `${Math.round(v * 1000)}`}
          onChange={(v) => set({ size: v }, 'style-size')}
        />
        <ToggleRow title="All caps" checked={style.uppercase} onChange={(v) => set({ uppercase: v })} />
        <ToggleRow
          title="Emojis"
          detail="Shown above the words they go with"
          checked={style.emojis}
          onChange={(v) => set({ emojis: v })}
        />
      </div>

      <div className="group">
        <h3>Layout</h3>
        <SliderRow
          label="Position"
          value={style.position}
          min={0.12}
          max={0.86}
          step={0.01}
          format={(v) => (v < 0.35 ? 'Top' : v > 0.65 ? 'Low' : 'Middle')}
          onChange={(v) => set({ position: v }, 'style-position')}
        />
        <SliderRow
          label="Words"
          value={style.wordsPerPage}
          min={1}
          max={8}
          step={1}
          format={(v) => `${v}`}
          onChange={(v) => set({ wordsPerPage: v }, 'style-words')}
        />
        <SliderRow
          label="Lines"
          value={style.maxLines}
          min={1}
          max={3}
          step={1}
          onChange={(v) => set({ maxLines: v }, 'style-lines')}
        />
      </div>

      <div className="group">
        <h3>Colours</h3>
        <ColorRow label="Text">
          <Swatches colors={TEXT_COLORS} value={style.textColor} label="Text colour" onChange={(c) => set({ textColor: c })} />
        </ColorRow>
        <ColorRow label="Spoken word">
          <Swatches
            colors={ACTIVE_COLORS}
            value={style.activeColor}
            label="Spoken word colour"
            onChange={(c) => set({ activeColor: c })}
          />
        </ColorRow>
        <ColorRow label="Keywords">
          <Swatches
            colors={ACTIVE_COLORS}
            value={style.emphasisColor}
            label="Keyword colour"
            onChange={(c) => set({ emphasisColor: c })}
          />
        </ColorRow>
        <ColorRow label="Outline">
          <Swatches
            colors={OUTLINE_COLORS}
            value={style.strokeColor}
            label="Outline colour"
            onChange={(c) => set({ strokeColor: c })}
          />
        </ColorRow>
        <SliderRow
          label="Outline"
          value={style.strokeWidth}
          min={0}
          max={0.3}
          step={0.01}
          format={(v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}`)}
          onChange={(v) => set({ strokeWidth: v }, 'style-stroke')}
        />
      </div>
    </>
  )
}

function ColorRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '6px 0 10px' }}>
      <div style={{ fontSize: 14, color: 'var(--dim)', marginBottom: 8 }}>{label}</div>
      {children}
    </div>
  )
}

function nearestWeight(font: FontId, weight: number): number {
  const weights = FONTS[font].weights
  return weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), weights[0])
}

/* ---- Preset tiles, each drawn by the real caption renderer ---- */

const SAMPLE: CaptionPage = {
  index: 0,
  start: 0,
  end: 3,
  emoji: null,
  words: [
    { id: 'a', text: 'Make', start: 0, end: 0.35, emphasis: false },
    { id: 'b', text: 'it', start: 0.35, end: 0.6, emphasis: false },
    { id: 'c', text: 'pop', start: 0.6, end: 1.2, emphasis: false },
  ],
}

function PresetStrip({ value, onPick }: { value: CaptionPresetId; onPick: (id: CaptionPresetId) => void }) {
  return (
    <div className="presets" role="group" aria-label="Caption style">
      {PRESET_ORDER.map((id) => (
        <PresetTile key={id} id={id} selected={id === value} onPick={onPick} />
      ))}
    </div>
  )
}

function PresetTile({
  id,
  selected,
  onPick,
}: {
  id: CaptionPresetId
  selected: boolean
  onPick: (id: CaptionPresetId) => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const preset = PRESETS[id]
  useEffect(() => {
    let live = true
    const paint = () => {
      const canvas = ref.current
      if (!canvas || !live) return
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = Math.round(108 * dpr)
      canvas.height = Math.round(72 * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const style: CaptionStyle = {
        ...preset.style,
        size: preset.style.size * 3.1,
        position: 0.52,
        wordsPerPage: 3,
        maxLines: 1,
        emojis: false,
      }
      // Late enough that every entrance has settled, with "pop" the word being spoken.
      drawCaptions(ctx, SAMPLE, 0.9, style, { width: canvas.width, height: canvas.height })
    }
    paint()
    ensureFont(preset.style.font, preset.style.weight)
      .catch(() => {})
      .then(paint)
    return () => {
      live = false
    }
  }, [preset])
  return (
    <button type="button" className="preset" aria-pressed={selected} onClick={() => onPick(id)}>
      <canvas ref={ref} aria-hidden="true" />
      <span>{preset.name}</span>
    </button>
  )
}

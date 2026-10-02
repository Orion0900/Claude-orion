/** Shape and framing: aspect ratio, fill or fit, framing on the face, zooms, the hook card and progress bar. */
import { ASPECTS } from '../../lib/format'
import type { FormatSettings, Project } from '../../lib/types'
import type { UpdateOptions } from '../../hooks/useProject'
import { Segmented, SliderRow, Swatches, ToggleRow } from '../Controls'

interface Props {
  project: Project
  update: (recipe: (p: Project) => Project, options?: UpdateOptions) => void
}

const BG_COLORS = ['#000000', '#ffffff', '#111827', '#7c5cff', '#ffe14d']
const BAR_COLORS = ['#ffe14d', '#ffffff', '#35d07f', '#ff3b5c', '#7c5cff']

export function FormatPanel({ project, update }: Props) {
  const f = project.format
  const set = (patch: Partial<FormatSettings>, group?: string) =>
    update((p) => ({ ...p, format: { ...p.format, ...patch } }), { group })
  const hook = project.hook

  return (
    <>
      <div className="group">
        <h3>Shape</h3>
        <div className="chips" role="group" aria-label="Aspect ratio">
          {ASPECTS.map((a) => (
            <button key={a.id} className="pill" aria-pressed={f.aspect === a.id} onClick={() => set({ aspect: a.id })}>
              {a.label}
              <small style={{ color: 'var(--dim)', fontWeight: 500 }}>{a.hint}</small>
            </button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          <Segmented
            label="Fit"
            value={f.fit}
            onChange={(fit) => set({ fit })}
            options={[
              { value: 'fill', label: 'Fill the frame' },
              { value: 'fit', label: 'Show everything' },
            ]}
          />
        </div>
        {f.fit === 'fit' && (
          <div style={{ marginTop: 12 }}>
            <Segmented
              label="Background"
              value={f.background}
              onChange={(background) => set({ background })}
              options={[
                { value: 'blur', label: 'Blurred' },
                { value: 'color', label: 'Colour' },
              ]}
            />
            {f.background === 'color' && (
              <div style={{ marginTop: 12 }}>
                <Swatches
                  colors={BG_COLORS}
                  value={f.backgroundColor}
                  label="Background colour"
                  onChange={(c) => set({ backgroundColor: c })}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="group">
        <h3>Framing</h3>
        <SliderRow
          label="Zoom"
          value={f.zoom}
          min={1}
          max={2.5}
          step={0.01}
          format={(v) => `${Math.round(v * 100)}%`}
          onChange={(v) => set({ zoom: v }, 'zoom')}
        />
        <SliderRow
          label="Left–right"
          value={f.focusX}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round((v - 0.5) * 200)}`}
          onChange={(v) => set({ focusX: v }, 'focus-x')}
        />
        <SliderRow
          label="Up–down"
          value={f.focusY}
          min={0}
          max={1}
          step={0.01}
          format={(v) => `${Math.round((v - 0.5) * 200)}`}
          onChange={(v) => set({ focusY: v }, 'focus-y')}
        />
        <ToggleRow
          title="Auto zoom"
          detail="Punches in on the big moments and at jump cuts"
          checked={f.autoZoom}
          onChange={(v) => set({ autoZoom: v })}
        />
        {f.autoZoom && (
          <SliderRow
            label="Strength"
            value={f.zoomStrength}
            min={0.05}
            max={0.35}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => set({ zoomStrength: v }, 'zoom-strength')}
          />
        )}
      </div>

      <div className="group">
        <h3>Hook</h3>
        <ToggleRow
          title="Title card"
          detail="A bold line over the first seconds to stop the scroll"
          checked={hook.enabled}
          onChange={(v) => update((p) => ({ ...p, hook: { ...p.hook, enabled: v } }))}
        />
        {hook.enabled && (
          <>
            <input
              className="field"
              placeholder="e.g. Nobody tells you this about money"
              value={hook.text}
              maxLength={90}
              onChange={(e) => update((p) => ({ ...p, hook: { ...p.hook, text: e.target.value } }), { group: 'hook-text' })}
            />
            <SliderRow
              label="On screen"
              value={hook.duration}
              min={1}
              max={8}
              step={0.5}
              format={(v) => `${v} s`}
              onChange={(v) => update((p) => ({ ...p, hook: { ...p.hook, duration: v } }), { group: 'hook-duration' })}
            />
            <p className="hint">The AI tab can write hook ideas from what you said.</p>
          </>
        )}
      </div>

      <div className="group">
        <h3>Progress bar</h3>
        <ToggleRow
          title="Progress bar"
          detail="A thin bar along the top that fills as the video plays"
          checked={f.progressBar}
          onChange={(v) => set({ progressBar: v })}
        />
        {f.progressBar && (
          <Swatches
            colors={BAR_COLORS}
            value={f.progressColor}
            label="Bar colour"
            onChange={(c) => set({ progressColor: c })}
          />
        )}
      </div>
    </>
  )
}

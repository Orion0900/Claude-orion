import { useEffect, useRef, useState } from 'react'
import { back, go } from '../../router'
import { createFromPhoto, type CreateResult } from '../../store/analysis'
import { useSettings } from '../../store/settings'
import { CameraCapture } from '../components/CameraCapture'
import { Alert, Back, Camera, Check, Photo } from '../components/Icons'

export function PhotoTips({ profile = false }: { profile?: boolean }) {
  const tips = profile
    ? [
        'Turn a full 90° so your nose points at the edge of the frame, and look straight ahead — not down.',
        'Tuck your hair behind your ear; keep your jawline and neck clear of hair and collars.',
        'Lips relaxed and together, teeth lightly closed, chin level.',
        'Have someone take it at your eye level from 1–2 m, or prop the phone up and use the timer.',
      ]
    : [
        'Face the camera squarely, eyes on the lens, chin level.',
        'Neutral expression: lips together, no smile, eyebrows relaxed.',
        'Hair off your forehead and ears, glasses off.',
        'Soft, even light from the front — face a window. No flash, no harsh side light.',
        'Best of all, have someone take it from 1–2 m with the 2× lens: close-up selfies make the nose look wider.',
      ]
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="eyebrow">{profile ? 'For an accurate profile' : 'For accurate numbers'}</div>
      <ul className="check-list">
        {tips.map((t) => (
          <li key={t}>
            <Check style={{ color: 'var(--accent)' }} />
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type State = { kind: 'choose' } | { kind: 'working'; preview: string; progress: number | null; stage: string } | { kind: 'failed'; preview: string | null; result: Exclude<CreateResult, { ok: true }> }

export function NewAnalysis() {
  const [settings] = useSettings()
  const [state, setState] = useState<State>({ kind: 'choose' })
  const [camera, setCamera] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const previewUrl = useRef<string | null>(null)
  useEffect(() => () => void (previewUrl.current && URL.revokeObjectURL(previewUrl.current)), [])

  const process = async (file: Blob) => {
    setCamera(false)
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    const preview = URL.createObjectURL(file)
    previewUrl.current = preview
    setState({ kind: 'working', preview, progress: null, stage: 'Finding your face…' })
    const result = await createFromPhoto(file, settings.sex, (loaded, total) =>
      setState((s) => (s.kind === 'working' ? { ...s, progress: total ? loaded / total : null, stage: 'Preparing the analysis engine (first time only)…' } : s)),
    )
    if (result.ok) go({ name: 'review', id: result.id }, true)
    else setState({ kind: 'failed', preview, result })
  }

  return (
    <div className="screen">
      <div className="topbar">
        <button className="icon-btn" aria-label="Back" onClick={() => back()}>
          <Back />
        </button>
        <div className="title">New analysis</div>
        <div className="spacer" />
      </div>

      {state.kind === 'choose' && (
        <>
          <div className="stack" style={{ gap: 8 }}>
            <h1>A front photo</h1>
            <p className="muted">Straight on, neutral expression, good light. Facet finds 478 points on your face and measures from them.</p>
          </div>
          <PhotoTips />
          <div className="sticky-actions" style={{ flexDirection: 'column' }}>
            <button className="btn primary" onClick={() => setCamera(true)}>
              <Camera /> Take a photo
            </button>
            <button className="btn" onClick={() => input.current?.click()}>
              <Photo /> Choose from your photos
            </button>
          </div>
        </>
      )}

      {state.kind === 'working' && (
        <div className="stack" style={{ gap: 16, paddingTop: 10 }}>
          <div className="scan">
            <img src={state.preview} alt="Your photo" />
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <div className="row">
              <div className="spinner" />
              <div>{state.stage}</div>
            </div>
            {state.progress !== null && (
              <div className="progress" aria-label="Download progress">
                <span style={{ width: `${Math.round(state.progress * 100)}%` }} />
              </div>
            )}
            <p className="small faint">Everything happens on this device.</p>
          </div>
        </div>
      )}

      {state.kind === 'failed' && (
        <div className="stack" style={{ gap: 16, paddingTop: 10 }}>
          {state.preview && (
            <div className="scan" style={{ opacity: 0.7 }}>
              <img src={state.preview} alt="" />
            </div>
          )}
          <div className="banner bad">
            <Alert />
            <div className="stack" style={{ gap: 4 }}>
              <strong>{state.result.message}</strong>
              <span className="muted small">
                {state.result.reason === 'noface'
                  ? 'Use a clear, front-on photo where your whole face is visible, well lit and not too small in the frame.'
                  : state.result.reason === 'engine'
                    ? 'Connect to the internet once so the engine can download; after that it works offline.'
                    : 'Try a JPEG, PNG or HEIC photo from your library.'}
              </span>
            </div>
          </div>
          <div className="row">
            <button className="btn grow" onClick={() => setCamera(true)}>
              <Camera /> Take one
            </button>
            <button className="btn primary grow" onClick={() => input.current?.click()}>
              <Photo /> Choose another
            </button>
          </div>
        </div>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void process(f)
        }}
      />
      {camera && <CameraCapture mode="front" onCapture={(b) => void process(b)} onClose={() => setCamera(false)} />}
    </div>
  )
}

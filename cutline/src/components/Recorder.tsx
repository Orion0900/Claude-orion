/**
 * Record to camera with a teleprompter. The script scrolls just under the
 * lens so your eyes stay near it, at a speed you set; tap the script to
 * pause it. A take goes straight into a new project.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { AiError } from '../ai/claude'
import { hasAi, loadAiSettings } from '../ai/settings'
import { writeScript } from '../ai/tasks'
import { formatClock } from '../lib/project'
import { useObjectUrl } from '../hooks/useObjectUrl'
import { Sheet, SliderRow, ToggleRow } from './Controls'
import { CloseIcon, EditIcon, FlipIcon, SparklesIcon, TextIcon } from './Icons'

interface Props {
  onClose: () => void
  onUse: (blob: Blob, fileName: string) => void
}

interface PrompterPrefs {
  script: string
  speed: number
  size: number
  mirror: boolean
}

const PREFS_KEY = 'cutline.prompter'
const DEFAULT_PREFS: PrompterPrefs = {
  script:
    "Paste or write your script here.\n\nIt scrolls while you record — tap it to pause.\n\nLook just above the words, near the camera, and talk like you're telling a friend.",
  speed: 34,
  size: 30,
  mirror: true,
}

function loadPrefs(): PrompterPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<PrompterPrefs> | null
    if (!v) return { ...DEFAULT_PREFS }
    return {
      script: typeof v.script === 'string' ? v.script : DEFAULT_PREFS.script,
      speed: typeof v.speed === 'number' ? v.speed : DEFAULT_PREFS.speed,
      size: typeof v.size === 'number' ? v.size : DEFAULT_PREFS.size,
      mirror: typeof v.mirror === 'boolean' ? v.mirror : DEFAULT_PREFS.mirror,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function savePrefs(p: PrompterPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // Fine: the script just isn't remembered.
  }
}

/** What this browser's MediaRecorder can write, best first: iPhones record MP4. */
function recorderType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const options = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return options.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
}

type Mode = 'ready' | 'countdown' | 'recording' | 'review'

export function Recorder({ onClose, onUse }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scriptRef = useRef<HTMLDivElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  const scroll = useRef({ y: 0, last: 0, raf: 0, paused: false })
  const [prefs, setPrefs] = useState<PrompterPrefs>(loadPrefs)
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('ready')
  const [count, setCount] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [take, setTake] = useState<Blob | null>(null)
  const [sheet, setSheet] = useState<'script' | 'look' | 'ai' | null>(null)
  const takeUrl = useObjectUrl(take)

  const update = (patch: Partial<PrompterPrefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch }
      savePrefs(next)
      return next
    })

  // The camera, opened for this screen and released when it closes or flips.
  useEffect(() => {
    let live = true
    setCameraError(null)
    const open = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('This browser has no camera access. Open Cutline in Safari.')
        return
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
          audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
        })
        if (!live) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream.current = s
        const v = videoRef.current
        if (v) {
          v.srcObject = s
          await v.play().catch(() => {})
        }
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        setCameraError(
          name === 'NotAllowedError'
            ? 'Camera and microphone access is off. Allow it for this site in Settings › Safari, then come back.'
            : "The camera couldn't start. Close other apps using it and try again.",
        )
      }
    }
    void open()
    return () => {
      live = false
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
    }
  }, [facing])

  // The review screen replaces the camera view, so a retake needs the live
  // stream put back on the fresh <video>.
  useEffect(() => {
    const v = videoRef.current
    const s = stream.current
    if (mode === 'review' || !v || !s || v.srcObject === s) return
    v.srcObject = s
    void v.play().catch(() => {})
  }, [mode])

  const stopScroll = () => cancelAnimationFrame(scroll.current.raf)

  const scrollTick = useCallback(
    (now: number) => {
      const s = scroll.current
      const dt = s.last ? (now - s.last) / 1000 : 0
      s.last = now
      if (!s.paused) s.y += prefs.speed * dt
      if (scriptRef.current) scriptRef.current.style.transform = `translateY(${-s.y}px)`
      s.raf = requestAnimationFrame(scrollTick)
    },
    [prefs.speed],
  )

  const startRecording = () => {
    const s = stream.current
    if (!s) return
    const type = recorderType()
    let r: MediaRecorder
    try {
      r = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 128_000 })
    } catch {
      setCameraError("This browser can't record video here.")
      return
    }
    chunks.current = []
    r.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data)
    }
    r.onstop = () => {
      const blob = new Blob(chunks.current, { type: r.mimeType || type || 'video/mp4' })
      chunks.current = []
      setTake(blob)
      setMode('review')
    }
    recorder.current = r
    r.start(1000)
    setElapsed(0)
    setMode('recording')
    scroll.current = { y: 0, last: 0, raf: 0, paused: false }
    scroll.current.raf = requestAnimationFrame(scrollTick)
  }

  // Countdown, then roll.
  useEffect(() => {
    if (mode !== 'countdown') return
    if (count === 0) {
      startRecording()
      return
    }
    const t = window.setTimeout(() => setCount((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [mode, count])

  useEffect(() => {
    if (mode !== 'recording') return
    const started = Date.now()
    const t = window.setInterval(() => setElapsed((Date.now() - started) / 1000), 250)
    return () => window.clearInterval(t)
  }, [mode])

  useEffect(() => () => stopScroll(), [])

  const stop = () => {
    stopScroll()
    if (recorder.current && recorder.current.state !== 'inactive') recorder.current.stop()
  }

  const press = () => {
    if (mode === 'ready') {
      setCount(3)
      setMode('countdown')
    } else if (mode === 'countdown') {
      setMode('ready')
    } else if (mode === 'recording') {
      stop()
    }
  }

  const leave = () => {
    stop()
    onClose()
  }

  const useTake = () => {
    if (!take) return
    const ext = take.type.includes('webm') ? 'webm' : 'mp4'
    const stamp = new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    onUse(take, `Take ${stamp}.${ext}`)
  }

  if (mode === 'review' && takeUrl) {
    return (
      <div className="recorder">
        <video src={takeUrl} playsInline controls autoPlay style={{ objectFit: 'contain' }} />
        <div className="rec-bottom">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              className="btn"
              onClick={() => {
                setTake(null)
                setMode('ready')
              }}
            >
              Retake
            </button>
            <button className="btn primary" onClick={useTake}>
              Use this take
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="recorder">
      <video ref={videoRef} className={facing === 'user' && prefs.mirror ? 'mirror' : ''} playsInline muted autoPlay />
      {cameraError && <div className="camera-note">{cameraError}</div>}

      <div className="rec-top">
        <button className="icon-btn" onClick={leave} aria-label="Close">
          <CloseIcon />
        </button>
        <span className="spacer" />
        {mode === 'recording' ? (
          <span className="rec-timer">● {formatClock(elapsed)}</span>
        ) : (
          <>
            <button className="icon-btn" onClick={() => setSheet('script')} aria-label="Edit script">
              <EditIcon />
            </button>
            <button className="icon-btn" onClick={() => setSheet('look')} aria-label="Prompter settings">
              <TextIcon />
            </button>
            <button
              className="icon-btn"
              onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              aria-label="Flip camera"
            >
              <FlipIcon />
            </button>
          </>
        )}
      </div>

      {prefs.script.trim() && (
        <div
          className="prompter"
          onClick={() => {
            if (mode === 'recording') scroll.current.paused = !scroll.current.paused
          }}
        >
          <div
            ref={scriptRef}
            className="script"
            style={{ fontSize: prefs.size, transform: mode === 'recording' ? undefined : 'translateY(0)' }}
          >
            {prefs.script}
          </div>
        </div>
      )}

      {mode === 'countdown' && count > 0 && (
        <div className="countdown">
          <span key={count}>{count}</span>
        </div>
      )}

      <div className="rec-bottom">
        <div className="rec-controls">
          <span />
          <button
            className={`rec-btn${mode === 'recording' ? ' on' : ''}`}
            onClick={press}
            disabled={!!cameraError}
            aria-label={mode === 'recording' ? 'Stop recording' : 'Record'}
          >
            <i />
          </button>
          <span />
        </div>
      </div>

      {sheet === 'script' && (
        <ScriptSheet
          script={prefs.script}
          onClose={() => setSheet(null)}
          onSave={(script) => {
            update({ script })
            setSheet(null)
          }}
          onAi={() => setSheet('ai')}
        />
      )}
      {sheet === 'look' && (
        <Sheet title="Teleprompter" onClose={() => setSheet(null)}>
          <SliderRow label="Speed" value={prefs.speed} min={10} max={90} step={1} format={(v) => `${v}`} onChange={(v) => update({ speed: v })} />
          <SliderRow label="Text size" value={prefs.size} min={20} max={48} step={1} format={(v) => `${v}`} onChange={(v) => update({ size: v })} />
          <ToggleRow
            title="Mirror the front camera"
            detail="Only the preview is mirrored; the take is saved the right way round"
            checked={prefs.mirror}
            onChange={(v) => update({ mirror: v })}
          />
        </Sheet>
      )}
      {sheet === 'ai' && (
        <AiScriptSheet
          onClose={() => setSheet(null)}
          onScript={(script) => {
            update({ script })
            setSheet(null)
          }}
        />
      )}
    </div>
  )
}

function ScriptSheet({
  script,
  onClose,
  onSave,
  onAi,
}: {
  script: string
  onClose: () => void
  onSave: (s: string) => void
  onAi: () => void
}) {
  const [text, setText] = useState(script)
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return (
    <Sheet title="Script" onClose={onClose}>
      <textarea className="field" style={{ minHeight: 220 }} value={text} onChange={(e) => setText(e.target.value)} aria-label="Script" />
      <p className="hint">
        {words} words · about {formatClock((words / 150) * 60)} at a natural pace
      </p>
      <div className="actions">
        <button className="btn primary block" onClick={() => onSave(text)}>
          Save script
        </button>
        <button className="btn block" onClick={onAi}>
          <SparklesIcon /> Write it with Claude
        </button>
      </div>
    </Sheet>
  )
}

function AiScriptSheet({ onClose, onScript }: { onClose: () => void; onScript: (s: string) => void }) {
  const [ai] = useState(loadAiSettings)
  const [topic, setTopic] = useState('')
  const [seconds, setSeconds] = useState(45)
  const [tone, setTone] = useState('Energetic and direct')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => controller.current?.abort(), [])

  if (!hasAi(ai)) {
    return (
      <Sheet title="Write with Claude" onClose={onClose}>
        <p className="hint">Add your Anthropic API key in Settings first. It stays on this phone.</p>
      </Sheet>
    )
  }
  return (
    <Sheet title="Write with Claude" onClose={onClose}>
      <textarea
        className="field"
        placeholder="What's the video about? e.g. 3 habits that got me through my first month of 92 Hard"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        aria-label="Topic"
      />
      <SliderRow label="Length" value={seconds} min={15} max={180} step={5} format={(v) => `${v} s`} onChange={setSeconds} />
      <div className="chips wrap" style={{ marginTop: 6 }}>
        {['Energetic and direct', 'Calm and thoughtful', 'Funny', 'Storytelling', 'Educational'].map((t) => (
          <button key={t} className="pill" aria-pressed={tone === t} onClick={() => setTone(t)}>
            {t}
          </button>
        ))}
      </div>
      {error && (
        <div className="error-card" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}
      <div className="actions">
        <button
          className="btn primary block"
          disabled={!topic.trim() || busy}
          onClick={async () => {
            controller.current?.abort()
            const ac = new AbortController()
            controller.current = ac
            setBusy(true)
            setError(null)
            try {
              const r = await writeScript(ai, { topic: topic.trim(), seconds, tone }, ac.signal)
              onScript(r.script)
            } catch (e) {
              if (!ac.signal.aborted) setError(e instanceof AiError || e instanceof Error ? e.message : String(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          <SparklesIcon /> {busy ? 'Writing…' : 'Write script'}
        </button>
      </div>
    </Sheet>
  )
}

import { useEffect, useRef, useState } from 'react'
import { videoLandmarker } from '../../detect/landmarker'
import { canvasToBlob } from '../../detect/image'
import { PITCH_BIAS, poseFromMatrix } from '../../face/pose'
import type { FaceDetection } from '../../face/types'
import { Close, Flip, Timer } from './Icons'

interface Props {
  mode: 'front' | 'profile'
  onCapture: (photo: Blob) => void
  onClose: () => void
}

interface Guidance {
  ok: boolean
  message: string
}

/** What to tell someone lining up a front photo, from one live detection. */
export function guide(det: FaceDetection | null): Guidance {
  if (!det) return { ok: false, message: 'Fit your face inside the oval' }
  const lm = det.landmarks
  const xs = [lm[234].x, lm[454].x]
  const faceW = Math.abs(xs[1] - xs[0]) / det.width
  const cx = (lm[234].x + lm[454].x) / 2 / det.width
  const cy = (lm[10].y + lm[152].y) / 2 / det.height
  if (faceW < 0.26) return { ok: false, message: 'Come a little closer' }
  if (faceW > 0.62) return { ok: false, message: 'Move back a little' }
  if (Math.abs(cx - 0.5) > 0.12 || Math.abs(cy - 0.5) > 0.14) return { ok: false, message: 'Centre your face in the oval' }
  if (det.matrix) {
    const pose = poseFromMatrix(det.matrix)
    // Directions are the person's own: a head turned to the photo's right has turned to their left.
    if (pose.yaw > 4) return { ok: false, message: 'Turn your head slightly to your right' }
    if (pose.yaw < -4) return { ok: false, message: 'Turn your head slightly to your left' }
    const pitch = pose.pitch + PITCH_BIAS
    if (pitch > 7) return { ok: false, message: 'Lower your chin a little' }
    if (pitch < -7) return { ok: false, message: 'Raise your chin a little' }
    if (Math.abs(pose.roll) > 5) return { ok: false, message: 'Keep your head level' }
  }
  const b = det.blendshapes
  if (Math.max(b.mouthSmileLeft ?? 0, b.mouthSmileRight ?? 0) > 0.3) return { ok: false, message: 'Relax your mouth — no smile' }
  if ((b.jawOpen ?? 0) > 0.1) return { ok: false, message: 'Close your lips gently' }
  if (Math.max(b.eyeBlinkLeft ?? 0, b.eyeBlinkRight ?? 0) > 0.5) return { ok: false, message: 'Keep your eyes open' }
  if (Math.max(b.browInnerUp ?? 0, b.browOuterUpLeft ?? 0, b.browOuterUpRight ?? 0) > 0.45) return { ok: false, message: 'Relax your eyebrows' }
  return { ok: true, message: 'Hold still…' }
}

const HOLD_MS = 900
const TIMERS = [0, 3, 10]

export function CameraCapture({ mode, onCapture, onClose }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [facing, setFacing] = useState<'user' | 'environment'>(mode === 'front' ? 'user' : 'environment')
  const [error, setError] = useState<string | null>(null)
  const [guidance, setGuidance] = useState<Guidance>({ ok: false, message: mode === 'front' ? 'Starting camera…' : 'Line up your profile with the outline' })
  const [timer, setTimer] = useState(0)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [held, setHeld] = useState(0)
  const captured = useRef(false)

  const capture = async () => {
    const v = video.current
    if (!v || captured.current || !v.videoWidth) return
    captured.current = true
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    onCapture(await canvasToBlob(c, 0.92))
  }

  // Start the camera.
  useEffect(() => {
    let stream: MediaStream | null = null
    let alive = true
    captured.current = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser can’t open the camera. Choose a photo from your library instead.')
      return
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (!alive) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play().catch(() => {})
        }
      })
      .catch(() => setError('Camera access was refused. Allow it in Settings, or choose a photo from your library.'))
    return () => {
      alive = false
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [facing])

  // Live guidance for the front photo, then capture once it has held steady.
  useEffect(() => {
    if (mode !== 'front' || timer > 0) return
    let alive = true
    let raf = 0
    let last = 0
    let goodSince = 0
    let detect: ((v: HTMLVideoElement, t: number) => FaceDetection | null) | null = null
    let prevNose: { x: number; y: number } | null = null
    videoLandmarker()
      .then((d) => (detect = d))
      .catch(() => setGuidance({ ok: false, message: 'Live guidance unavailable — use the shutter' }))
    const tick = (now: number) => {
      if (!alive) return
      raf = requestAnimationFrame(tick)
      const v = video.current
      if (!detect || !v || v.readyState < 2 || now - last < 80) return
      last = now
      const det = detect(v, now)
      const g = guide(det)
      // Steady: the nose tip has barely moved since the last frame.
      const nose = det ? { x: det.landmarks[4].x / det.width, y: det.landmarks[4].y / det.height } : null
      const steady = !!nose && !!prevNose && Math.hypot(nose.x - prevNose.x, nose.y - prevNose.y) < 0.006
      prevNose = nose
      if (g.ok && steady) {
        goodSince ||= now
        setHeld(Math.min(1, (now - goodSince) / HOLD_MS))
        if (now - goodSince >= HOLD_MS) void capture()
      } else {
        goodSince = 0
        setHeld(0)
      }
      setGuidance(g)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, [mode, timer, facing])

  // Self-timer.
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      setCountdown(null)
      void capture()
      return
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [countdown])

  const shutter = () => {
    if (timer > 0) setCountdown(timer)
    else void capture()
  }
  const ready = guidance.ok
  const ringColor = ready ? 'var(--accent)' : 'rgba(255,255,255,0.85)'

  return (
    <div className="camera" role="dialog" aria-label="Camera">
      <video ref={video} playsInline muted autoPlay className={facing === 'user' ? 'mirror' : undefined} />
      <svg className="camera-overlay" viewBox="0 0 100 160" preserveAspectRatio="xMidYMid slice" aria-hidden>
        {mode === 'front' ? (
          <>
            <defs>
              <mask id="oval-cut">
                <rect width="100" height="160" fill="white" />
                <ellipse cx="50" cy="78" rx="29" ry="39" fill="black" />
              </mask>
            </defs>
            <rect width="100" height="160" fill="rgba(0,0,0,0.45)" mask="url(#oval-cut)" />
            <ellipse cx="50" cy="78" rx="29" ry="39" fill="none" stroke={ringColor} strokeWidth="0.6" />
            {held > 0 && (
              <ellipse cx="50" cy="78" rx="29" ry="39" fill="none" stroke="var(--accent)" strokeWidth="1.4" pathLength={100} strokeDasharray={`${held * 100} 100`} transform="rotate(-90 50 78)" />
            )}
            <line x1="50" y1="36" x2="50" y2="120" stroke="rgba(255,255,255,0.18)" strokeWidth="0.3" />
          </>
        ) : (
          <path
            d="M58 40c-11 0-19 8-19 19 0 6 2 10 4 13v28c0 6 4 10 10 10h4v18M58 40c8 0 13 6 14 13 1 4 4 7 6 11 1 2 0 3-2 3l-3 1 1 4-2 2 1 3c0 3-2 5-5 5l-6-1v3"
            fill="none"
            stroke="rgba(255,255,255,0.75)"
            strokeWidth="0.6"
            strokeDasharray="1.6 1.2"
            transform={facing === 'user' ? 'translate(100 0) scale(-1 1)' : undefined}
          />
        )}
      </svg>

      <div className="camera-top">
        <button className="icon-btn" aria-label="Close camera" onClick={onClose}>
          <Close />
        </button>
        <button className="icon-btn" aria-label={`Timer: ${timer ? `${timer} seconds` : 'off'}`} onClick={() => setTimer((t) => TIMERS[(TIMERS.indexOf(t) + 1) % TIMERS.length])}>
          {timer ? <span style={{ fontWeight: 700, fontSize: 14 }}>{timer}s</span> : <Timer />}
        </button>
      </div>

      <div className="camera-status" aria-live="polite">
        {error ?? (countdown !== null ? `${countdown}` : mode === 'front' && timer === 0 ? guidance.message : mode === 'front' ? 'Timer on: press the shutter, then hold still' : 'Profile: nose towards the edge, eyes level')}
      </div>

      <div className="camera-bottom">
        <div style={{ width: 48 }} />
        <button className="shutter" aria-label="Take photo" onClick={shutter} disabled={!!error}>
          <span />
        </button>
        <button className="icon-btn" aria-label="Switch camera" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
          <Flip />
        </button>
      </div>
    </div>
  )
}

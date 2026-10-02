/**
 * The live preview: the source video plays in a hidden <video>, and every
 * animation frame is composed onto a canvas through the same drawFrame the
 * export uses. Cuts are played by jumping the video over them, so the
 * preview is the edit, not an approximation of it.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { fitInside, type Size } from '../lib/format'
import { drawFrame, newScratch } from '../render/compose'
import type { RenderPlan } from '../render/plan'
import { PlayIcon } from './Icons'

export interface PlayerHandle {
  play(): void
  pause(): void
  toggle(): void
  /** Jump to an edited time. */
  seek(t: number): void
  time(): number
  playing(): boolean
}

interface Props {
  sourceUrl: string
  plan: RenderPlan
  /** The composition's full size, e.g. 1080x1920; the canvas draws a scaled copy. */
  out: Size
  music?: { url: string; volume: number } | null
  onTime?: (t: number) => void
  onPlayingChange?: (playing: boolean) => void
  /** Bumped by the editor when something drawn changed without the plan changing (fonts loaded). */
  redrawKey?: number
  children?: React.ReactNode
}

/** How close to a range's end counts as reaching it; a frame at 60 fps. */
const EDGE = 1 / 60

/** The range playing at source time `now`, else the next one to play; -1 when past the last. */
function locate(ranges: { start: number; end: number }[], inside: number, now: number): number {
  if (inside >= 0) return inside
  return ranges.findIndex((r) => r.start > now)
}

export const Preview = forwardRef<PlayerHandle, Props>(function Preview(
  { sourceUrl, plan, out, music, onTime, onPlayingChange, redrawKey, children },
  ref,
) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [box, setBox] = useState<Size>({ width: 0, height: 0 })
  const [isPlaying, setIsPlaying] = useState(false)

  const planRef = useRef(plan)
  const outRef = useRef(out)
  const scratch = useRef(newScratch())
  const state = useRef({ playing: false, t: 0, segment: 0, raf: 0, lastReport: 0, primed: false })
  const callbacks = useRef({ onTime, onPlayingChange })
  callbacks.current = { onTime, onPlayingChange }

  // The canvas is as big as the stage allows at the composition's aspect.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setBox({ width: el.clientWidth - 24, height: el.clientHeight - 8 })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const display = fitInside(box, out.width / out.height)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const ready = video.readyState >= 2 && video.videoWidth > 0
    drawFrame(
      ctx,
      ready ? video : null,
      { width: video.videoWidth, height: video.videoHeight },
      state.current.t,
      planRef.current,
      { width: canvas.width, height: canvas.height },
      scratch.current,
    )
  }, [])

  const report = useCallback((force = false) => {
    const now = performance.now()
    if (!force && now - state.current.lastReport < 90) return
    state.current.lastReport = now
    callbacks.current.onTime?.(state.current.t)
  }, [])

  const syncMusic = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return
    audio.currentTime = state.current.t % audio.duration
  }, [])

  const setPlaying = useCallback((playing: boolean) => {
    state.current.playing = playing
    setIsPlaying(playing)
    callbacks.current.onPlayingChange?.(playing)
  }, [])

  const pause = useCallback(() => {
    const video = videoRef.current
    cancelAnimationFrame(state.current.raf)
    video?.pause()
    audioRef.current?.pause()
    if (state.current.playing) setPlaying(false)
    report(true)
    draw()
  }, [draw, report, setPlaying])

  /** Move the video to the source moment for edited time t. */
  const seekSource = useCallback((t: number) => {
    const video = videoRef.current
    const map = planRef.current.map
    if (!video) return
    const clamped = Math.min(Math.max(0, t), map.duration)
    state.current.t = clamped
    const source = map.toSource(clamped)
    const index = map.rangeAt(source)
    state.current.segment = index >= 0 ? index : 0
    if (Math.abs(video.currentTime - source) > 0.001) video.currentTime = source
  }, [])

  const tick = useCallback(() => {
    const video = videoRef.current
    const s = state.current
    if (!video || !s.playing) return
    const { map } = planRef.current
    const ranges = map.ranges
    const now = video.currentTime
    if (!video.seeking && ranges.length > 0) {
      let range = ranges[s.segment]
      // Playback drifted outside the segment we think we're in: find where it is.
      if (!range || now < range.start - 0.3 || now > range.end + 0.3) {
        const next = locate(ranges, map.rangeAt(now), now)
        if (next === -1) {
          s.t = map.duration
          pause()
          return
        }
        s.segment = next
        range = ranges[next]
      }
      if (range && now >= range.end - EDGE) {
        if (s.segment + 1 < ranges.length) {
          s.segment += 1
          video.currentTime = ranges[s.segment].start
        } else {
          s.t = map.duration
          pause()
          return
        }
      } else if (range && now < range.start) {
        video.currentTime = range.start
      }
      s.t = map.toEditedClamped(video.currentTime)
    }
    draw()
    report()
    s.raf = requestAnimationFrame(tick)
  }, [draw, pause, report])

  const play = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const map = planRef.current.map
    if (map.duration <= 0) return
    if (state.current.t >= map.duration - 0.05) seekSource(0)
    video.muted = false
    setPlaying(true)
    const started = video.play()
    if (started) {
      started.catch((error: unknown) => {
        // Not allowed without a tap, or the source can't play here.
        if (error instanceof Error && error.name !== 'AbortError') pause()
      })
    }
    const audio = audioRef.current
    if (audio && music) {
      syncMusic()
      audio.volume = Math.min(1, Math.max(0, music.volume))
      void audio.play().catch(() => {})
    }
    cancelAnimationFrame(state.current.raf)
    state.current.raf = requestAnimationFrame(tick)
  }, [music, pause, seekSource, setPlaying, syncMusic, tick])

  useImperativeHandle(
    ref,
    () => ({
      play,
      pause,
      toggle: () => (state.current.playing ? pause() : play()),
      seek: (t: number) => {
        seekSource(t)
        syncMusic()
        report(true)
        draw()
      },
      time: () => state.current.t,
      playing: () => state.current.playing,
    }),
    [draw, pause, play, report, seekSource, syncMusic],
  )

  // A new plan (an edit) keeps the playhead on the same moment of the edit where it can.
  useEffect(() => {
    planRef.current = plan
    outRef.current = out
    const s = state.current
    if (s.t > plan.duration) s.t = plan.duration
    const video = videoRef.current
    if (s.playing && video) {
      const now = video.currentTime
      s.segment = Math.max(0, locate(plan.map.ranges, plan.map.rangeAt(now), now))
    }
    if (!s.playing) {
      if (video && video.readyState >= 1) seekSource(s.t)
      draw()
    }
  }, [plan, out, draw, seekSource])

  useEffect(() => {
    if (!state.current.playing) draw()
  }, [redrawKey, display.width, display.height, draw])

  useEffect(() => {
    const audio = audioRef.current
    if (audio && music) audio.volume = Math.min(1, Math.max(0, music.volume))
  }, [music])

  // Video events: first frame, finished seeks, and backgrounding.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onMeta = () => {
      seekSource(state.current.t)
      // iOS won't hand over a frame of a video that has never played. A
      // muted inline video may play without a tap, so play and stop at once.
      if (!state.current.primed) {
        state.current.primed = true
        video.muted = true
        const p = video.play()
        if (p) {
          p.then(() => {
            if (!state.current.playing) {
              video.pause()
              seekSource(state.current.t)
            }
          }).catch(() => {})
        }
      }
    }
    const onSeeked = () => {
      if (!state.current.playing) draw()
    }
    const onData = () => {
      if (!state.current.playing) draw()
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden' && state.current.playing) pause()
    }
    video.addEventListener('loadedmetadata', onMeta)
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('loadeddata', onData)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      video.removeEventListener('loadedmetadata', onMeta)
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('loadeddata', onData)
      document.removeEventListener('visibilitychange', onHidden)
      cancelAnimationFrame(state.current.raf)
    }
  }, [draw, pause, seekSource])

  // Canvas pixels: the on-screen size at the screen's density, never more than the export.
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1
  const scale = Math.min(1, out.width / Math.max(1, display.width * dpr))
  const pixelWidth = Math.max(2, Math.round(display.width * dpr * scale))
  const pixelHeight = Math.max(2, Math.round(display.height * dpr * scale))

  useEffect(() => {
    draw()
  }, [pixelWidth, pixelHeight, draw])

  return (
    <div className="stage" ref={stageRef}>
      <canvas
        ref={canvasRef}
        className="stage-canvas"
        width={pixelWidth}
        height={pixelHeight}
        style={{ width: display.width, height: display.height }}
      />
      <button
        type="button"
        className="tap-play"
        aria-label={isPlaying ? 'Pause' : 'Play'}
        onClick={() => (state.current.playing ? pause() : play())}
      />
      <div className={`play-badge${isPlaying ? ' hidden' : ''}`}>
        <PlayIcon />
      </div>
      {children}
      <video
        ref={videoRef}
        src={sourceUrl}
        playsInline
        preload="auto"
        // Kept in the document but invisible: iOS stops decoding display:none videos.
        style={{ position: 'absolute', width: 2, height: 2, opacity: 0, pointerEvents: 'none', left: 0, top: 0 }}
      />
      {music && <audio ref={audioRef} src={music.url} loop preload="auto" />}
    </div>
  )
})

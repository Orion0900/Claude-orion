import type { AudioApi, SfxId, Vec3 } from '../game/types'
import { playNote, type MusicBuses } from './instruments'
import { SFX_RULES, VoiceLimiter } from './limiter'
import { STEPS_PER_BAR, eventsAt, smoothIntensity, songForStage, stepDuration, type NoteEvent, type Song } from './sequencer'
import { SFX } from './sfx'
import { Synth } from './synth'

/** The music bus runs at this share of the music setting, so it sits under the effects. */
const MUSIC_LEVEL = 0.55
/** How far ahead of the audio clock the sequencer schedules, in seconds. */
const LOOKAHEAD = 0.2
const MAX_VOICES = 32

interface Graph {
  ac: AudioContext
  synth: Synth
  master: GainNode
  music: GainNode
  sfx: GainNode
}

/** One song's mixer strip: its own fade and echo, retired as a whole when the song ends. */
interface Band {
  fade: GainNode
  buses: MusicBuses
  nodes: AudioNode[]
}

/** Nodes waiting to be disconnected once their fade-out has finished. */
interface Leftover {
  nodes: AudioNode[]
  end: number
}

interface Voice {
  bus: GainNode
  end: number
}

/**
 * All sound, synthesised with WebAudio: no files. Sound effects are
 * rate-limited and voice-capped by `VoiceLimiter`; music is a look-ahead
 * sequencer driven by `update` and the audio clock.
 *
 * Browsers only allow audio after a gesture, and some environments have no
 * WebAudio at all, so until `unlock` succeeds every method is a silent no-op
 * and nothing here ever throws.
 */
export class AudioEngine implements AudioApi {
  private graph: Graph | null = null
  private unavailable = false
  private volumes = { master: 0.8, music: 0.5, sfx: 0.8 }
  private readonly limiter = new VoiceLimiter(SFX_RULES, MAX_VOICES)
  private readonly voices = new Map<number, Voice>()
  private readonly leftovers: Leftover[] = []
  private song: Song | null = null
  private band: Band | null = null
  private step = 0
  private nextStepTime = 0
  private targetIntensity = 0
  private intensity = 0
  private readonly events: NoteEvent[] = []
  private sweepTime = 0

  unlock(): void {
    if (this.unavailable) return
    if (!this.graph) {
      const Ctor = audioContextClass()
      if (!Ctor) {
        this.unavailable = true
        return
      }
      let ac: AudioContext | null = null
      try {
        ac = new Ctor()
        this.graph = buildGraph(ac)
        this.applyVolumes()
      } catch {
        this.unavailable = true
        this.graph = null
        try {
          void ac?.close().catch(() => undefined)
        } catch {
          // Nothing left to release.
        }
        return
      }
    }
    const ac = this.graph.ac
    if (ac.state === 'running' || ac.state === 'closed') return
    try {
      ac.resume().catch(() => undefined)
    } catch {
      // Refused without a gesture; the next one tries again.
    }
  }

  play(id: SfxId, opts?: { volume?: number; pitch?: number; pos?: Vec3 }): void {
    const g = this.live()
    if (!g) return
    const volume = opts?.volume ?? 1
    const recipe = SFX[id]
    const rule = SFX_RULES[id]
    if (!(volume > 0.001) || !recipe || !rule) return
    try {
      const now = g.ac.currentTime
      const handle = this.limiter.request(id, now)
      this.cutStolen(now)
      if (handle === 0) return
      const bus = g.ac.createGain()
      bus.gain.value = Math.min(2, volume)
      bus.connect(g.sfx)
      this.voices.set(handle, { bus, end: now + rule.length + 0.1 })
      const pitch = clamp(opts?.pitch ?? 1, 0.25, 4, 1) * (1 + (Math.random() * 2 - 1) * rule.vary)
      recipe(g.synth, bus, now + 0.005, pitch)
    } catch {
      // A sound effect is never worth a crash.
    }
  }

  setIntensity(level: number): void {
    if (Number.isFinite(level)) this.targetIntensity = Math.min(1, Math.max(0, level))
  }

  startMusic(stageIndex: number): void {
    this.retireBand(0.15)
    this.song = songForStage(stageIndex)
    this.step = 0
    this.intensity = 0
    this.targetIntensity = 0
  }

  stopMusic(): void {
    this.retireBand(0.8)
    this.song = null
  }

  setVolumes(master: number, music: number, sfx: number): void {
    const v = this.volumes
    v.master = clamp(master, 0, 1, v.master)
    v.music = clamp(music, 0, 1, v.music)
    v.sfx = clamp(sfx, 0, 1, v.sfx)
    this.applyVolumes()
  }

  update(dt: number): void {
    const g = this.live()
    if (!g) return
    try {
      const now = g.ac.currentTime
      this.sweep(now)
      this.intensity = smoothIntensity(this.intensity, this.targetIntensity, Math.min(0.25, dt > 0 ? dt : 0))
      this.schedule(g, now)
    } catch {
      // Music glitches are better than a frozen game.
    }
  }

  /** The graph, if it can make sound right now. */
  private live(): Graph | null {
    const g = this.graph
    return g && g.ac.state === 'running' ? g : null
  }

  private schedule(g: Graph, now: number): void {
    const song = this.song
    if (!song) return
    if (!this.band) {
      this.band = buildBand(g, song)
      this.band.fade.gain.setTargetAtTime(1, now, 0.05)
      this.nextStepTime = now + 0.08
    }
    // After a stall (hidden tab, long frame) skip the missed steps rather than play them in one burst.
    if (this.nextStepTime < now) this.nextStepTime = now + 0.03
    const loop = song.bars * STEPS_PER_BAR
    const buses = this.band.buses
    for (let guard = 0; guard < 64 && this.nextStepTime < now + LOOKAHEAD; guard++) {
      const stepLength = stepDuration(song, this.intensity)
      const n = eventsAt(song, this.step, this.intensity, this.events)
      for (let i = 0; i < n; i++) playNote(g.synth, this.events[i], this.nextStepTime, stepLength, buses)
      this.nextStepTime += stepLength
      this.step = (this.step + 1) % loop
    }
  }

  /** Fades the playing song's strip out and disconnects it once silent. */
  private retireBand(seconds: number): void {
    const band = this.band
    this.band = null
    const g = this.graph
    if (!band || !g) return
    try {
      const now = g.ac.currentTime
      const gain = band.fade.gain
      gain.cancelScheduledValues(now)
      gain.setValueAtTime(gain.value, now)
      gain.setTargetAtTime(0, now, seconds / 4)
      // The echo tail rings on a little past the fade.
      this.leftovers.push({ nodes: band.nodes, end: now + seconds + 1.5 })
    } catch {
      disconnectAll(band.nodes)
    }
  }

  /** Fades out voices the limiter cut; `sweep` disconnects them shortly after. */
  private cutStolen(now: number): void {
    for (const handle of this.limiter.stolen) {
      const voice = this.voices.get(handle)
      if (!voice) continue
      const gain = voice.bus.gain
      gain.cancelScheduledValues(now)
      gain.setValueAtTime(gain.value, now)
      gain.linearRampToValueAtTime(0, now + 0.03)
      voice.end = now + 0.06
    }
  }

  private sweep(now: number): void {
    this.sweepTime = now
    this.voices.forEach(this.sweepVoice)
    for (let i = this.leftovers.length - 1; i >= 0; i--) {
      if (this.leftovers[i].end > now) continue
      disconnectAll(this.leftovers[i].nodes)
      this.leftovers.splice(i, 1)
    }
  }

  private readonly sweepVoice = (voice: Voice, handle: number): void => {
    if (voice.end > this.sweepTime) return
    voice.bus.disconnect()
    this.voices.delete(handle)
  }

  private applyVolumes(): void {
    const g = this.graph
    if (!g) return
    try {
      const now = g.ac.currentTime
      // Sliders feel even when gain follows their square.
      const v = this.volumes
      g.master.gain.setTargetAtTime(v.master * v.master, now, 0.03)
      g.music.gain.setTargetAtTime(v.music * v.music * MUSIC_LEVEL, now, 0.03)
      g.sfx.gain.setTargetAtTime(v.sfx * v.sfx, now, 0.03)
    } catch {
      // Keep the previous levels.
    }
  }
}

function buildGraph(ac: AudioContext): Graph {
  const master = ac.createGain()
  // A light compressor keeps a horde of hits from clipping without pumping the music.
  const comp = ac.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 10
  comp.ratio.value = 4
  comp.attack.value = 0.004
  comp.release.value = 0.18
  master.connect(comp)
  comp.connect(ac.destination)
  const music = ac.createGain()
  music.connect(master)
  const sfx = ac.createGain()
  sfx.connect(master)
  return { ac, synth: new Synth(ac), master, music, sfx }
}

/** A song's strip: dry voices into the fade, melodic voices also through a dotted-eighth echo. */
function buildBand(g: Graph, song: Song): Band {
  const ac = g.ac
  const fade = ac.createGain()
  fade.gain.value = 0.0001
  fade.connect(g.music)
  const echo = ac.createGain()
  echo.connect(fade)
  const delay = ac.createDelay(1)
  delay.delayTime.value = Math.min(0.95, 3 * stepDuration(song, 0))
  const feedback = ac.createGain()
  feedback.gain.value = 0.28
  const wet = ac.createGain()
  wet.gain.value = 0.22
  echo.connect(delay)
  delay.connect(feedback)
  feedback.connect(delay)
  delay.connect(wet)
  wet.connect(fade)
  return { fade, buses: { dry: fade, echo }, nodes: [echo, delay, feedback, wet, fade] }
}

function disconnectAll(nodes: readonly AudioNode[]): void {
  for (const node of nodes) {
    try {
      node.disconnect()
    } catch {
      // Already disconnected.
    }
  }
}

function audioContextClass(): (new () => AudioContext) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: new () => AudioContext; webkitAudioContext?: new () => AudioContext }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function clamp(v: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
}

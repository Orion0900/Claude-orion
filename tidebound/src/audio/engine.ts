import type { SpeciesId } from '../data/dex'
import type { Audio, JingleId, MoveSoundSpec, SfxId, TrackId } from './api'
import { cryParams, renderCry } from './cries'
import { PATCHES } from './instruments'
import { playMove } from './moves'
import { SFX, SFX_GAP } from './sfx'
import { CHANNELS, secondsPerTick, type ChannelId, type CompiledSong } from './song'
import { ChipSynth } from './synth'
import { collectEvents, normalizeTick, Transport, type Scheduled } from './timeline'
import { jingle, track } from './tracks'

/**
 * The real sound system. Music is a look-ahead sequencer: a timer wakes
 * every 25 ms and queues every note that starts within the next ~150 ms
 * against the audio clock, so timing never depends on the frame rate.
 * If the timer is throttled (a background tab) the window widens to cover
 * the gaps.
 *
 * Browsers only allow audio after a user gesture, and some environments
 * have no WebAudio at all, so until `unlock` succeeds every method is a
 * silent no-op (a requested track waits and starts on unlock), promises
 * resolve at once, and nothing here ever throws.
 */

export interface EngineOptions {
  /** Makes the AudioContext; the default is the browser's. Returning null means no WebAudio. */
  createContext?: () => BaseAudioContext | null
}

/** Seconds of music queued ahead of the audio clock. */
const LOOKAHEAD = 0.15
const MAX_LOOKAHEAD = 1.5
const PUMP_MS = 25
/** The music bus sits a little under the effects. */
const MUSIC_LEVEL = 0.85
/** Stereo placement per channel, like the handheld's panning. */
const PAN: Readonly<Record<ChannelId, number>> = { p1: -0.18, p2: 0.22, wave: 0, noise: 0.06 }
/** How much of each channel feeds a song's echo. */
const ECHO_SEND: Readonly<Record<ChannelId, number>> = { p1: 0.7, p2: 1, wave: 0, noise: 0 }
/** Seconds a paused track takes to fade back in after a jingle. */
const RESUME_FADE = 0.6

interface Graph {
  ac: BaseAudioContext
  synth: ChipSynth
  music: GainNode
  sfx: GainNode
}

/** One playback's mixer strip: its fade, per-channel inputs and echo; retired as a whole. */
interface Band {
  fade: GainNode
  inputs: Record<ChannelId, AudioNode>
  nodes: AudioNode[]
}

interface Playback {
  id: TrackId
  song: CompiledSong
  transport: Transport
  band: Band
}

export class ChipAudio implements Audio {
  private graph: Graph | null = null
  private dead = false
  private musicVolume = 0.8
  private sfxVolume = 0.8
  /** The track that should be playing (or resume after a jingle). */
  private wanted: TrackId | null = null
  private playing: Playback | null = null
  /** Where the paused track was when a jingle interrupted it. */
  private resumeAt: { id: TrackId; tick: number } | null = null
  /** Jingles requested and not yet finished. */
  private jingles = 0
  private chain: Promise<void> = Promise.resolve()
  private timer: ReturnType<typeof setInterval> | null = null
  private lastPump = -1
  private lookahead = LOOKAHEAD
  private readonly scratch: Scheduled[] = []
  private readonly lastSfx = new Map<SfxId, number>()
  private xpStreak = 0

  constructor(private readonly options: EngineOptions = {}) {}

  get currentTrack(): TrackId | null {
    return this.wanted
  }

  unlock(): void {
    if (this.dead) return
    try {
      if (!this.graph) {
        const ac = (this.options.createContext ?? browserContext)()
        if (!ac) {
          this.dead = true
          return
        }
        this.graph = buildGraph(ac)
        this.applyVolumes()
        this.timer = setInterval(() => this.pump(), PUMP_MS)
        if (this.wanted && this.jingles === 0) this.start(this.wanted, 0, 0)
      }
      const ac = this.graph.ac as AudioContext
      // Suspended until a gesture, or 'interrupted' (Safari) after a call or a lock screen.
      if (ac.state !== 'running' && ac.state !== 'closed' && typeof ac.resume === 'function') {
        ac.resume().catch(() => undefined)
        primeSilence(ac)
      }
    } catch {
      if (!this.graph) this.dead = true
    }
  }

  playMusic(id: TrackId): void {
    if (this.wanted === id) return
    this.wanted = id
    this.resumeAt = null
    // Before unlock, or under a jingle, it just waits its turn.
    if (!this.graph || this.jingles > 0) return
    try {
      this.retire(0.15)
      this.start(id, 0, 0)
    } catch {
      // Silence rather than a crash.
    }
  }

  stopMusic(seconds = 0.5): void {
    this.wanted = null
    this.resumeAt = null
    try {
      this.retire(Number.isFinite(seconds) ? Math.max(0.01, seconds) : 0.5)
    } catch {
      // Already gone.
    }
  }

  playJingle(id: JingleId): Promise<void> {
    this.jingles++
    const done = this.chain
      .then(() => this.runJingle(id))
      .catch(() => undefined)
      .then(() => {
        this.jingles--
        if (this.jingles === 0) this.afterJingles()
      })
    this.chain = done
    return done
  }

  sfx(id: SfxId): void {
    const g = this.live()
    if (!g) return
    try {
      const now = g.ac.currentTime
      const last = this.lastSfx.get(id)
      if (last !== undefined && now - last < (SFX_GAP[id] ?? 0.015)) return
      let pitch = 1
      if (id === 'xp') {
        // Ticks in quick succession climb, like the bar filling up.
        this.xpStreak = last !== undefined && now - last < 0.25 ? Math.min(this.xpStreak + 1, 36) : 0
        pitch = Math.pow(2, this.xpStreak / 36)
      }
      this.lastSfx.set(id, now)
      SFX[id](g.synth, g.sfx, now + 0.005, pitch)
    } catch {
      // A sound effect is never worth a crash.
    }
  }

  moveSound(spec: MoveSoundSpec): void {
    const g = this.live()
    if (!g) return
    try {
      playMove(g.synth, g.sfx, g.ac.currentTime + 0.005, spec)
    } catch {
      // Silence instead.
    }
  }

  cry(species: SpeciesId, faint = false): Promise<void> {
    const g = this.live()
    if (!g) return Promise.resolve()
    try {
      const c = cryParams(species, faint)
      renderCry(g.synth, g.sfx, g.ac.currentTime + 0.01, c)
      return wait(c.duration + 0.02)
    } catch {
      return Promise.resolve()
    }
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = clamp01(music, this.musicVolume)
    this.sfxVolume = clamp01(sfx, this.sfxVolume)
    this.applyVolumes()
  }

  /**
   * Queues the notes due soon. Runs on the engine's own timer; public so
   * tests (and a game loop, if it likes) can drive it.
   */
  pump(): void {
    const g = this.graph
    if (!g) return
    try {
      const now = g.ac.currentTime
      if (this.lastPump >= 0) {
        // A late wake-up means the timer is being throttled: look further ahead.
        const gap = now - this.lastPump
        this.lookahead = gap > LOOKAHEAD ? Math.min(MAX_LOOKAHEAD, gap * 1.5) : Math.max(LOOKAHEAD, this.lookahead * 0.9)
      }
      this.lastPump = now
      const p = this.playing
      if (!p) return
      const list = this.scratch
      list.length = 0
      p.transport.pump(now, this.lookahead, list)
      for (const s of list) this.render(g, p.song, p.band, p.transport.timeAt(s.tick), s, now)
    } catch {
      // A glitch in the music beats a frozen game.
    }
  }

  /** Stops the timer and closes the context. */
  dispose(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
    const g = this.graph
    this.graph = null
    this.playing = null
    this.dead = true
    try {
      const close = (g?.ac as AudioContext | undefined)?.close
      if (typeof close === 'function') close.call(g?.ac).catch(() => undefined)
    } catch {
      // Nothing left to release.
    }
  }

  /** The graph, if it is running and can make sound right now. */
  private live(): Graph | null {
    const g = this.graph
    return g && g.ac.state === 'running' ? g : null
  }

  private start(id: TrackId, tick: number, fadeIn: number): void {
    const g = this.graph
    if (!g) return
    const song = track(id)
    const now = g.ac.currentTime
    const band = buildBand(g, song, fadeIn, now)
    this.playing = { id, song, transport: new Transport(song, now + 0.05, normalizeTick(song, tick)), band }
    this.pump()
  }

  /** Fades the playing track out over `seconds`; its nodes are dropped once silent. */
  private retire(seconds: number): void {
    const p = this.playing
    this.playing = null
    if (p && this.graph) fadeAndDrop(this.graph, p.band, seconds)
  }

  private runJingle(id: JingleId): Promise<void> {
    const g = this.live()
    if (!g) return Promise.resolve()
    const song = jingle(id)
    const now = g.ac.currentTime
    const p = this.playing
    if (p) {
      // Pause: remember where the track was, and let it fall silent fast.
      this.resumeAt = { id: p.id, tick: p.transport.positionAt(now) }
      this.retire(0.06)
    }
    const band = buildBand(g, song, 0, now)
    const spt = secondsPerTick(song)
    const start = now + 0.08
    for (const s of collectEvents(song, 0, song.body.len)) this.render(g, song, band, start + s.tick * spt, s, now)
    return wait(0.08 + song.body.len * spt + 0.1).then(() => fadeAndDrop(g, band, 0.3))
  }

  /** The last jingle ended: resume the paused track where it was, or start whatever was asked for since. */
  private afterJingles(): void {
    const id = this.wanted
    const at = this.resumeAt
    this.resumeAt = null
    if (!id || !this.graph || this.playing) return
    try {
      if (at && at.id === id) this.start(id, at.tick, RESUME_FADE)
      else this.start(id, 0, 0)
    } catch {
      // Stay quiet.
    }
  }

  private render(g: Graph, song: CompiledSong, band: Band, at: number, s: Scheduled, now: number): void {
    const ev = s.ev
    const time = Math.max(now, at)
    const patch = PATCHES[ev.patch]
    const out = band.inputs[ev.ch]
    if (ev.drum) {
      g.synth.drum(out, time, ev.drum, ev.vel * patch.level)
      return
    }
    const spt = secondsPerTick(song)
    const bends = ev.bends ? ev.bends.map((b) => ({ at: b.at * spt, midi: b.midi, glide: b.glide * spt })) : null
    g.synth.note(out, time, patch, ev.midi, Math.max(0.02, ev.len * spt * ev.gate), ev.vel, ev.arp, bends)
  }

  private applyVolumes(): void {
    const g = this.graph
    if (!g) return
    try {
      const now = g.ac.currentTime
      // Sliders feel even when gain follows their square.
      g.music.gain.setTargetAtTime(this.musicVolume * this.musicVolume * MUSIC_LEVEL, now, 0.03)
      g.sfx.gain.setTargetAtTime(this.sfxVolume * this.sfxVolume, now, 0.03)
    } catch {
      // Keep the old levels.
    }
  }
}

/**
 * Master chain: music (through a gentle low-pass that takes the edge off
 * the pulse waves) and effects into a compressor, then a hard limiter, so a
 * pile of hits over a battle theme never clips.
 */
function buildGraph(ac: BaseAudioContext): Graph {
  const comp = ac.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 10
  comp.ratio.value = 3
  comp.attack.value = 0.003
  comp.release.value = 0.2
  const limiter = ac.createDynamicsCompressor()
  limiter.threshold.value = -2
  limiter.knee.value = 0
  limiter.ratio.value = 20
  limiter.attack.value = 0.001
  limiter.release.value = 0.1
  const master = ac.createGain()
  master.gain.value = 0.9
  master.connect(comp)
  comp.connect(limiter)
  limiter.connect(ac.destination)
  const tone = ac.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 9500
  tone.Q.value = 0.5
  tone.connect(master)
  const music = ac.createGain()
  music.connect(tone)
  const sfx = ac.createGain()
  sfx.connect(master)
  return { ac, synth: new ChipSynth(ac), music, sfx }
}

function buildBand(g: Graph, song: CompiledSong, fadeIn: number, now: number): Band {
  const ac = g.ac
  const fade = ac.createGain()
  if (fadeIn > 0) {
    fade.gain.setValueAtTime(0, now)
    fade.gain.linearRampToValueAtTime(1, now + fadeIn)
  } else fade.gain.value = 1
  fade.connect(g.music)
  const nodes: AudioNode[] = [fade]
  let echo: AudioNode | null = null
  if (song.echo && song.echo.wet > 0) {
    const input = ac.createGain()
    const delay = ac.createDelay(2)
    delay.delayTime.value = Math.min(1.9, Math.max(0.01, (song.echo.beats * 60) / song.bpm))
    const damp = ac.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 3200
    const feedback = ac.createGain()
    feedback.gain.value = Math.min(0.85, Math.max(0, song.echo.feedback))
    const wet = ac.createGain()
    wet.gain.value = song.echo.wet
    input.connect(delay)
    delay.connect(damp)
    damp.connect(feedback)
    feedback.connect(delay)
    damp.connect(wet)
    wet.connect(fade)
    nodes.push(input, delay, damp, feedback, wet)
    echo = input
  }
  const inputs = {} as Record<ChannelId, AudioNode>
  for (const ch of CHANNELS) {
    const input = ac.createGain()
    nodes.push(input)
    const pan = panner(ac, PAN[ch])
    if (pan) {
      input.connect(pan)
      pan.connect(fade)
      nodes.push(pan)
    } else input.connect(fade)
    if (echo && ECHO_SEND[ch] > 0) {
      const send = ac.createGain()
      send.gain.value = ECHO_SEND[ch]
      input.connect(send)
      send.connect(echo)
      nodes.push(send)
    }
    inputs[ch] = input
  }
  return { fade, inputs, nodes }
}

function panner(ac: BaseAudioContext, pan: number): StereoPannerNode | null {
  if (pan === 0 || typeof (ac as AudioContext).createStereoPanner !== 'function') return null
  const node = ac.createStereoPanner()
  node.pan.value = pan
  return node
}

function fadeAndDrop(g: Graph, band: Band, seconds: number): void {
  try {
    const now = g.ac.currentTime
    const gain = band.fade.gain
    gain.cancelScheduledValues(now)
    gain.setValueAtTime(gain.value, now)
    gain.linearRampToValueAtTime(0, now + seconds)
  } catch {
    // Dropping it below cuts it anyway.
  }
  // Notes already queued, and the echo's tail, die away before the strip is cut loose.
  setTimeout(() => {
    for (const node of band.nodes) {
      try {
        node.disconnect()
      } catch {
        // Already disconnected.
      }
    }
  }, (seconds + 2) * 1000)
}

/** iOS only really unlocks once something has played inside the gesture. */
function primeSilence(ac: BaseAudioContext): void {
  try {
    const src = ac.createBufferSource()
    src.buffer = ac.createBuffer(1, 1, ac.sampleRate)
    src.connect(ac.destination)
    src.start(0)
  } catch {
    // Not needed here.
  }
}

function browserContext(): BaseAudioContext | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Ctor = w.AudioContext ?? w.webkitAudioContext
  if (!Ctor) return null
  return new Ctor({ latencyHint: 'interactive' })
}

function wait(seconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, seconds * 1000)))
}

function clamp01(v: number, fallback: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback
}

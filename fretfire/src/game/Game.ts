import { lookaheadFor, type Settings } from '../app/settings'
import type { AudioEngine } from '../audio/engine'
import { SongPlayer, type Stem } from '../audio/player'
import { playSfx } from '../audio/sfx'
import { TempoMap, type BeatLine } from '../chart/tempo'
import { OPEN_LANE, type Chart, type Track } from '../chart/types'
import type { Insets } from '../render/layout'
import { Renderer, type FrameState } from '../render/Renderer'
import { Bot } from './bot'
import { InputController, type InputSink } from './input'
import { DEFAULT_WINDOW, PlaySession, soloGrade, type Results, type SessionEvent } from './session'

/**
 * One play of one track: owns the renderer, the audio, the input and the
 * judging session, and runs the frame loop. The app builds a new Game for
 * every play (restart included) and throws it away afterwards.
 */

export interface GameOptions {
  chart: Chart
  track: Track
  stems: Stem[]
  settings: Settings
  /** Song speed; 1 is normal. */
  rate: number
  /** Let the computer play (demo and unattended checks). */
  bot?: boolean
  onFinish(results: Results): void
  onQuit(): void
  onRestart(): void
}

/** Misses are declared a touch late, so a tap stamped just before a frame still counts. */
const MISS_GRACE = 0.05
const LENIENT_WINDOW = 0.1
/** Seconds per countdown number. */
const COUNT_STEP = 0.45

type State = 'countdown' | 'playing' | 'paused' | 'ended'

export class Game {
  private readonly root: HTMLDivElement
  private readonly renderer: Renderer
  private readonly session: PlaySession
  private readonly player: SongPlayer
  private readonly input: InputController
  private readonly tempo: TempoMap
  private readonly beatLines: BeatLine[]
  private readonly starLive: Uint8Array
  private readonly sustaining = new Int32Array(OPEN_LANE + 1).fill(-1)
  private readonly down = [false, false, false, false, false]
  private readonly lookahead: number
  private readonly endAt: number
  private readonly inputOffset: number
  private readonly videoOffset: number
  private readonly frameState: FrameState
  private readonly pauseButton: HTMLButtonElement
  private readonly starButton: HTMLButtonElement
  private readonly insetProbe: HTMLDivElement
  private pauseMenu: HTMLDivElement | null = null
  private state: State = 'countdown'
  private resumeFrom: number
  private countdownStart = 0
  private lastCount = 0
  private raf = 0
  private solo: { hit: number; total: number } | null = null
  private destroyed = false
  private readonly bot: Bot | null

  constructor(
    host: HTMLElement,
    private readonly engine: AudioEngine,
    private readonly options: GameOptions,
  ) {
    const { chart, track, settings } = options
    this.root = document.createElement('div')
    this.root.className = 'game'
    host.appendChild(this.root)
    this.renderer = new Renderer(this.root)
    this.renderer.reducedEffects = settings.reducedEffects

    this.tempo = new TempoMap(chart.resolution, chart.tempos, chart.offset, chart.timeSignatures)
    this.session = new PlaySession(track, this.tempo, {
      scheme: settings.scheme,
      window: settings.lenient ? LENIENT_WINDOW : DEFAULT_WINDOW,
      ghostPenalty: settings.ghostPenalty,
      canFail: settings.canFail,
    })
    this.player = new SongPlayer(engine, options.stems, options.rate)
    this.bot = options.bot ? new Bot(this.session, settings.scheme) : null
    this.lookahead = lookaheadFor(settings.noteSpeed, options.rate)
    this.inputOffset = settings.inputOffsetMs / 1000
    this.videoOffset = settings.videoOffsetMs / 1000

    const notes = track.notes
    const first = notes.length ? notes[0].time : 0
    const last = notes[notes.length - 1]
    const lastEnd = last ? last.time + Math.max(...last.sustain) : 0
    this.resumeFrom = Math.min(0, first - this.lookahead - 1.2)
    this.endAt = Math.max(this.player.duration + 0.3, lastEnd + 1.5)
    this.beatLines = this.tempo.beatLines(this.endAt + 2)
    this.starLive = new Uint8Array(notes.length)
    this.refreshStars()

    this.frameState = {
      time: 0,
      beat: 0,
      lookahead: this.lookahead,
      notes,
      status: this.session.status,
      starLive: this.starLive,
      sustaining: this.sustaining,
      down: this.down,
      lefty: settings.lefty,
      beatLines: this.beatLines,
      hud: {
        score: 0,
        multiplier: 1,
        multiplierProgress: 0,
        streak: 0,
        starMeter: 0,
        starActive: false,
        starReady: false,
        rock: settings.canFail ? 0.5 : null,
        progress: 0,
        solo: null,
      },
    }

    this.pauseButton = document.createElement('button')
    this.pauseButton.className = 'game-pause'
    this.pauseButton.type = 'button'
    this.pauseButton.setAttribute('aria-label', 'Pause')
    this.pauseButton.addEventListener('click', () => this.togglePause())
    this.starButton = document.createElement('button')
    this.starButton.className = 'game-star'
    this.starButton.type = 'button'
    this.starButton.setAttribute('aria-label', 'Deploy star power')
    const deploy = (e: Event) => {
      e.preventDefault()
      this.sink.star(performance.now())
    }
    this.starButton.addEventListener('touchstart', deploy, { passive: false })
    this.starButton.addEventListener('mousedown', deploy)
    this.root.append(this.pauseButton, this.starButton)

    this.insetProbe = document.createElement('div')
    this.insetProbe.className = 'inset-probe'
    document.body.appendChild(this.insetProbe)

    this.input = new InputController(
      this.renderer.canvas,
      () => this.renderer.layout,
      { scheme: settings.scheme, lefty: settings.lefty, flick: settings.flick },
      this.sink,
    )
    this.resize()
    window.addEventListener('resize', this.resize)
    window.visualViewport?.addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', this.onVisibility)
    if (engine.ctx) engine.ctx.addEventListener('statechange', this.onAudioState)
  }

  start(): void {
    this.input.attach()
    this.beginCountdown()
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.input.detach()
    this.player.stop()
    window.removeEventListener('resize', this.resize)
    window.visualViewport?.removeEventListener('resize', this.resize)
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.engine.ctx?.removeEventListener('statechange', this.onAudioState)
    this.insetProbe.remove()
    this.root.remove()
  }

  pause(): void {
    if (this.state === 'ended' || this.state === 'paused') return
    // Let go of held lanes while the session is still listening.
    this.input.releaseAll(performance.now())
    if (this.state === 'playing') this.resumeFrom = this.player.pause()
    this.state = 'paused'
    this.renderer.setCountdown(null)
    this.showPauseMenu()
  }

  resume(): void {
    if (this.state !== 'paused') return
    this.engine.resume()
    this.hidePauseMenu()
    this.beginCountdown()
  }

  /** Lets tests and the bot see inside. */
  get debug() {
    return { session: this.session, player: this.player, state: this.state, layout: this.renderer.layout }
  }

  private readonly sink: InputSink = {
    press: (lane, ms) => {
      this.down[lane] = true
      if (this.state !== 'playing') return
      this.session.press(lane, this.judgeTime(ms))
      this.handleEvents()
    },
    release: (lane, ms) => {
      this.down[lane] = false
      if (this.state !== 'playing') return
      this.session.release(lane, this.judgeTime(ms))
      this.handleEvents()
    },
    strum: (ms) => {
      if (this.state !== 'playing') return
      this.session.strum(this.judgeTime(ms))
      this.handleEvents()
    },
    star: (ms) => {
      if (this.state !== 'playing') return
      this.session.activateStar(this.judgeTime(ms))
      this.handleEvents()
    },
    pause: () => this.togglePause(),
  }

  private judgeTime(ms: number): number {
    return this.player.timeAt(ms) - this.inputOffset
  }

  private togglePause(): void {
    if (this.state === 'paused') this.resume()
    else this.pause()
  }

  private beginCountdown(): void {
    this.state = 'countdown'
    this.countdownStart = performance.now()
    this.lastCount = 0
  }

  private readonly frame = (now: number) => {
    if (this.destroyed) return
    this.raf = requestAnimationFrame(this.frame)
    this.input.pollGamepads()

    let songTime = this.resumeFrom
    if (this.state === 'countdown') {
      const elapsed = (now - this.countdownStart) / 1000
      const count = 3 - Math.floor(elapsed / COUNT_STEP)
      if (count !== this.lastCount && count >= 1) {
        this.renderer.setCountdown(String(count))
        playSfx(this.engine, 'count')
      }
      this.lastCount = count
      if (elapsed >= 3 * COUNT_STEP) {
        this.renderer.setCountdown(null)
        this.state = 'playing'
        this.player.play(this.resumeFrom)
      }
    }
    if (this.state === 'playing') {
      this.player.sync(now)
      songTime = this.player.timeAt(now)
      this.bot?.update(songTime - this.inputOffset)
      this.session.update(songTime - this.inputOffset - MISS_GRACE)
      this.handleEvents()
      if (songTime >= this.endAt && this.state === 'playing') this.finish()
    } else if (this.state === 'ended') {
      songTime = this.resumeFrom
    }

    for (let lane = 0; lane <= OPEN_LANE; lane++) this.sustaining[lane] = this.session.sustains[lane]?.note ?? -1
    const s = this.frameState
    s.time = songTime - this.videoOffset
    s.beat = this.tempo.timeToBeat(s.time)
    const hud = s.hud
    hud.score = this.session.score
    hud.multiplier = this.session.multiplier
    hud.multiplierProgress = this.session.multiplierProgress
    hud.streak = this.session.streak
    hud.starMeter = this.session.starMeter
    hud.starActive = this.session.starActive
    hud.starReady = this.session.starReady
    if (hud.rock !== null) hud.rock = this.session.rock
    hud.progress = this.endAt > 0 ? Math.max(0, songTime) / this.endAt : 0
    hud.solo = this.solo
    this.renderer.frame(s, now)
  }

  private handleEvents(): void {
    const events = this.session.drainEvents()
    for (const e of events) this.onEvent(e)
  }

  private onEvent(e: SessionEvent): void {
    const lefty = this.options.settings.lefty
    switch (e.type) {
      case 'hit': {
        const note = this.session.notes[e.note]
        this.renderer.hit(e.mask, lefty, note.star && this.starLive[e.note] === 1)
        this.player.setInstrumentAudible(true)
        if (note.solo && this.solo) this.solo.hit++
        return
      }
      case 'miss':
        this.renderer.miss(e.mask, lefty)
        this.player.setInstrumentAudible(false)
        if (e.streakLost >= 10) playSfx(this.engine, 'miss')
        return
      case 'overhit':
        this.renderer.miss(e.lane >= 0 ? 1 << e.lane : 0, lefty)
        this.player.setInstrumentAudible(false)
        playSfx(this.engine, 'miss')
        return
      case 'starPhraseLost':
        this.refreshStars()
        return
      case 'starGained':
        playSfx(this.engine, 'starGain')
        return
      case 'starReady':
        playSfx(this.engine, 'starReady')
        this.renderer.banner('Star power ready', this.starHint(), '#8ff7ff')
        return
      case 'starActivated':
        playSfx(this.engine, 'starActivate')
        this.renderer.banner('Star power!', '', '#8ff7ff')
        return
      case 'streak':
        this.renderer.banner(`${e.value} note streak!`, '', '#ffd43d')
        return
      case 'soloStart':
        this.solo = { hit: 0, total: e.notes }
        return
      case 'soloEnd':
        this.solo = null
        this.renderer.banner(soloGrade(e.hit, e.total), `+${e.bonus.toLocaleString('en-US')} solo bonus`, '#ffd43d')
        return
      case 'failed':
        this.fail()
        return
      default:
        return
    }
  }

  private starHint(): string {
    if (this.options.settings.flick) return 'Flick the phone or tap ⚡'
    return matchMedia('(pointer: coarse)').matches ? 'Tap ⚡ to deploy' : 'Press Shift to deploy'
  }

  private refreshStars(): void {
    const notes = this.session.notes
    for (let i = 0; i < notes.length; i++) this.starLive[i] = notes[i].star && this.session.starLive(i) ? 1 : 0
  }

  private finish(): void {
    this.state = 'ended'
    this.resumeFrom = this.player.pause()
    this.input.detach()
    const results = this.session.results()
    if (results.fullCombo) this.renderer.banner('Full combo!', '', '#ffd43d')
    playSfx(this.engine, 'cheer')
    window.setTimeout(() => {
      if (!this.destroyed) this.options.onFinish(results)
    }, 900)
  }

  private fail(): void {
    if (this.state === 'ended') return
    this.state = 'ended'
    this.resumeFrom = this.player.pause()
    this.input.detach()
    playSfx(this.engine, 'fail')
    this.renderer.banner('Song failed', '', '#ff4b55')
    window.setTimeout(() => {
      if (!this.destroyed) this.options.onFinish(this.session.results())
    }, 1800)
  }

  private showPauseMenu(): void {
    if (this.pauseMenu) return
    const menu = document.createElement('div')
    menu.className = 'pause-menu'
    const title = document.createElement('h2')
    title.textContent = 'Paused'
    const list = document.createElement('div')
    list.className = 'pause-actions'
    const add = (label: string, cls: string, fn: () => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `btn ${cls}`
      b.textContent = label
      b.addEventListener('click', fn)
      list.appendChild(b)
      return b
    }
    const resume = add('Resume', 'primary', () => this.resume())
    add('Restart', '', () => this.options.onRestart())
    add('Quit song', '', () => this.options.onQuit())
    menu.append(title, list)
    this.root.appendChild(menu)
    this.pauseMenu = menu
    resume.focus({ preventScroll: true })
  }

  private hidePauseMenu(): void {
    this.pauseMenu?.remove()
    this.pauseMenu = null
  }

  private readonly resize = () => {
    const rect = this.root.getBoundingClientRect()
    const cs = getComputedStyle(this.insetProbe)
    const insets: Insets = {
      top: parseFloat(cs.paddingTop) || 0,
      right: parseFloat(cs.paddingRight) || 0,
      bottom: parseFloat(cs.paddingBottom) || 0,
      left: parseFloat(cs.paddingLeft) || 0,
    }
    this.renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height), insets)
    const hud = this.renderer.layout.hud
    const size = Math.max(64, (this.renderer.badgeRadius() + 10) * 2)
    this.starButton.style.width = `${size}px`
    this.starButton.style.height = `${size}px`
    this.starButton.style.left = `${hud.rightX - size / 2}px`
    this.starButton.style.top = `${hud.y - size / 2}px`
  }

  private readonly onVisibility = () => {
    if (document.hidden) this.pause()
  }

  private readonly onAudioState = () => {
    // A phone call or Siri takes the audio away: pause rather than play on in silence.
    const state = this.engine.ctx?.state as string | undefined
    if (state && state !== 'running' && this.state === 'playing') this.pause()
  }
}

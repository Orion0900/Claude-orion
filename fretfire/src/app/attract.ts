import { TempoMap } from '../chart/tempo'
import { OPEN_LANE, findTrack } from '../chart/types'
import { Bot } from '../game/bot'
import { PlaySession } from '../game/session'
import { BUILTIN, builtinChart } from '../music/builtin'
import { Renderer, type FrameState } from '../render/Renderer'

/**
 * The title screen's backdrop: a built-in song's highway playing itself,
 * silently, on a loop. Same renderer and bot as a real game, no audio clock.
 */
export class AttractMode {
  private readonly renderer: Renderer
  private raf = 0
  private start = 0
  private running = false
  private session!: PlaySession
  private bot!: Bot
  private state!: FrameState
  private tempo!: TempoMap
  private songIndex = 1
  private end = 0
  private readonly down = [false, false, false, false, false]

  constructor(private readonly host: HTMLElement) {
    this.renderer = new Renderer(host)
    this.renderer.showHud = false
    this.load()
  }

  begin(): void {
    if (this.running) return
    this.running = true
    this.resize()
    window.addEventListener('resize', this.resize)
    this.start = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
  }

  private load(): void {
    const song = BUILTIN[this.songIndex % BUILTIN.length]
    const chart = builtinChart(song)
    const track = findTrack(chart, 'guitar', 'expert')!
    this.tempo = new TempoMap(chart.resolution, chart.tempos, chart.offset, chart.timeSignatures)
    this.session = new PlaySession(track, this.tempo, { scheme: 'tap', window: 0.075, ghostPenalty: false, canFail: false })
    this.bot = new Bot(this.session, 'tap')
    const last = track.notes[track.notes.length - 1]
    this.end = last ? last.time + 2 : 10
    this.state = {
      time: 0,
      beat: 0,
      lookahead: 1.3,
      notes: track.notes,
      status: this.session.status,
      starLive: new Uint8Array(track.notes.map((n) => (n.star ? 1 : 0))),
      sustaining: new Int32Array(OPEN_LANE + 1).fill(-1),
      down: this.down,
      lefty: false,
      beatLines: this.tempo.beatLines(this.end + 2),
      hud: {
        score: 0,
        multiplier: 1,
        multiplierProgress: 0,
        streak: 0,
        starMeter: 0,
        starActive: false,
        starReady: false,
        rock: null,
        progress: 0,
        solo: null,
      },
    }
    this.renderer.clearEffects()
  }

  private readonly frame = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)
    // Start a little way in, where the notes are already flowing.
    const time = (now - this.start) / 1000 + 2
    if (time > this.end) {
      this.songIndex++
      this.load()
      this.start = now
      return
    }
    this.bot.update(time)
    this.session.update(time)
    for (const e of this.session.drainEvents()) {
      if (e.type === 'hit') this.renderer.hit(e.mask, false, this.state.notes[e.note].star)
    }
    const s = this.state
    for (let lane = 0; lane <= OPEN_LANE; lane++) s.sustaining[lane] = this.session.sustains[lane]?.note ?? -1
    for (let lane = 0; lane < 5; lane++) this.down[lane] = this.session.isDown(lane)
    s.time = time
    s.beat = this.tempo.timeToBeat(time)
    s.hud.starActive = this.session.starActive
    this.renderer.frame(s, now)
  }

  private readonly resize = () => {
    const rect = this.host.getBoundingClientRect()
    this.renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height), { top: 0, right: 0, bottom: 0, left: 0 })
  }
}
